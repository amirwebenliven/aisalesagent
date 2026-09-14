import { prisma } from "../db";
import { decrypt } from "../crypto";
import { env } from "../env";

// An OpenAI-compatible chat client. MeshAPI speaks this format, and so does
// every provider a tenant is likely to bring, so BYOK costs us no extra code.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface Usage {
  promptTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage: Usage;
  model: string;
  byok: boolean;
}

/** Which credentials and models this tenant runs on. */
export interface ResolvedModelConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  utilityModel: string;
  byok: boolean;
}

/**
 * A tenant that supplied its own key overrides the platform entirely — their
 * key, their base URL, their models, their bill.
 */
export async function resolveModelConfig(organizationId: string): Promise<ResolvedModelConfig> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      modelBaseUrl: true,
      modelApiKeyEnc: true,
      modelChat: true,
      modelUtility: true,
    },
  });

  if (org.modelApiKeyEnc) {
    return {
      baseUrl: org.modelBaseUrl || env.MESHAPI_BASE_URL,
      apiKey: decrypt(org.modelApiKeyEnc),
      chatModel: org.modelChat || env.MODEL_CHAT,
      utilityModel: org.modelUtility || env.MODEL_UTILITY,
      byok: true,
    };
  }

  if (!env.MESHAPI_KEY) {
    throw new Error(
      `No model credentials: org ${organizationId} has no key of its own and MESHAPI_KEY is unset.`,
    );
  }

  return {
    baseUrl: env.MESHAPI_BASE_URL,
    apiKey: env.MESHAPI_KEY,
    chatModel: org.modelChat || env.MODEL_CHAT,
    utilityModel: org.modelUtility || env.MODEL_UTILITY,
    byok: false,
  };
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolDef[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function chat(cfg: ResolvedModelConfig, opts: ChatOptions): Promise<ChatResult> {
  const model = opts.model ?? cfg.chatModel;

  // OpenRouter attributes traffic by these two headers; other OpenAI-compatible
  // gateways ignore them, so they are harmless to always send.
  const attribution: Record<string, string> = cfg.baseUrl.includes("openrouter.ai")
    ? {
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "Agent Platform",
      }
    : {};

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...attribution,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    // Surface the provider's own message. Replacing it with "something went
    // wrong" is how a rate limit gets misdiagnosed as an outage.
    const detail = await res.text().catch(() => "");
    throw new Error(`Model call failed (${res.status} ${model}): ${detail.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      cached_tokens?: number;
    };
  };

  const choice = json.choices?.[0];
  if (!choice) throw new Error(`Model returned no choices (${model})`);

  const u = json.usage ?? {};
  return {
    content: choice.message.content,
    toolCalls: choice.message.tool_calls ?? [],
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      // Providers disagree on where this lives; check both spellings.
      cachedTokens: u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
    },
    model,
    byok: cfg.byok,
  };
}

/**
 * Record what a call cost. Append-only — this is how "what does a conversation
 * cost?" gets answered, which is the question the business model rests on.
 *
 * Rates are per 1M tokens and MUST be kept current; see CLAUDE.md §6.
 */
const RATES: Record<string, { in: number; cached: number; out: number }> = {
  "minimax-m3": { in: 0.3, cached: 0.03, out: 1.2 },
  "kimi-k2.6": { in: 0.6, cached: 0.15, out: 2.5 },
  "qwen3.7-flash": { in: 0.03, cached: 0.003, out: 0.13 },
  "qwen3.5-flash": { in: 0.1, cached: 0.01, out: 0.4 },
  "deepseek-v4-flash": { in: 0.12, cached: 0.012, out: 0.35 },
  "glm-5.3-flash": { in: 0.15, cached: 0.015, out: 0.5 },
  // OpenRouter slugs used during development
  "openai/gpt-4o-mini": { in: 0.15, cached: 0.075, out: 0.6 },
  "openai/gpt-4o": { in: 2.5, cached: 1.25, out: 10 },
  "google/gemini-2.5-flash-lite": { in: 0.1, cached: 0.01, out: 0.4 },
  "qwen/qwen3-flash": { in: 0.1, cached: 0.01, out: 0.4 },
};

export function estimateCostUsd(model: string, usage: Usage): number {
  const r = RATES[model];
  if (!r) return 0; // unknown model — log 0 rather than guess wrong
  const freshIn = Math.max(0, usage.promptTokens - usage.cachedTokens);
  return (
    (freshIn * r.in + usage.cachedTokens * r.cached + usage.outputTokens * r.out) / 1_000_000
  );
}

export async function recordUsage(params: {
  organizationId: string;
  conversationId?: string;
  kind: "chat" | "utility" | "embedding" | "crawl";
  result: ChatResult;
}): Promise<number> {
  const costUsd = params.result.byok ? 0 : estimateCostUsd(params.result.model, params.result.usage);

  await prisma.usageRecord.create({
    data: {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      kind: params.kind,
      model: params.result.model,
      promptTokens: params.result.usage.promptTokens,
      cachedTokens: params.result.usage.cachedTokens,
      outputTokens: params.result.usage.outputTokens,
      costUsd,
      byok: params.result.byok,
    },
  });

  return costUsd;
}
