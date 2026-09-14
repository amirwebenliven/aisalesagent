import type { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { env } from "./env";

/**
 * The inbound queue.
 *
 * A webhook validates, persists, enqueues and returns 200 in under a second
 * (CLAUDE.md §3) — the agent runs here, in the worker, behind this queue.
 *
 * Redis is not always up (it is down right now: no Docker daemon), and a
 * missing Redis must not stop the app booting or drop a customer's message. So
 * every Redis touch is lazy and probed, and when it fails the processor runs
 * IN-PROCESS instead. That keeps development working; it is not durable — a
 * crash mid-job loses the job — which is why it says so, loudly, once.
 */

export const INBOUND_QUEUE = "inbound";

/**
 * Ids, not text — the same shape lib/channels/types.ts hands to dispatchInbound.
 * The worker re-reads the message, so a job that sat in Redis through a restart
 * still answers the current state of the conversation rather than a snapshot of
 * it. `incomingText` is a shortcut for callers that already have the body
 * (replays, tests); the worker falls back to reading `messageId`.
 */
export interface InboundJob {
  organizationId: string;
  conversationId: string;
  messageId?: string;
  channelConnectionId?: string;
  incomingText?: string;
}

export type InboundProcessor = (job: InboundJob) => Promise<void>;

let processor: InboundProcessor | null = null;
let queue: Queue<InboundJob> | null = null;
let worker: Worker<InboundJob> | null = null;
let connections: Redis[] = [];
let redisUp: boolean | null = null; // null = not probed yet
let warnedDegraded = false;

function degradedWarning(detail: string): void {
  if (warnedDegraded) return;
  warnedDegraded = true;
  console.warn(
    `[queue] Redis unreachable at ${env.REDIS_URL} (${detail}). Running jobs in-process — ` +
      `DURABILITY IS OFF: anything in flight is lost if this process dies.`,
  );
}

async function makeRedis(probe: boolean): Promise<Redis | null> {
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(env.REDIS_URL, {
    // BullMQ blocks on its connection and requires this to be null.
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: probe ? 1000 : 10_000,
    // The probe must fail fast and stay failed; a live connection should
    // reconnect normally once Redis comes back.
    ...(probe ? { retryStrategy: () => null, enableOfflineQueue: false } : {}),
  });

  // ioredis emits 'error' on a socket that nobody is listening to, and an
  // unhandled 'error' event takes the whole process down.
  client.on("error", (err: Error) => {
    if (!probe) console.error("[queue] redis error:", err.message);
  });

  try {
    await client.connect();
    await client.ping();
  } catch (err) {
    client.disconnect();
    if (probe) degradedWarning(err instanceof Error ? err.message : String(err));
    return null;
  }

  connections.push(client);
  return client;
}

/** Probed once per process. Cheap to call anywhere. */
async function redisAvailable(): Promise<boolean> {
  if (redisUp !== null) return redisUp;
  const probe = await makeRedis(true);
  redisUp = probe !== null;
  return redisUp;
}

async function getQueue(): Promise<Queue<InboundJob> | null> {
  if (queue) return queue;
  if (!(await redisAvailable())) return null;

  const connection = await makeRedis(false);
  if (!connection) return null;

  const { Queue: BullQueue } = await import("bullmq");
  queue = new BullQueue<InboundJob>(INBOUND_QUEUE, { connection });
  return queue;
}

function runInProcess(job: InboundJob, run: InboundProcessor): void {
  // setTimeout, not await: the caller is a webhook handler that must return
  // 200 immediately, exactly as it would if Redis had taken the job.
  setTimeout(() => {
    run(job).catch((err) => console.error("[queue] in-process job failed:", err));
  }, 0);
}

export interface EnqueueResult {
  jobId?: string;
  /** "redis" is durable; "in-process" is not. */
  mode: "redis" | "in-process";
}

/**
 * THROWS when the job can neither be queued nor run here. That is deliberate:
 * lib/channels/dispatchInbound catches it and runs the agent inline, so the
 * customer still gets an answer. Resolving would claim the message is handled
 * when nothing in this process is listening — a silent drop, which is the one
 * outcome worth throwing for.
 */
export async function enqueueInbound(payload: InboundJob): Promise<EnqueueResult> {
  const q = await getQueue();
  if (q) {
    try {
      const job = await q.add("inbound", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      });
      return { jobId: job.id, mode: "redis" };
    } catch (err) {
      // Redis went away between the probe and the add.
      degradedWarning(err instanceof Error ? err.message : String(err));
      redisUp = false;
      queue = null;
    }
  }

  if (!processor) {
    throw new Error(
      `Inbound queue unavailable: Redis is unreachable at ${env.REDIS_URL} and this process has ` +
        `no in-process processor. Start the worker (bun worker/index.ts) or bring Redis up.`,
    );
  }

  runInProcess(payload, processor);
  return { mode: "in-process" };
}

export interface ProcessorRegistration {
  mode: "redis" | "in-process";
}

export async function registerInboundProcessor(
  fn: InboundProcessor,
  opts: { concurrency?: number } = {},
): Promise<ProcessorRegistration> {
  processor = fn;

  if (!(await redisAvailable())) return { mode: "in-process" };

  const connection = await makeRedis(false);
  if (!connection) return { mode: "in-process" };

  const { Worker: BullWorker } = await import("bullmq");
  worker = new BullWorker<InboundJob>(INBOUND_QUEUE, async (job) => fn(job.data), {
    connection,
    concurrency: opts.concurrency ?? 5,
  });
  worker.on("failed", (job, err) => {
    console.error(`[queue] job ${job?.id ?? "?"} failed:`, err.message);
  });

  return { mode: "redis" };
}

export async function queueHealth(): Promise<{ redis: boolean; mode: "redis" | "in-process" }> {
  const up = await redisAvailable();
  return { redis: up, mode: up ? "redis" : "in-process" };
}

export async function closeQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  for (const c of connections) c.disconnect();
  worker = null;
  queue = null;
  connections = [];
}
