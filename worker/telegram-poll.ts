/**
 * Telegram long polling — the development path when there is no public HTTPS URL.
 *
 * Telegram only PUSHES to a public https endpoint, so on http://localhost there
 * is nothing it can call. `getUpdates` is the documented alternative: we pull.
 * No tunnel, no account, no inbound port.
 *
 * It feeds the SAME persist → dispatch pipeline the webhook route uses, so the
 * agent, dedup, handover rules and cost accounting behave identically in dev and
 * production. The only thing that changes is how the update arrives.
 *
 * This runs INSIDE the worker process on purpose. With Redis down the queue
 * degrades to in-process execution, which means only the process that registered
 * the inbound processor can actually run a job — so polling from anywhere else
 * would persist messages that nothing ever answers.
 */
import type { ChannelConnection } from "@prisma/client";
import { prisma } from "../lib/db";
import { dispatchInbound, persistInbound, telegramAdapter } from "../lib/channels";
import { telegramCredentials } from "../lib/channels/telegram";

const API = "https://api.telegram.org/bot";

/** Telegram holds the request open this long when there is nothing new. */
const LONG_POLL_SECONDS = 25;

/** How often we look for newly connected bots. */
const RESCAN_MS = 15_000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

interface TgUpdate {
  update_id: number;
  [k: string]: unknown;
}

async function tg<T>(token: string, method: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) {
    const err = new Error(json.description ?? `Telegram ${method} failed`) as Error & { code?: number };
    err.code = json.error_code;
    throw err;
  }
  return json.result as T;
}

/** One poller per connected bot. Lives until stop() is called. */
class BotPoller {
  private offset = 0;
  private stopped = false;
  private controller: AbortController | null = null;

  constructor(
    readonly connectionId: string,
    private readonly username: string,
  ) {}

  stop() {
    this.stopped = true;
    this.controller?.abort();
  }

  async run(): Promise<void> {
    log(`[telegram] polling @${this.username}`);

    while (!this.stopped) {
      let connection: ChannelConnection | null = null;
      try {
        connection = await prisma.channelConnection.findUnique({ where: { id: this.connectionId } });
        if (!connection || connection.status !== "ACTIVE") {
          log(`[telegram] @${this.username} is no longer active — stopping`);
          return;
        }

        const { botToken } = telegramCredentials(connection);
        this.controller = new AbortController();

        const updates = await tg<TgUpdate[]>(
          botToken,
          "getUpdates",
          {
            offset: this.offset || undefined,
            timeout: LONG_POLL_SECONDS,
            allowed_updates: ["message", "edited_message"],
          },
          this.controller.signal,
        );

        for (const update of updates) {
          // Advance PAST this update before handling it. Telegram only forgets
          // an update once a later offset is requested, so acknowledging first
          // means a message that makes handling throw cannot be redelivered in
          // an endless loop. persistInbound's unique providerId is what makes
          // this safe — a genuine redelivery is still deduped.
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handle(connection, update);
        }
      } catch (e) {
        if (this.stopped) return;

        const err = e as Error & { code?: number };

        if (err.code === 409) {
          // "terminated by other getUpdates request" or a webhook is still
          // registered — both mean something else owns this bot's updates.
          // Clearing the webhook is the fix for the second, and harmless for
          // the first, which resolves itself once the other poller exits.
          log(`[telegram] @${this.username}: 409 conflict — clearing webhook and retrying`);
          try {
            if (connection) {
              const { botToken } = telegramCredentials(connection);
              await tg(botToken, "deleteWebhook", { drop_pending_updates: false });
            }
          } catch {
            /* the retry below will surface it if it persists */
          }
          await sleep(3000);
          continue;
        }

        if (err.code === 401) {
          log(`[telegram] @${this.username}: token rejected — marking the channel FAILED`);
          await prisma.channelConnection.update({
            where: { id: this.connectionId },
            data: { status: "FAILED", lastErrorAt: new Date(), lastErrorMessage: "Telegram rejected the bot token (401). Reconnect with a fresh token." },
          });
          return;
        }

        // Network blip, Telegram hiccup. Back off rather than hammering.
        log(`[telegram] @${this.username}: ${err.message} — retrying in 5s`);
        await sleep(5000);
      }
    }
  }

  private async handle(connection: ChannelConnection, update: TgUpdate): Promise<void> {
    const msg = telegramAdapter.parseInbound(update);
    if (!msg) return; // joins, bot echoes, anything we do not answer

    const result = await persistInbound(connection, msg);
    if (result.deduped) {
      log(`[telegram] @${this.username}: duplicate ${msg.providerId} ignored`);
      return;
    }

    log(`[telegram] @${this.username} ← "${msg.text.slice(0, 80)}"`);

    if (!result.botShouldReply || !result.job) {
      log(`[telegram]   stored only — the AI is paused on this thread`);
      return;
    }

    const dispatch = await dispatchInbound(result.job);
    if (dispatch.mode === "dropped") {
      log(`[telegram]   DROPPED: ${dispatch.reason}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────

const running = new Map<string, BotPoller>();
let rescanTimer: ReturnType<typeof setInterval> | null = null;

async function rescan(): Promise<void> {
  const connections = await prisma.channelConnection.findMany({
    where: { kind: "TELEGRAM", status: "ACTIVE" },
    select: { id: true, externalId: true, credentialsEnc: true },
  });

  for (const c of connections) {
    if (running.has(c.id) || !c.credentialsEnc) continue;
    const poller = new BotPoller(c.id, c.externalId ?? c.id);
    running.set(c.id, poller);
    // Deliberately not awaited — each bot polls on its own loop, and one slow
    // or broken bot must not stall the others.
    void poller.run().finally(() => running.delete(c.id));
  }
}

/**
 * Start polling every active Telegram bot, and keep watching for new ones so a
 * bot connected in the dashboard starts working without restarting the worker.
 */
export async function startTelegramPolling(): Promise<void> {
  await rescan();
  rescanTimer = setInterval(() => {
    rescan().catch((e) => console.error("[telegram] rescan failed:", e));
  }, RESCAN_MS);

  if (running.size === 0) {
    log("[telegram] no active bots yet — will pick one up within 15s of connecting");
  }
}

export function stopTelegramPolling(): void {
  if (rescanTimer) clearInterval(rescanTimer);
  for (const p of running.values()) p.stop();
  running.clear();
}
