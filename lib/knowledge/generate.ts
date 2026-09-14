import { z } from "zod";
import {
  chat,
  recordUsage,
  resolveModelConfig,
  type ChatMessage,
  type ResolvedModelConfig,
} from "../ai/client";

/**
 * Page text → Q&A pairs, via the UTILITY model (this is bulk extraction, not
 * conversation — CLAUDE.md §6). One call per page: the live DM Champ account
 * turned 59 pages into 129 FAQs, so ~2 pairs per page is the shape to expect.
 *
 * The answers are what the agent will repeat to real customers, so the prompt
 * grounds them in the supplied text ONLY. A model that "helpfully" fills in
 * opening hours it invented produces an FAQ nobody ever reviews and a customer
 * who turns up to a closed shop.
 */

export interface GeneratedFaq {
  question: string;
  answer: string;
}

export interface GenerateOptions {
  maxPairs?: number;
  /**
   * Pass a config resolved once for the whole crawl. resolveModelConfig() hits
   * the database and decrypts a key; doing that 40 times per ingest is waste.
   */
  cfg?: ResolvedModelConfig;
  signal?: AbortSignal;
}

/** ~3k tokens of input per page. Beyond this the tail is nav junk and repeats. */
const MAX_INPUT_CHARS = 12_000;
const MAX_QUESTION_CHARS = 240;
const MAX_ANSWER_CHARS = 900;

const schema = z.object({
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
});

export async function generateFaqs(
  pageText: string,
  url: string,
  organizationId: string,
  opts: GenerateOptions = {},
): Promise<GeneratedFaq[]> {
  const maxPairs = Math.max(1, Math.min(opts.maxPairs ?? 6, 15));
  const text = pageText.trim().slice(0, MAX_INPUT_CHARS);
  if (text.length < 200) return [];

  const cfg = opts.cfg ?? (await resolveModelConfig(organizationId));

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You turn a business's own web page into question-and-answer pairs for its customer support AI.`,
        ``,
        `Rules:`,
        `- Use ONLY facts stated in the page text. Never add, infer or complete anything.`,
        `- Write the questions the way a CUSTOMER would ask them, not the way the page is titled.`,
        `- Each answer must stand alone. Do not write "see above", "as mentioned" or "on this page".`,
        `- Skip navigation, cookie notices, legal boilerplate and anything with no customer value.`,
        `- If the page says nothing useful to a customer, return an empty list. An empty list is a valid, correct answer.`,
        `- At most ${maxPairs} pairs. Fewer good ones beat padding.`,
        ``,
        `Reply with JSON only, no prose and no markdown fence:`,
        `{"faqs":[{"question":"...","answer":"..."}]}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: `Page URL: ${url}\n\nPage text:\n"""\n${text}\n"""`,
    },
  ];

  const result = await chat(cfg, {
    messages,
    model: cfg.utilityModel,
    temperature: 0.2, // extraction, not creativity
    maxTokens: 1200,
    signal: opts.signal,
  });

  // Usage is recorded before parsing: the call is billed whether or not the
  // model gave us usable JSON, and an ingest that silently costs money without
  // appearing in UsageRecord is how cost-per-conversation stops adding up.
  await recordUsage({ organizationId, kind: "crawl", result });

  return parseFaqs(result.content ?? "", maxPairs);
}

/**
 * Models wrap JSON in ```json fences, prepend "Here's the JSON:", and sometimes
 * return a bare array instead of the object they were asked for. All three are
 * routine, none is an error worth failing an ingest over.
 */
export function parseFaqs(raw: string, maxPairs: number): GeneratedFaq[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const json = extractJson(stripped);
  if (!json) {
    // Surface what the model actually said — "invalid JSON" alone is undebuggable.
    throw new Error(`FAQ generation returned no JSON: ${raw.slice(0, 200)}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `FAQ generation returned malformed JSON (${e instanceof Error ? e.message : e}): ${json.slice(0, 200)}`,
    );
  }

  const parsed = schema.safeParse(Array.isArray(value) ? { faqs: value } : value);
  if (!parsed.success) throw new Error(`FAQ generation returned an unexpected shape: ${json.slice(0, 200)}`);

  const seen = new Set<string>();
  const out: GeneratedFaq[] = [];

  for (const pair of parsed.data.faqs) {
    const question = collapse(pair.question).slice(0, MAX_QUESTION_CHARS);
    const answer = collapse(pair.answer).slice(0, MAX_ANSWER_CHARS);
    if (question.length < 5 || answer.length < 2) continue;

    // Models repeat near-identical questions across a long page; the duplicate
    // would burn prompt budget at retrieval time for nothing.
    const key = question.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ question, answer });
    if (out.length >= maxPairs) break;
  }

  return out;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** First balanced `{…}` or `[…]` in the text, ignoring braces inside strings. */
function extractJson(s: string): string | null {
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const open = s[start]!;
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return s.slice(start, i + 1);
  }

  return null; // truncated output (hit max_tokens mid-object)
}
