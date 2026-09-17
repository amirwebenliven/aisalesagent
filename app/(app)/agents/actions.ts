"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentOrg } from "@/lib/tenant";
import type { ActionState } from "@/components/ui/action-state";

/**
 * Agent mutations. The agent id comes from the form, the organization comes
 * from the session — every write is an updateMany with both in the WHERE, so an
 * id belonging to another tenant updates nothing rather than their agent.
 */

/** Trimmed, because " " is a truthy string and would pass every emptiness check. */
function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const TIMING_LABEL: Record<string, string> = {
  replyDelayMinMs: "Minimum reply delay",
  replyDelayMaxMs: "Maximum reply delay",
  maxRepliesPerTurn: "Max bubbles per turn",
};

const Timing = z.object({
  // 10 minutes is already absurd for a reply delay; the cap exists so a typo of
  // an extra zero cannot park a customer's answer for a day.
  replyDelayMinMs: z.coerce.number().int().min(0).max(600_000),
  replyDelayMaxMs: z.coerce.number().int().min(0).max(600_000),
  maxRepliesPerTurn: z.coerce.number().int().min(1).max(6),
});

function issues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const key = i.path.join(".");
      // The field label the person is looking at, not the column name.
      return key ? `${TIMING_LABEL[key] ?? key}: ${i.message}` : i.message;
    })
    .join("; ");
}

export async function saveAgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  if (!id) return { ok: false, error: "Missing agent id." };

  const name = text(formData, "name");
  if (!name) return { ok: false, error: "Give the agent a name." };

  const rawTiming = {
    replyDelayMinMs: text(formData, "replyDelayMinMs"),
    replyDelayMaxMs: text(formData, "replyDelayMaxMs"),
    maxRepliesPerTurn: text(formData, "maxRepliesPerTurn"),
  };
  // Checked before coercion: Number("") is 0, so an emptied box would save as a
  // zero delay instead of telling anyone it was blank.
  const blank = Object.entries(rawTiming).find(([, v]) => v === "");
  if (blank) return { ok: false, error: `${TIMING_LABEL[blank[0]]} cannot be empty.` };

  const timing = Timing.safeParse(rawTiming);
  if (!timing.success) return { ok: false, error: issues(timing.error) };
  if (timing.data.replyDelayMinMs > timing.data.replyDelayMaxMs) {
    return { ok: false, error: "The minimum reply delay is larger than the maximum." };
  }

  const org = await currentOrg();
  const { count } = await prisma.agent.updateMany({
    where: { id, organizationId: org.id },
    data: {
      name,
      persona: text(formData, "persona"),
      goal: text(formData, "goal"),
      companyInfo: text(formData, "companyInfo"),
      rules: text(formData, "rules"),
      conversationFlow: text(formData, "conversationFlow"),
      alertHumanWhen: text(formData, "alertHumanWhen"),
      concludeWhen: text(formData, "concludeWhen"),
      // Optional columns: empty means "unset", not an empty string the prompt
      // builder would render as a blank section.
      extraContext: text(formData, "extraContext") || null,
      modelOverride: text(formData, "modelOverride") || null,
      primaryLanguage: text(formData, "primaryLanguage") || "en",
      splitMessages: formData.get("splitMessages") !== null,
      ...timing.data,
    },
  });
  if (!count) return { ok: false, error: "Agent not found." };

  revalidatePath(`/agents/${id}`);
  revalidatePath("/agents");
  return { ok: true, message: "Saved." };
}

const STARTER = {
  persona:
    "You are the first responder for this business. You are warm, brief and never pushy. " +
    "You write the way a helpful colleague texts: short sentences, no corporate padding, no emoji unless the customer uses them first.",
  goal:
    "Understand what the person needs, answer it from what you know, and get them to the next step — " +
    "a quote, a call, or a human — without making them repeat themselves.",
  companyInfo: "What the business sells, who buys it, and what makes it credible. Fill this in.",
  rules:
    "Never invent a price, a delivery date or a product you are not certain about.\n" +
    "Never promise anything a human has not agreed to.\n" +
    "If you do not know, say so and offer to find out.",
  conversationFlow:
    "1. Greet them and ask what they are looking for.\n" +
    "2. Ask one question at a time until you understand the need.\n" +
    "3. Answer from the knowledge base.\n" +
    "4. Offer the next step.",
  alertHumanWhen:
    "They ask for a price you cannot confirm, they are unhappy, they ask for a human, " +
    "or the conversation has gone round twice without progress.",
  concludeWhen: "They have what they came for, or a human has taken over.",
};

export async function createAgent(): Promise<ActionState> {
  const org = await currentOrg();

  const count = await prisma.agent.count({ where: { organizationId: org.id } });
  const agent = await prisma.agent.create({
    data: {
      organizationId: org.id,
      name: count === 0 ? "First agent" : `New agent ${count + 1}`,
      ...STARTER,
      // Paused on creation. An agent whose instructions are still placeholder
      // text must not be one channel assignment away from answering a customer.
      isActive: false,
    },
  });

  revalidatePath("/agents");
  // Outside any try/catch — redirect() works by throwing NEXT_REDIRECT.
  redirect(`/agents/${agent.id}`);
}

export async function setAgentActive(agentId: string, isActive: boolean): Promise<ActionState> {
  const org = await currentOrg();
  const { count } = await prisma.agent.updateMany({
    where: { id: agentId, organizationId: org.id },
    data: { isActive },
  });
  if (!count) return { ok: false, error: "Agent not found." };

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
  return { ok: true, message: isActive ? "Agent is live." : "Agent paused — it will not answer." };
}
