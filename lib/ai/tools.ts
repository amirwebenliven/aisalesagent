import { z } from "zod";
import { JobKind } from "@prisma/client";
import { prisma } from "../db";
import type { ToolDef } from "./client";

/**
 * The tool registry — what the agent can actually DO. This is where the product
 * stops being a chatbot (CLAUDE.md §8).
 *
 * Two rules hold for every tool here:
 *
 * 1. TENANT SCOPE IS NOT OPTIONAL. The model supplies the arguments; the caller
 *    supplies the organizationId. Every write goes through a where clause that
 *    carries it, so a hallucinated id can never reach another tenant's row.
 * 2. A TOOL NEVER THROWS INTO THE LOOP. Bad arguments come back as a plain
 *    sentence the model can read and correct. Throwing would abort the turn and
 *    leave a real customer with silence — the one outcome worse than a wrong
 *    answer.
 */

export interface ToolContext {
  organizationId: string;
  conversationId?: string;
  contactId?: string;
  /**
   * Try-it-out sandbox. Validate and describe, write nothing: the playground
   * must never flip a live conversation to HUMAN_ACTIVE or edit a real contact.
   */
  dryRun?: boolean;
}

interface ToolImpl<S extends z.ZodTypeAny = z.ZodTypeAny> {
  def: ToolDef;
  schema: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<string>;
}

function defineTool<S extends z.ZodTypeAny>(t: ToolImpl<S>): ToolImpl {
  return t as unknown as ToolImpl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Contacts are the only place we have to hang a note on, and notes grow forever. */
const MAX_NOTES_CHARS = 4000;

async function appendContactNote(
  organizationId: string,
  contactId: string,
  line: string,
): Promise<boolean> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true, notes: true },
  });
  if (!contact) return false;

  const stamped = `[${new Date().toISOString()}] ${line}`;
  // Newest first, then truncate the tail: cutting the OLDEST note is the only
  // safe end to lose, and it keeps whole lines rather than half a sentence.
  const notes = [stamped, contact.notes].filter(Boolean).join("\n").slice(0, MAX_NOTES_CHARS);

  await prisma.contact.update({ where: { id: contact.id }, data: { notes } });
  return true;
}

async function orgTimezone(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return org?.timezone ?? "UTC";
}

/** A confirmation in the wrong timezone is worse than no confirmation. */
function formatWhen(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString(); // an unknown IANA zone must not cost us the booking
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─────────────────────────────────────────────────────────────────────────────
// The tools
// ─────────────────────────────────────────────────────────────────────────────

const alertHuman = defineTool({
  def: {
    type: "function",
    function: {
      name: "alertHuman",
      description:
        "Hand this conversation to a human colleague and stop replying. Call this when the " +
        "customer asks for a person, asks for a price or a delivery commitment, raises a " +
        "complaint, or describes a safety-critical, medical or food-contact application. " +
        "Saying you will pass it on does NOT pass it on — only this call does.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why a human is needed, in one sentence, for the colleague picking it up.",
          },
          urgency: { type: "string", enum: ["low", "normal", "high"] },
        },
        required: ["reason"],
      },
    },
  },
  schema: z.object({
    reason: z.string().trim().min(1),
    urgency: z.enum(["low", "normal", "high"]).default("normal"),
  }),
  async run({ reason, urgency }, ctx) {
    if (ctx.dryRun) {
      return `(sandbox) A human would be alerted (${urgency}) and the conversation would move to HUMAN_ACTIVE. Reason: ${reason}`;
    }
    if (!ctx.conversationId) {
      return "Error: alertHuman — there is no conversation in context, so no colleague could be notified. Tell the customer you cannot hand over right now.";
    }

    const convo = await prisma.conversation.findFirst({
      where: { id: ctx.conversationId, organizationId: ctx.organizationId },
      select: { id: true, contactId: true },
    });
    if (!convo) return "Error: alertHuman — conversation not found.";

    await prisma.conversation.update({
      where: { id: convo.id },
      data: { state: "HUMAN_ACTIVE" },
    });

    // The escalation record lives as a note on the Contact, not a ScheduledJob:
    // a handover is history, not future work, and it has to be readable next to
    // the person in the inbox.
    await appendContactNote(ctx.organizationId, convo.contactId, `Handover (${urgency}): ${reason}`);

    return `A human colleague has been alerted (${urgency}) and this conversation is now theirs. Tell the customer briefly that someone will pick it up, then stop.`;
  },
});

const captureContact = defineTool({
  def: {
    type: "function",
    function: {
      name: "captureContact",
      description:
        "Save the customer's name, email address or phone number the moment they give it. " +
        "Send only the fields you actually heard — omit the rest.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Their name as they gave it" },
          email: { type: "string" },
          phone: { type: "string", description: "Include the country code if they gave one" },
        },
      },
    },
  },
  schema: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  async run(args, ctx) {
    const name = args.name?.trim();
    const email = args.email?.trim();
    const phone = args.phone?.trim();

    if (!name && !email && !phone) {
      return "Error: captureContact — nothing to save. Send at least one of name, email or phone.";
    }
    if (ctx.dryRun) {
      return `(sandbox) Would save ${[name && `name "${name}"`, email && `email ${email}`, phone && `phone ${phone}`].filter(Boolean).join(", ")}.`;
    }
    if (!ctx.contactId) return "Error: captureContact — there is no contact in context.";

    const contact = await prisma.contact.findFirst({
      where: { id: ctx.contactId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!contact) return "Error: captureContact — contact not found.";

    // Only non-empty values are written, so a model that helpfully sends
    // `email: ""` alongside a name cannot wipe an address we already have. A
    // non-empty value DOES overwrite — customers correct their own details.
    const data: { name?: string; email?: string; phone?: string } = {};
    const saved: string[] = [];
    const skipped: string[] = [];

    if (name) {
      data.name = name;
      saved.push(`name "${name}"`);
    }
    if (email) {
      if (EMAIL_RE.test(email)) {
        data.email = email;
        saved.push(`email ${email}`);
      } else {
        // Rejecting the whole call would throw away the name too.
        skipped.push(`"${email}" does not look like an email address — ask them to repeat it`);
      }
    }
    if (phone) {
      data.phone = phone;
      saved.push(`phone ${phone}`);
    }

    if (Object.keys(data).length) {
      await prisma.contact.update({ where: { id: contact.id }, data });
    }

    const parts = [saved.length ? `Saved ${saved.join(", ")}.` : "Nothing saved."];
    if (skipped.length) parts.push(skipped.join("; ") + ".");
    return parts.join(" ");
  },
});

const tagContact = defineTool({
  def: {
    type: "function",
    function: {
      name: "tagContact",
      description:
        "Label this customer so the team can find them later — the product they asked about, " +
        "their industry, or how warm the lead is. Short lowercase words, e.g. " +
        '["chrome-plating", "hot-lead"].',
      parameters: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, description: "One to five labels" },
        },
        required: ["tags"],
      },
    },
  },
  schema: z.object({ tags: z.array(z.string()).min(1).max(10) }),
  async run({ tags }, ctx) {
    // Normalised, because "Hot Lead", "hot lead" and "hot-lead" are one tag to a
    // human and three to a filter.
    const incoming = [
      ...new Set(
        tags
          .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
          .filter((t) => t.length > 0 && t.length <= 40),
      ),
    ];
    if (!incoming.length) return "Error: tagContact — no usable tags after trimming.";
    if (ctx.dryRun) return `(sandbox) Would tag the contact: ${incoming.join(", ")}.`;
    if (!ctx.contactId) return "Error: tagContact — there is no contact in context.";

    const contact = await prisma.contact.findFirst({
      where: { id: ctx.contactId, organizationId: ctx.organizationId },
      select: { id: true, tags: true },
    });
    if (!contact) return "Error: tagContact — contact not found.";

    const added = incoming.filter((t) => !contact.tags.includes(t));
    if (!added.length) return `Already tagged: ${incoming.join(", ")}. Nothing to add.`;

    await prisma.contact.update({
      where: { id: contact.id },
      data: { tags: [...contact.tags, ...added].slice(0, 25) },
    });
    return `Tagged: ${added.join(", ")}.`;
  },
});

const scheduleFollowUp = defineTool({
  def: {
    type: "function",
    function: {
      name: "scheduleFollowUp",
      description:
        "Arrange to message this customer again later — when they say they will decide next " +
        "week, or go quiet mid-enquiry. Nothing is sent now; the message goes out when the " +
        "delay is up.",
      parameters: {
        type: "object",
        properties: {
          delayHours: { type: "number", description: "Hours from now, e.g. 24 for tomorrow" },
          message: {
            type: "string",
            description: "What to send. Leave out and a colleague will decide.",
          },
        },
        required: ["delayHours"],
      },
    },
  },
  schema: z.object({
    delayHours: z.number().positive().max(24 * 30),
    message: z.string().trim().min(1).optional(),
  }),
  async run({ delayHours, message }, ctx) {
    const runAt = new Date(Date.now() + delayHours * 3_600_000);
    if (ctx.dryRun) {
      return `(sandbox) Would schedule a follow-up for ${runAt.toISOString()}${message ? `: "${message}"` : ""}.`;
    }
    if (!ctx.conversationId) {
      return "Error: scheduleFollowUp — there is no conversation in context.";
    }

    const convo = await prisma.conversation.findFirst({
      where: { id: ctx.conversationId, organizationId: ctx.organizationId },
      select: { id: true, contactId: true },
    });
    if (!convo) return "Error: scheduleFollowUp — conversation not found.";

    await prisma.scheduledJob.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: convo.id,
        kind: JobKind.FOLLOW_UP,
        runAt,
        payload: { message: message ?? null, contactId: convo.contactId },
      },
    });

    return `Follow-up scheduled for ${formatWhen(runAt, await orgTimezone(ctx.organizationId))}.`;
  },
});

const bookMeeting = defineTool({
  def: {
    type: "function",
    function: {
      name: "bookMeeting",
      description:
        "Book a call with a consultant once the customer has agreed a time. Confirm the time " +
        "with them first — this creates the booking, it does not ask.",
      parameters: {
        type: "object",
        properties: {
          startsAt: {
            type: "string",
            description: "Start time as an ISO 8601 timestamp, e.g. 2026-09-18T10:30:00Z",
          },
          durationMins: { type: "number", description: "Defaults to 30" },
          notes: { type: "string", description: "What the call is about, for the consultant" },
        },
        required: ["startsAt"],
      },
    },
  },
  schema: z.object({
    startsAt: z.string(),
    durationMins: z.number().int().positive().max(480).default(30),
    notes: z.string().trim().min(1).optional(),
  }),
  async run({ startsAt, durationMins, notes }, ctx) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      return `Error: bookMeeting — "${startsAt}" is not a valid date. Use an ISO 8601 timestamp such as 2026-09-18T10:30:00Z.`;
    }
    if (when.getTime() < Date.now()) {
      return `Error: bookMeeting — ${startsAt} is in the past. Ask the customer for a future time.`;
    }

    const tz = ctx.dryRun ? "UTC" : await orgTimezone(ctx.organizationId);
    const pretty = formatWhen(when, tz);

    if (ctx.dryRun) {
      return `(sandbox) Would book ${durationMins} minutes at ${pretty} (UTC).`;
    }
    if (!ctx.conversationId) return "Error: bookMeeting — there is no conversation in context.";

    const convo = await prisma.conversation.findFirst({
      where: { id: ctx.conversationId, organizationId: ctx.organizationId },
      select: { id: true, contactId: true },
    });
    if (!convo) return "Error: bookMeeting — conversation not found.";

    // A REMINDER job is the whole booking for now. Google Calendar needs OAuth
    // into the BUSINESS's account plus Google app verification for the sensitive
    // calendar.events scope (CLAUDE.md §8/§9) — weeks of review, so the real
    // event lands later and this row is what it will be created from.
    await prisma.scheduledJob.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: convo.id,
        kind: JobKind.REMINDER,
        runAt: when,
        payload: {
          startsAt: when.toISOString(),
          durationMins,
          notes: notes ?? null,
          contactId: convo.contactId,
        },
      },
    });

    if (notes) {
      await appendContactNote(
        ctx.organizationId,
        convo.contactId,
        `Meeting booked ${when.toISOString()} (${durationMins}m): ${notes}`,
      );
    }

    return `Booked: ${durationMins} minutes at ${pretty}. Confirm that time back to the customer in your reply.`;
  },
});

// Order is fixed on purpose — the tool list is part of the prompt prefix that
// providers cache, and a re-ordered list silently stops matching (CLAUDE.md §5).
const REGISTRY: Record<string, ToolImpl> = {
  alertHuman,
  captureContact,
  tagContact,
  scheduleFollowUp,
  bookMeeting,
};

const TOOL_ORDER = ["alertHuman", "captureContact", "tagContact", "scheduleFollowUp", "bookMeeting"];

export interface ToolDefOptions {
  /** Drop tools by name — an agent with no calendar has no business booking one. */
  exclude?: string[];
  /**
   * Extra definitions to append, e.g. the tenant's own DataQuery rows turned
   * into tools. Their execution is the caller's job; executeTool only knows
   * about the built-ins.
   */
  extra?: ToolDef[];
}

export function getToolDefs(opts: ToolDefOptions = {}): ToolDef[] {
  const exclude = new Set(opts.exclude ?? []);
  const defs = TOOL_ORDER.filter((n) => !exclude.has(n)).map((n) => REGISTRY[n]!.def);
  return opts.extra?.length ? [...defs, ...opts.extra] : defs;
}

export function isBuiltinTool(name: string): boolean {
  return name in REGISTRY;
}

function formatIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/**
 * Run one tool call. `args` is whatever the model produced — the raw JSON string
 * from a tool_call, or an already-parsed object.
 *
 * Always resolves to a string, which becomes the `tool` message the model reads
 * next. Never rejects for anything the model got wrong.
 */
export async function executeTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
): Promise<string> {
  const tool = REGISTRY[name];
  if (!tool) {
    return `Error: there is no tool called "${name}". Available: ${TOOL_ORDER.join(", ")}.`;
  }

  let raw: unknown = args;
  if (typeof raw === "string") {
    const text = raw.trim();
    // Models routinely send "" for a no-argument call; that is an empty object.
    if (!text) raw = {};
    else {
      try {
        raw = JSON.parse(text);
      } catch {
        return `Error: ${name} — arguments were not valid JSON. Send a JSON object.`;
      }
    }
  }
  if (raw === null || typeof raw !== "object") raw = {};

  const parsed = tool.schema.safeParse(raw);
  if (!parsed.success) {
    return `Error: ${name} — ${formatIssues(parsed.error)}. Fix the arguments and call it again.`;
  }

  return tool.run(parsed.data, ctx);
}
