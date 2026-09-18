import type { Agent, Contact, Conversation, Message } from "@prisma/client";
import type { ChatMessage } from "./client";

/**
 * Prompt assembly.
 *
 * The section structure deliberately mirrors DM Champ's, because we watched it
 * work on a live account for three weeks and the structure is the reason it
 * behaves well: each concern is named and separate, so a non-developer can tune
 * one part without collapsing the rest.
 *
 * ORDERING IS LOAD-BEARING. The FIRST system message — agent instructions, the
 * tools guidance, "How to write" — is the cache prefix and must be byte-identical
 * between calls in a conversation. Put a timestamp, a random id or anything
 * per-turn in there and prompt caching silently stops working — input cost
 * jumps roughly 10x and nothing visibly breaks.
 *
 * The retrieved knowledge (section 2) is a SEPARATE system message right after
 * it, deliberately outside the prefix. CLAUDE.md §5 describes sections 1 and 2
 * together as the prefix; that held while retrieval searched only the incoming
 * message, which rarely changes the FAQ set between turns. Retrieval now reads
 * the last few turns as well (lib/ai/agent.ts buildRetrievalQuery), so the set
 * legitimately shifts as the conversation moves — and with the FAQs inside the
 * first message, every shift threw away the cached instructions too. Split, the
 * instructions stay cached whatever retrieval does, and when the FAQ set does
 * repeat, the cache simply extends over it. §5 should be read with that
 * narrowing.
 */

const VERBATIM_TURNS = 20; // older turns live in conversation.summary

/**
 * What the prompt needs from an FAQ. Its own shape, not Pick<Faq, …>: the
 * retrieval layer's RetrievedFaq and the scripts' plain selects both satisfy it
 * structurally, and prompt assembly does not need to know about Prisma.
 *
 * sourceUrl is the page the pair was crawled from — for a shop, the product
 * page. imageUrl is the product photo the knowledge layer attached. Both are
 * printed so the model knows it HAS a link and a picture to offer; before they
 * were printed, every row carried a sourceUrl and the model still told
 * customers it could not send links.
 */
export interface PromptFaq {
  question: string;
  answer: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  /**
   * Retrieval score. 0 means "matched nothing, offered as background" (the
   * house fallback in lib/ai/agent.ts); the knowledge header changes when every
   * row says so. Absent on plain selects, which read as ranked.
   */
  score?: number;
}

/** A history row. mediaUrl marks a photo the agent sent — replayed as a note. */
export type PromptHistoryItem = Pick<Message, "direction" | "body" | "createdAt"> & {
  mediaUrl?: string | null;
};

export interface BuildPromptArgs {
  agent: Agent;
  contact: Contact;
  conversation: Pick<Conversation, "summary">;
  /** Retrieved FAQs, in retrieval order — see lib/knowledge/retrieve.ts for why the order is stable. */
  faqs: PromptFaq[];
  history: PromptHistoryItem[];
  incoming: string;
  /** Names of live-data queries available for this tenant, for the awareness line. */
  dataQueryNames?: string[];
}

function section(title: string, body: string | null | undefined): string {
  const trimmed = body?.trim();
  return trimmed ? `## ${title}\n${trimmed}\n` : "";
}

/**
 * Section 1: stable across the whole conversation. The cache prefix. Nothing
 * per-turn may go in here — the knowledge block is buildKnowledgePrompt below.
 */
export function buildSystemPrompt(args: BuildPromptArgs): string {
  const { agent, dataQueryNames } = args;

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
        `When the customer asks to see something or for a photo, call sendImage with the`,
        `Image URL listed with the answer you are using, and say you are sending it.`,
        ``,
        `You may call a function and write a reply in the same turn. Do both.`,
      ].join("\n"),
    ),
  );

  // "If you don't know, say you'll find out" was the old rule, and it taught
  // the model to promise things it has no tool for: a real customer was told
  // "let me check the price, please hold on" three times by an agent that
  // cannot check anything, then escalated. Every "hold on" is a lie by
  // construction here — the model either has the answer in front of it or it
  // does not, and there is no later.
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
        `Prices, sizes, stock and policies that appear in "Answers you can rely on" are facts: quote them verbatim and confidently.`,
        `When asked for a link or where to buy, give the Link from the answer you used — as a plain URL, never markdown, because chat apps show the brackets.`,
        `When asked for a photo, call sendImage with that answer's Image URL and say you are sending it. A Link is a page, not a photo; if the answer has no Image, say you have no photo and give the Link.`,
        `NEVER write "hold on", "let me check", "I'll find out" or anything like it — you cannot look anything up unless you have a tool for it, and there is no later.`,
        `If the answer is genuinely not in your knowledge, say so plainly, and if the handover rules apply, call alertHuman.`,
        `Never invent prices, dates, stock or policies.`,
        `Ask one question at a time.`,
      ].join("\n"),
    ),
  );

  return parts.filter(Boolean).join("\n");
}

/**
 * Section 2: the retrieved knowledge, as its own system message. Varies per
 * turn, which is exactly why it is not inside buildSystemPrompt (see the header).
 *
 * Link and Image lines are printed only when present, so the model never sees
 * "Link: null" and learns to type it.
 */
export function buildKnowledgePrompt(faqs: PromptFaq[]): string | null {
  if (!faqs.length) return null;

  const body = faqs
    .map((f, i) => {
      const lines = [`${i + 1}. Q: ${f.question}`, `   A: ${f.answer}`];
      if (f.sourceUrl) lines.push(`   Link: ${f.sourceUrl}`);
      if (f.imageUrl) lines.push(`   Image: ${f.imageUrl}`);
      return lines.join("\n");
    })
    .join("\n");

  // Every row at score 0 is the house fallback: nothing matched, and these are
  // the business's most-used answers offered as background. Under the normal
  // "quote these confidently" header a small model quotes a saree's price for
  // the toothbrush kit; the header has to say what these rows are.
  const background = faqs.every((f) => f.score === 0);

  const intro = background
    ? [
        `None of these answers matched the customer's question. They are background about the business, not answers to it.`,
        `Do not quote a price, size, stock figure or policy from them for anything they do not name.`,
        `If the question is not covered, say plainly that you do not have that information — do not promise to check.`,
        `An answer's Link may still be given when the customer asks where to buy. Only an Image line is a photo — a Link is not.`,
      ]
    : [
        `These come from the business's own material. Prefer them over your own knowledge.`,
        `Prices, sizes, stock and policies written here are facts you may quote verbatim and confidently.`,
        `An answer's Link is the page to give when the customer asks for a link or where to buy. Give it as a plain URL.`,
        `An answer's Image is the photo to send with sendImage when the customer asks to see it. Only an Image line is a photo — a Link is not.`,
        `If none of these covers the question, say plainly that you do not have that information — do not promise to check.`,
      ];

  return section("Answers you can rely on", [...intro, ``, body].join("\n"));
}

/**
 * The full message list: section 1 (cached), section 2 (knowledge, per turn),
 * then sections 3-5 — contact, summary, history, the new message.
 */
export function buildMessages(args: BuildPromptArgs): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(args) },
  ];

  const knowledge = buildKnowledgePrompt(args.faqs);
  if (knowledge) messages.push({ role: "system", content: knowledge });

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
    // A photo row's body is its caption, often empty. An assistant message with
    // empty content is rejected outright by some OpenAI-compatible providers
    // (a 400 on an empty text part), and where it is accepted the model cannot
    // tell it already sent a picture — so the photo is replayed as a note, and
    // a row with nothing at all in it is skipped rather than sent blank.
    const body = m.body.trim();
    const photo = m.mediaUrl ? `[sent photo: ${m.mediaUrl}]` : "";
    const content = [body, photo].filter(Boolean).join("\n");
    if (!content) continue;
    messages.push({
      role: m.direction === "INBOUND" ? "user" : "assistant",
      content,
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
