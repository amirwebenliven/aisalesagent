import type { Agent, Contact, Conversation, Faq, Message } from "@prisma/client";
import type { ChatMessage } from "./client";

/**
 * Prompt assembly.
 *
 * The section structure deliberately mirrors DM Champ's, because we watched it
 * work on a live account for three weeks and the structure is the reason it
 * behaves well: each concern is named and separate, so a non-developer can tune
 * one part without collapsing the rest.
 *
 * ORDERING IS LOAD-BEARING. Sections 1 and 2 are the cache prefix and must be
 * byte-identical between calls in a conversation. Put a timestamp, a random id,
 * or a re-ordered FAQ list in there and prompt caching silently stops working —
 * input cost jumps roughly 10x and nothing visibly breaks. See CLAUDE.md §5.
 */

const VERBATIM_TURNS = 20; // older turns live in conversation.summary

export interface BuildPromptArgs {
  agent: Agent;
  contact: Contact;
  conversation: Pick<Conversation, "summary">;
  /** Retrieved FAQs. MUST be passed in a stable order — see cache note above. */
  faqs: Pick<Faq, "question" | "answer">[];
  history: Pick<Message, "direction" | "body" | "createdAt">[];
  incoming: string;
  /** Names of live-data queries available for this tenant, for the awareness line. */
  dataQueryNames?: string[];
}

function section(title: string, body: string | null | undefined): string {
  const trimmed = body?.trim();
  return trimmed ? `## ${title}\n${trimmed}\n` : "";
}

/** Sections 1 + 2: stable across the whole conversation. The cache prefix. */
export function buildSystemPrompt(args: BuildPromptArgs): string {
  const { agent, faqs, dataQueryNames } = args;

  const parts = [
    section("Who you are", agent.persona),
    section("Your goal", agent.goal),
    section("About the business", agent.companyInfo),
    section("Rules you must follow", agent.rules),
    section("How the conversation should go", agent.conversationFlow),
    section("When to hand over to a human", agent.alertHumanWhen),
    section("When to end the conversation", agent.concludeWhen),
    section("Extra context", agent.extraContext),
  ];

  if (faqs.length) {
    const body = faqs
      .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
      .join("\n");
    parts.push(
      section(
        "Answers you can rely on",
        `These come from the business's own material. Prefer them over your own knowledge. ` +
          `If none of them covers the question, say you'll check rather than inventing an answer.\n\n${body}`,
      ),
    );
  }

  if (dataQueryNames?.length) {
    parts.push(
      section(
        "Live data",
        `You can look up current information from the business's own systems using these ` +
          `tools: ${dataQueryNames.join(", ")}. Use them instead of guessing whenever the ` +
          `customer asks about something that changes — stock, orders, bookings, prices.`,
      ),
    );
  }

  // Without this, models reliably *describe* the escalation in prose ("I'll
  // pass this to the team") and never call the function — so no human is ever
  // notified and the lead goes cold. Tested: gpt-4o-mini skips the tool
  // entirely unless told in imperative terms that saying it is not enough.
  parts.push(
    section(
      "Using your tools",
      [
        `You have functions available. Calling them is how anything actually happens —`,
        `describing an action in your reply does NOT perform it.`,
        ``,
        `When any situation under "When to hand over to a human" applies, you MUST call`,
        `alertHuman in the same turn. Saying "I'll pass this to the team" without calling`,
        `alertHuman means nobody is told and the customer is left waiting.`,
        ``,
        `When the customer gives a name, email or phone number, call captureContact`,
        `immediately, in the same turn.`,
        ``,
        `You may call a function and write a reply in the same turn. Do both.`,
      ].join("\n"),
    ),
  );

  parts.push(
    section(
      "How to write",
      [
        `Write in ${agent.primaryLanguage}, but reply in whatever language the customer writes in.`,
        `Keep messages short — the length a person actually types on WhatsApp.`,
        agent.splitMessages
          ? `Split a longer reply across up to ${agent.maxRepliesPerTurn} short messages by putting "---" on its own line between them.`
          : `Reply with a single message.`,
        `Never mention that you are an AI unless you are directly asked.`,
        `Never invent prices, dates, stock or policies. If you don't know, say you'll find out.`,
        `Ask one question at a time.`,
      ].join("\n"),
    ),
  );

  return parts.filter(Boolean).join("\n");
}

/** Sections 3-5: the per-turn tail, after the cache prefix. */
export function buildMessages(args: BuildPromptArgs): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(args) },
  ];

  const who = [
    args.contact.name ? `Name: ${args.contact.name}` : null,
    args.contact.email ? `Email: ${args.contact.email}` : null,
    args.contact.phone ? `Phone: ${args.contact.phone}` : null,
    args.contact.tags.length ? `Tags: ${args.contact.tags.join(", ")}` : null,
    args.contact.notes ? `Notes: ${args.contact.notes}` : null,
  ].filter(Boolean);

  if (who.length) {
    messages.push({ role: "system", content: `Who you're talking to:\n${who.join("\n")}` });
  }

  if (args.conversation.summary) {
    messages.push({
      role: "system",
      content: `Earlier in this conversation:\n${args.conversation.summary}`,
    });
  }

  for (const m of args.history.slice(-VERBATIM_TURNS)) {
    messages.push({
      role: m.direction === "INBOUND" ? "user" : "assistant",
      content: m.body,
    });
  }

  messages.push({ role: "user", content: args.incoming });
  return messages;
}

/** Split an assistant reply into the bubbles the customer actually receives. */
export function splitReply(text: string, max: number): string[] {
  const parts = text
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  return (parts.length ? parts : [text.trim()]).slice(0, max);
}

/** Human-like pause before the first bubble, so replies don't land instantly. */
export function replyDelayMs(agent: Pick<Agent, "replyDelayMinMs" | "replyDelayMaxMs">): number {
  const { replyDelayMinMs: min, replyDelayMaxMs: max } = agent;
  return max <= min ? min : min + Math.floor(Math.random() * (max - min));
}
