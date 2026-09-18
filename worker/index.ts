/**
 * The worker. Everything slow or expensive happens here, never in a request.
 *
 *   bun worker/index.ts          (or: bun run worker)
 *
 * Two jobs:
 *   1. inbound messages  — drain the queue, run the agent, persist the reply
 *   2. scheduled jobs    — follow-ups and meeting reminders whose time has come
 *
 * With Redis down (it is, right now) the inbound queue degrades to in-process
 * execution inside lib/queue.ts, so this process still works end to end —
 * without durability. The ScheduledJob sweep never needed Redis: it is a
 * database poll, which is also why it survives a restart.
 */
import { JobKind, JobStatus } from "@prisma/client";
import { prisma } from "../lib/db";
import { runAgent } from "../lib/ai/agent";
import { conversationKey, sendBubbles } from "../lib/channels";
import { closeQueue, registerInboundProcessor, type InboundJob } from "../lib/queue";
import { startTelegramPolling, stopTelegramPolling } from "./telegram-poll";
import { usesWebhook } from "../lib/channels/telegram";

const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH = 25;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ─────────────────────────────────────────────────────────────────────────────
// Inbound
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a reply is addressed. persistInbound derives the conversation id as
 * `${channelConnectionId}:${conversationRef}`, and conversationRef IS the
 * provider's address (Telegram chat id, widget visitor id) — so the reply
 * address is already in the key, and no schema column is needed to find it.
 */
function replyAddress(conversationId: string, channelConnectionId: string): string | null {
  const prefix = conversationKey(channelConnectionId, "");
  return conversationId.startsWith(prefix) ? conversationId.slice(prefix.length) : null;
}

async function handleInbound(job: InboundJob): Promise<void> {
  const started = Date.now();
  const result = await runAgent(job);
  const ms = Date.now() - started;

  if (result.status !== "replied") {
    log(
      `[inbound] ${job.conversationId} → ${result.status}: ${result.reason ?? ""} ` +
        `(${ms}ms, $${result.costUsd.toFixed(6)})`,
    );
    return;
  }

  const photos = result.replies.filter((r) => r.mediaUrl).length;
  log(
    `[inbound] ${job.conversationId} → ${result.replies.length - photos} bubble(s)` +
      `${photos ? ` + ${photos} photo(s)` : ""}, ` +
      `${result.toolCalls.map((t) => t.name).join("+") || "no tools"}, ` +
      `${ms}ms, $${result.costUsd.toFixed(6)}`,
  );

  // The bubbles and photos are already persisted, so the inbox and the widget's
  // poll have them either way. This is the push out to the provider.
  const conversation = await prisma.conversation.findFirst({
    where: { id: job.conversationId, organizationId: job.organizationId },
    include: { channel: true },
  });
  if (!conversation) return;

  const to = replyAddress(conversation.id, conversation.channelConnectionId);
  if (!to) {
    log(`[inbound] ${conversation.id} has no derivable reply address — persisted only`);
    return;
  }

  // The pause before the first bubble is most of why a good agent does not read
  // as a bot (CLAUDE.md §5). The widget adapter's send is a deliberate no-op —
  // its visitor is already watching — so this costs nothing there. The replies
  // arrive text-first, photos last, and go out in that order.
  await new Promise((r) => setTimeout(r, result.delayMs));
  const ids = await sendBubbles(conversation.channel, to, result.replies, { gapMs: 1200 });
  log(`  → sent ${ids.length || result.replies.length} message(s) via ${conversation.channel.kind}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled jobs
// ─────────────────────────────────────────────────────────────────────────────

interface FollowUpPayload {
  message?: string | null;
}

async function runScheduledJob(job: {
  id: string;
  kind: JobKind;
  organizationId: string;
  conversationId: string | null;
  payload: unknown;
}): Promise<void> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  if (job.kind === JobKind.FOLLOW_UP) {
    if (!job.conversationId) throw new Error("FOLLOW_UP with no conversation");

    const message = (payload as FollowUpPayload).message?.trim();
    if (!message) {
      // Composing a follow-up from scratch needs its own prompt path (it is not
      // a reply to anything). Until that exists, a colleague writes it — the job
      // is closed rather than left to re-fire every sweep.
      log(`[sweep] follow-up ${job.id} has no message; a human needs to write it`);
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: job.conversationId, organizationId: job.organizationId },
      include: { channel: true, contact: true },
    });
    if (!conversation) throw new Error(`FOLLOW_UP for a conversation that is gone`);

    // A follow-up is an unprompted message. If a colleague has taken the thread
    // over, or the contact opted out since the job was scheduled, it must not go
    // — the same gates as a reply, re-checked at send time because hours have
    // passed since the model asked for this.
    if (conversation.state !== "AI_ACTIVE" || conversation.contact.botExcluded) {
      log(`[sweep] follow-up ${job.id} skipped — conversation is ${conversation.state}`);
      return;
    }

    await prisma.message.create({
      data: {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        direction: "OUTBOUND",
        body: message,
        aiGenerated: true,
      },
    });
    await prisma.conversation.update({
      where: { id: job.conversationId },
      data: { lastMessageAt: new Date() },
    });

    const to = replyAddress(conversation.id, conversation.channelConnectionId);
    if (to) await sendBubbles(conversation.channel, to, [{ text: message }]);
    log(`[sweep] follow-up ${job.id} → ${to ? "sent" : "persisted only"}: ${message.slice(0, 100)}`);
    return;
  }

  if (job.kind === JobKind.REMINDER) {
    // A booked meeting. Nothing to send the customer — this is the team's
    // reminder, and it becomes a real Google Calendar event once that OAuth
    // and app verification land (CLAUDE.md §8/§9).
    log(
      `[sweep] reminder ${job.id} — meeting at ${String(payload.startsAt ?? "?")} ` +
        `(${String(payload.durationMins ?? "?")}m): ${String(payload.notes ?? "no notes")}`,
    );
    return;
  }

  throw new Error(`Unhandled job kind ${job.kind}`);
}

async function sweepScheduledJobs(): Promise<void> {
  const due = await prisma.scheduledJob.findMany({
    where: {
      status: JobStatus.PENDING,
      runAt: { lte: new Date() },
      // CRAWL_REFRESH belongs to the knowledge track's worker; leaving those
      // rows alone means neither process fights the other for them.
      kind: { in: [JobKind.FOLLOW_UP, JobKind.REMINDER] },
    },
    orderBy: { runAt: "asc" },
    take: SWEEP_BATCH,
    select: {
      id: true,
      kind: true,
      organizationId: true,
      conversationId: true,
      payload: true,
    },
  });

  for (const job of due) {
    try {
      await runScheduledJob(job);
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: JobStatus.DONE },
      });
    } catch (err) {
      // FAILED, not PENDING: a job that throws every 30 seconds forever is a
      // log flood that hides the next real problem. The row keeps its payload
      // so it can be retried by hand.
      console.error(`[sweep] job ${job.id} (${job.kind}) failed:`, err);
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // a second Ctrl-C must not race the first
  shuttingDown = true;
  log(`[worker] ${signal} — shutting down`);

  if (sweepTimer) clearInterval(sweepTimer);
  stopTelegramPolling();
  await closeQueue();
  await prisma.$disconnect();
  log("[worker] stopped");
  process.exit(0);
}

async function main(): Promise<void> {
  const { mode } = await registerInboundProcessor(handleInbound);
  log(`[worker] inbound processor registered (${mode})`);
  if (mode === "in-process") {
    log("[worker] NOTE: jobs enqueued by other processes will not reach this one without Redis.");
  }

  // Sweep immediately so a restart picks up anything that came due while the
  // process was down, then on the interval.
  await sweepScheduledJobs();
  sweepTimer = setInterval(() => {
    sweepScheduledJobs().catch((err) => console.error("[sweep] failed:", err));
  }, SWEEP_INTERVAL_MS);

  // Telegram pushes to a public https URL or not at all, so on localhost we
  // pull instead. Polling lives in THIS process because, with Redis down, the
  // in-process queue can only run jobs enqueued by the process that registered
  // the processor — polling from anywhere else would store messages nothing
  // ever answers.
  if (usesWebhook()) {
    log("[worker] APP_URL is https — Telegram delivers by webhook, not polling.");
  } else {
    await startTelegramPolling();
  }

  log(`[worker] scheduled-job sweep every ${SWEEP_INTERVAL_MS / 1000}s. Ready.`);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
