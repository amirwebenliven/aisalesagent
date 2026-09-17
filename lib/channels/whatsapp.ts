import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChannelConnection, ChannelStatus } from "@prisma/client";
import { prisma } from "../db";
import { decryptJson, encryptJson } from "../crypto";
import { env } from "../env";
import type { ChannelAdapter, InboundMessage, OutboundMessage, SendResult } from "./types";

/**
 * WhatsApp by QR pairing, through WAHA (https://waha.devlike.pro).
 *
 * WAHA drives whatsapp-web.js (engine WEBJS) — the SAME protocol WhatsApp Web
 * speaks, replayed by a headless browser. That is what makes this channel
 * sellable with no Meta approval, and it is also the whole risk: it is against
 * WhatsApp's terms, and the thing that gets banned is the client's business
 * line, with their chat history inside it (CLAUDE.md §9). Everything unusual in
 * this file — the warm-up cap especially — exists because of that sentence.
 *
 * One WAHA session per ChannelConnection, named with the connection's own id.
 * Not the org name: a session name is a URL path segment in every WAHA call, so
 * it has to be unique, stable and safe unescaped. A cuid is all three; an org
 * called "Bob's Café & Sons" is none of them.
 *
 * Two secrets per connection, and like Telegram they are NOT the same thing:
 *   - webhookSecret (on the row) — the ?s= query segment. Tells us WHICH
 *     connection an event belongs to. Routing, not authentication; URLs leak.
 *   - hmacKey + headerSecret (encrypted in credentialsEnc) — WAHA signs every
 *     webhook body with the first and echoes the second back in a header. Those
 *     are what prove the caller is our WAHA and not someone who read the URL.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Talking to WAHA
// ─────────────────────────────────────────────────────────────────────────────

/** WAHA's own session states. STOPPED/FAILED are the ways out; WORKING is paired. */
export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "PASSKEY_REQUIRED"
  | "PASSKEY_CONFIRMATION_REQUIRED"
  | "WORKING"
  | "FAILED";

export interface WahaMeInfo {
  id: string; // "447700900000@c.us"
  lid?: string;
  jid?: string;
  pushName?: string;
}

export interface WahaSessionInfo {
  name: string;
  status: WahaSessionStatus;
  me?: WahaMeInfo | null;
  config?: unknown;
}

/** WAHA's message object — the `payload` of a "message" event and the reply to sendText. */
export interface WaMessage {
  id: string; // "false_447700900000@c.us_3EB0…"
  timestamp: number; // SECONDS, unlike the event envelope's milliseconds
  from: string;
  fromMe: boolean;
  to?: string;
  participant?: string | null;
  body?: string;
  hasMedia?: boolean;
  media?: { url?: string | null; mimetype?: string | null } | null;
  mediaUrl?: string | null;
  author?: string | null;
  /** Raw engine payload. Untyped by WAHA and explicitly unstable — read defensively. */
  _data?: Record<string, unknown>;
}

export interface WahaWebhookEvent {
  id: string;
  timestamp: number;
  session: string;
  event: string;
  engine?: string;
  me?: WahaMeInfo | null;
  payload: unknown;
}

export interface WhatsAppCredentials {
  /** WAHA session name. Equals the ChannelConnection id. */
  session: string;
  /** Signs every webhook body (WAHA sends X-Webhook-Hmac, sha512 hex). */
  hmacKey: string;
  /** Echoed back verbatim in X-Waha-Connection-Secret. */
  headerSecret: string;
  /**
   * The number paired here before this attempt, carried across a re-pairing so
   * the warm-up can tell "the same phone re-linked" from "a different number".
   * It lives in the encrypted blob because a customer's phone number is the
   * kind of thing that belongs there.
   */
  pairedNumber?: string;
}

const CONNECTION_SECRET_HEADER = "x-waha-connection-secret";
const HMAC_HEADER = "x-webhook-hmac";
const HMAC_ALGO_HEADER = "x-webhook-hmac-algorithm";

function wahaBase(): string {
  if (!env.WAHA_URL) {
    throw new Error("WAHA_URL is not set — the WhatsApp bridge has no address to call.");
  }
  return env.WAHA_URL.replace(/\/$/, "");
}

/**
 * Every WAHA call. Surfaces WAHA's own message, because its errors are the
 * useful ones: a 422 says "Session status is not as expected … expected
 * [WORKING]" and names the state it is actually in, which "something went
 * wrong" would throw away (CLAUDE.md §12).
 *
 * The API key goes in a header and never anywhere near a thrown message.
 */
async function wahaCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${wahaBase()}${path}`, {
      method,
      headers: {
        "X-Api-Key": env.WAHA_API_KEY ?? "",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // Container stopped, wrong port, Docker not running. Say so — this is the
    // single most common WhatsApp failure in development.
    throw new Error(
      `Cannot reach the WhatsApp bridge at ${wahaBase()} ` +
        `(${e instanceof Error ? e.message : String(e)}). Is the WAHA container running?`,
    );
  }

  // DELETE /api/sessions/{name} answers 200 with an EMPTY body and no
  // content-type. res.json() on that throws, so never parse blindly.
  const text = await res.text();
  const parsed = text ? ((JSON.parse(text) as unknown) ?? null) : null;

  if (!res.ok) {
    const detail =
      (parsed as { error?: unknown; message?: unknown } | null)?.error ??
      (parsed as { message?: unknown } | null)?.message;
    const asText =
      typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : res.statusText;
    throw new Error(`WAHA ${method} ${path} failed (${res.status}): ${asText}`);
  }

  return parsed as T;
}

export function whatsappCredentials(connection: ChannelConnection): WhatsAppCredentials {
  if (!connection.credentialsEnc) {
    throw new Error(`WhatsApp connection ${connection.id} has no stored credentials.`);
  }
  return decryptJson<WhatsAppCredentials>(connection.credentialsEnc);
}

/** The webhook URL as a human should see it — our real origin. */
export function whatsappWebhookUrl(webhookSecret: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/whatsapp?s=${encodeURIComponent(webhookSecret)}`;
}

/**
 * The same URL, as WAHA must dial it.
 *
 * WAHA runs in a container, so "localhost" there means the container itself —
 * a webhook pointed at http://localhost:3000 posts into WAHA's own empty port
 * 3000 and every event vanishes with no error on either side. Docker Desktop
 * publishes the host as `host.docker.internal`, which is the address that was
 * verified to reach this app from inside the running container.
 *
 * Only the loopback names are rewritten: a deployed APP_URL is left alone.
 */
export function wahaFacingWebhookUrl(webhookSecret: string): string {
  const url = new URL(whatsappWebhookUrl(webhookSecret));
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)) {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Warm-up caps — CLAUDE.md §9
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A number that pairs today and immediately sends hundreds of messages to
 * people who never messaged it is the exact signature WhatsApp bans for. Real
 * accounts start slow and grow, so a new pairing does too: a low cap on day 1
 * rising to a normal business volume over ~60 days.
 *
 * Derived from warmupStartedAt on every send rather than stored as a schedule —
 * a stored ramp drifts the moment a row is copied between environments or a
 * migration reorders it, and the honest input is "when did this number pair".
 */
export const WARMUP_DAYS = 60;
export const WARMUP_START_CAP = 50;
export const WARMUP_END_CAP = 1000;

/** Day 1 is pairing day: "day 0 of 60" on the screen you just paired on reads as broken. */
export function warmupDay(startedAt: Date | null, now: Date = new Date()): number {
  if (!startedAt) return 1;
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
  return Math.min(WARMUP_DAYS, Math.max(1, elapsed + 1));
}

/**
 * Geometric ramp — ~5% a day, which is how a real account's volume grows. A
 * linear ramp spends the risky early days far too high.
 */
export function dailyCapFor(startedAt: Date | null, now: Date = new Date()): number {
  const day = warmupDay(startedAt, now);
  if (day >= WARMUP_DAYS) return WARMUP_END_CAP;
  const ratio = (day - 1) / (WARMUP_DAYS - 1);
  const raw = WARMUP_START_CAP * (WARMUP_END_CAP / WARMUP_START_CAP) ** ratio;
  return Math.max(WARMUP_START_CAP, Math.round(raw / 10) * 10);
}

function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface SendAllowance {
  allowed: boolean;
  cap: number;
  sentToday: number;
  day: number;
}

/**
 * How much of today's quota is gone.
 *
 * The cap is DERIVED from warmupStartedAt on every call, never read from
 * `dailySendCap`. That column is a mirror for the UI — trusting it would freeze
 * the ramp at whatever value was written on pairing day, and a number would
 * still be on its day-1 allowance two months later with nothing to show why.
 *
 * Counts OUTBOUND rows on this connection since local midnight. Those rows are
 * written before the send (runAgent persists the bubbles, then the worker pushes
 * them), so the message being checked is already in the count — hence `<=`,
 * which permits exactly `cap` messages a day.
 *
 * It counts a message we refused to send as well as one we sent. That is the
 * conservative direction and it costs nothing: once the cap is reached the day
 * is over either way, and the count resets at midnight regardless.
 *
 * Human replies from the inbox count too. WhatsApp bans a NUMBER for volume; it
 * does not care which side of our UI typed the message.
 */
export async function checkSendAllowance(
  connection: ChannelConnection,
  now: Date = new Date(),
): Promise<SendAllowance> {
  const cap = dailyCapFor(connection.warmupStartedAt, now);

  const sentToday = await prisma.message.count({
    where: {
      organizationId: connection.organizationId,
      direction: "OUTBOUND",
      createdAt: { gte: startOfToday(now) },
      conversation: { channelConnectionId: connection.id },
    },
  });

  return {
    // `cap > 0` is not redundant: it is what makes a cap of zero mean zero
    // rather than one, since the first message of the day is already counted.
    allowed: cap > 0 && sentToday <= cap,
    cap,
    sentToday,
    day: warmupDay(connection.warmupStartedAt, now),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect / pair
// ─────────────────────────────────────────────────────────────────────────────

/** WAHA's states, mapped onto ours. Only WORKING is a channel that can send. */
export function statusFromWaha(status: WahaSessionStatus): ChannelStatus {
  switch (status) {
    case "WORKING":
      return "ACTIVE";
    case "FAILED":
      return "FAILED";
    case "STOPPED":
      return "PAUSED";
    default:
      // STARTING, SCAN_QR_CODE and the passkey states are all "not paired yet".
      return "CONNECTING";
  }
}

async function readSession(session: string): Promise<WahaSessionInfo | null> {
  try {
    return await wahaCall<WahaSessionInfo>("GET", `/api/sessions/${encodeURIComponent(session)}`);
  } catch (e) {
    // 404 is the normal answer for "never created" — not an error worth throwing.
    if (e instanceof Error && /\(404\)/.test(e.message)) return null;
    throw e;
  }
}

async function deleteSession(session: string): Promise<void> {
  try {
    await wahaCall("DELETE", `/api/sessions/${encodeURIComponent(session)}`);
  } catch (e) {
    if (e instanceof Error && /\(404\)/.test(e.message)) return;
    throw e;
  }
}

/**
 * Create the WAHA session, point it at us, and hand back a connection whose
 * status the UI can poll until a phone scans the code.
 *
 * Re-running this for an org reuses the SAME row, so the session name is stable
 * for the life of the channel. If that session is already WORKING it is left
 * strictly alone: someone reopening the pairing dialog on a live channel must
 * not log out the client's number, which is what deleting the session does.
 */
export async function connectWhatsApp(params: {
  organizationId: string;
  agentId?: string | null;
  displayName?: string;
}): Promise<{ connection: ChannelConnection; sessionName: string; webhookUrl: string; status: WahaSessionStatus }> {
  const existing = await prisma.channelConnection.findFirst({
    where: { organizationId: params.organizationId, kind: "WHATSAPP_QR" },
    orderBy: { createdAt: "asc" },
  });

  const displayName = params.displayName?.trim() || existing?.displayName || "WhatsApp";

  // The row first, because the session name IS its id — WAHA cannot be called
  // until the id exists.
  const connection =
    existing ??
    (await prisma.channelConnection.create({
      data: {
        organizationId: params.organizationId,
        agentId: params.agentId ?? null,
        kind: "WHATSAPP_QR",
        displayName,
        status: "CONNECTING",
      },
    }));

  const sessionName = connection.id;
  const webhookUrl = whatsappWebhookUrl(connection.webhookSecret);
  const now = new Date();

  const live = await readSession(sessionName);
  if (live?.status === "WORKING") {
    // Already paired. Refresh the bookkeeping and return; do NOT touch WAHA.
    const paired = await applySessionStatus(connection, "WORKING", live.me ?? null);
    return { connection: paired, sessionName, webhookUrl, status: "WORKING" };
  }

  // externalId is about to be overwritten with the session name, so the number
  // that was paired here is remembered now or not at all.
  const previouslyPaired = lastKnownNumber(connection);

  // Rotated on every pairing attempt, and the session is recreated below with
  // the new values, so the two sides can never drift.
  const credentials: WhatsAppCredentials = {
    session: sessionName,
    hmacKey: randomBytes(32).toString("hex"),
    headerSecret: randomBytes(24).toString("hex"),
    ...(previouslyPaired ? { pairedNumber: previouslyPaired } : {}),
  };

  // The ramp starts at pairing, not at the first message: a number paired three
  // weeks ago and used today is three weeks old to WhatsApp.
  const warmupStartedAt = connection.warmupStartedAt ?? now;

  const prepared = await prisma.channelConnection.update({
    where: { id: connection.id },
    data: {
      displayName,
      agentId: params.agentId ?? connection.agentId,
      credentialsEnc: encryptJson(credentials),
      // Until a phone scans, the session name is the only identifier we have.
      // It is replaced by the paired number the moment WAHA reports WORKING.
      externalId: sessionName,
      status: "CONNECTING",
      warmupStartedAt,
      // Written in the same update, not a follow-up one, so the row handed back
      // to the caller is the row in the database. The Channels card reads this.
      dailySendCap: dailyCapFor(warmupStartedAt, now),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });

  // A half-started or failed session from a previous attempt would make POST
  // /api/sessions a 422 ("session already exists"), so clear it first.
  await deleteSession(sessionName);

  try {
    const created = await wahaCall<WahaSessionInfo>("POST", "/api/sessions", {
      name: sessionName,
      start: true,
      config: {
        // Shows up on every webhook event and in WAHA's dashboard — the only
        // way to tell whose session a stray container entry belongs to.
        metadata: {
          "connection.id": connection.id,
          "organization.id": connection.organizationId,
        },
        // Dropped inside WAHA, before they ever become HTTP traffic. Cheaper and
        // more reliable than filtering on our side, and parseInbound still
        // re-checks: config drift must not turn into the agent answering a
        // group chat.
        ignore: { status: true, groups: true, channels: true, broadcast: true },
        webhooks: [
          {
            url: wahaFacingWebhookUrl(prepared.webhookSecret),
            events: ["message", "session.status"],
            customHeaders: [
              { name: "X-Waha-Connection-Secret", value: credentials.headerSecret },
            ],
            hmac: { key: credentials.hmacKey },
            // WAHA retries a non-2xx. Dedup on providerId makes that safe, and
            // a webhook that arrives while the app is restarting should not be
            // lost. Bounded, because a permanently broken URL must not retry
            // forever.
            retries: { delaySeconds: 2, attempts: 5, policy: "exponential" },
          },
        ],
      },
    });

    return {
      connection: prepared,
      sessionName,
      webhookUrl,
      status: created?.status ?? "STARTING",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.channelConnection.update({
      where: { id: connection.id },
      data: { status: "FAILED", lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 1000) },
    });
    throw new Error(message);
  }
}

/** Current WAHA state for a connection, or null if the session is gone. */
export async function whatsappSessionState(
  connection: ChannelConnection,
): Promise<WahaSessionInfo | null> {
  return readSession(whatsappCredentials(connection).session);
}

/**
 * The pairing QR, as a data URL ready for an <img src>.
 *
 * Verified against the running container: GET /api/{session}/auth/qr returns
 * image/png bytes by default and `{"value":"2@…"}` with ?format=raw. We proxy
 * the PNG so the browser never needs — and never sees — the WAHA API key.
 *
 * Returns null rather than throwing when there is no code: WAHA issues a new QR
 * every few seconds and 404s in the gap between two of them, which is normal
 * polling traffic, not a failure worth showing anyone.
 */
export async function whatsappQrDataUrl(connection: ChannelConnection): Promise<string | null> {
  const { session } = whatsappCredentials(connection);
  const res = await fetch(
    `${wahaBase()}/api/${encodeURIComponent(session)}/auth/qr?format=image`,
    { headers: { "X-Api-Key": env.WAHA_API_KEY ?? "" }, cache: "no-store" },
  ).catch(() => null);

  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;

  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) return null;
  return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
}

/**
 * The digits of a jid, for comparison only.
 *
 * WhatsApp hands the same account back as `447700900000@c.us` and
 * `447700900000:12@c.us` depending on the device, so a raw string compare would
 * read a reconnect of the SAME phone as a different number.
 */
function bareNumber(jid: string | null): string | null {
  if (!jid) return null;
  return jid.split("@")[0]?.split(":")[0] ?? null;
}

/**
 * The number last paired here — from externalId, or from the credentials blob
 * when a re-pairing is in flight and externalId has been reset to the session
 * name. Null when this channel has never been paired.
 */
function lastKnownNumber(connection: ChannelConnection): string | null {
  if (connection.externalId && connection.externalId !== connection.id) {
    return connection.externalId;
  }
  try {
    return whatsappCredentials(connection).pairedNumber ?? null;
  } catch {
    return null;
  }
}

/**
 * Fold a WAHA session state into the connection row. Called from the webhook
 * (session.status events) and from the status route's poll, so the card is
 * right even if one of the two is not reaching us.
 */
export async function applySessionStatus(
  connection: ChannelConnection,
  status: WahaSessionStatus,
  me: WahaMeInfo | null,
): Promise<ChannelConnection> {
  const now = new Date();
  const paired = status === "WORKING" ? (me?.id ?? null) : null;

  // A DIFFERENT number on the same connection is a different WhatsApp account
  // with its own standing at WhatsApp. Restart the ramp rather than inheriting a
  // finished one: otherwise a client whose number was restricted pairs a fresh
  // SIM here and we push day-60 volume down a line that is an hour old — the
  // exact way the second number dies too.
  const previous = bareNumber(lastKnownNumber(connection));
  const numberChanged = paired !== null && previous !== null && previous !== bareNumber(paired);

  const warmupStartedAt = numberChanged ? now : (connection.warmupStartedAt ?? (paired ? now : null));

  return prisma.channelConnection.update({
    where: { id: connection.id },
    data: {
      status: statusFromWaha(status),
      ...(paired ? { externalId: paired } : {}),
      warmupStartedAt,
      dailySendCap: dailyCapFor(warmupStartedAt, now),
      ...(status === "FAILED"
        ? {
            lastErrorAt: now,
            lastErrorMessage:
              "WhatsApp rejected the session. Pair again with a fresh QR code.",
          }
        : { lastErrorAt: null, lastErrorMessage: null }),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook authentication
// ─────────────────────────────────────────────────────────────────────────────

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Both checks, both required.
 *
 * Verified against WAHA 2026.8.2 CORE: it delivers our custom header AND signs
 * the body with HMAC-SHA512 over the RAW bytes (X-Webhook-Hmac, hex, algorithm
 * named in X-Webhook-Hmac-Algorithm). The header alone is a bearer token that a
 * proxy log would leak; the signature alone would be accepted from any session
 * whose key we hold. Requiring both costs nothing and fails loudly if a session
 * is ever recreated without them — which is the outcome we want, because the
 * alternative is silently accepting unauthenticated posts.
 *
 * `raw` must be the exact request body text. Re-serialising a parsed object
 * changes key order and whitespace, and the signature will not match.
 */
export function whatsappWebhookAuthentic(
  connection: ChannelConnection,
  headers: Headers,
  raw: string,
): boolean {
  let credentials: WhatsAppCredentials;
  try {
    credentials = whatsappCredentials(connection);
  } catch {
    return false;
  }

  const echoed = headers.get(CONNECTION_SECRET_HEADER);
  if (!echoed || !constantTimeEquals(credentials.headerSecret, echoed)) return false;

  const signature = headers.get(HMAC_HEADER);
  if (!signature) return false;

  // WAHA names the algorithm it used. Trusting that name blindly would let a
  // caller pick a weaker one, so only the algorithm we configured is accepted.
  const algorithm = (headers.get(HMAC_ALGO_HEADER) ?? "sha512").toLowerCase();
  if (algorithm !== "sha512") return false;

  const expected = createHmac("sha512", credentials.hmacKey).update(raw).digest("hex");
  return constantTimeEquals(expected, signature.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Chats we never answer, whatever WAHA's own ignore config is doing. */
function isIgnorableChat(chatId: string): boolean {
  return (
    chatId.endsWith("@g.us") || // groups — one reply would go to everyone in it
    chatId.endsWith("@newsletter") || // WhatsApp Channels
    chatId.endsWith("@broadcast") || // includes status@broadcast (stories)
    chatId === "status@broadcast"
  );
}

/** WAMessage.timestamp is seconds; the event envelope is milliseconds. Take either. */
function toDate(ts: number | undefined): Date {
  if (!ts || !Number.isFinite(ts)) return new Date();
  return new Date(ts > 1e11 ? ts : ts * 1000);
}

function pushName(payload: WaMessage): string | undefined {
  const data = payload._data;
  if (!data) return undefined;
  for (const key of ["notifyName", "pushName", "pushname"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * A jid is not a phone number. `447700900000@c.us` contains one; `1234@lid` is
 * a privacy identifier that only looks like one, and writing it into
 * Contact.phone would give the client a number that dials nothing.
 */
function phoneFromJid(jid: string): string | undefined {
  if (!jid.endsWith("@c.us")) return undefined;
  const bare = jid.split("@")[0]?.split(":")[0] ?? "";
  return /^\d{6,15}$/.test(bare) ? `+${bare}` : undefined;
}

const MAX_MESSAGE_CHARS = 4000;

export const whatsappAdapter: ChannelAdapter = {
  id: "whatsapp",

  parseInbound(raw: unknown): InboundMessage | null {
    const event = raw as WahaWebhookEvent | null;
    if (!event || typeof event !== "object") return null;

    // session.status, message.ack, presence, calls — real events, none of them
    // a customer saying something.
    if (event.event !== "message") return null;

    const payload = event.payload as WaMessage | null;
    if (!payload || typeof payload !== "object" || typeof payload.from !== "string") return null;

    // OUR OWN echo. WhatsApp reports messages we send back to us, and WAHA
    // forwards them: storing one would have the agent read its own reply as a
    // customer turn and answer itself, forever.
    if (payload.fromMe) return null;

    if (isIgnorableChat(payload.from)) return null;

    const text = (payload.body ?? "").trim();
    // A photo or voice note with no caption. Answering it needs media download
    // and storage, which is a later phase — an empty turn the agent then tries
    // to answer is worse than no turn.
    if (!text) return null;

    const chatId = payload.from;

    return {
      channel: "whatsapp",
      // WhatsApp's own message id: stable across WAHA's retries of the same
      // event, and different for every message. The event envelope's ULID is
      // NOT usable here — it is regenerated per delivery attempt.
      providerId: `wa:${payload.id}`,
      // In a 1:1 chat the sender IS the chat, and this is the chatId sendText
      // needs. Groups never reach here.
      conversationRef: chatId,
      contact: {
        externalId: chatId,
        name: pushName(payload),
        phone: phoneFromJid(chatId),
      },
      text: text.slice(0, MAX_MESSAGE_CHARS),
      sentAt: toDate(payload.timestamp),
    };
  },

  async send(connection, to, msg: OutboundMessage): Promise<SendResult> {
    const { session } = whatsappCredentials(connection);

    // THE ban guard. Checked per message, immediately before the call — not once
    // per turn, because a three-bubble reply is three messages to WhatsApp.
    const allowance = await checkSendAllowance(connection);

    // Today's number, mirrored onto the row for the Channels card. At most one
    // write a day, because the ramp only moves once a day.
    if (connection.dailySendCap !== allowance.cap) {
      await prisma.channelConnection.update({
        where: { id: connection.id },
        data: { dailySendCap: allowance.cap },
      });
    }

    if (!allowance.allowed) {
      // The reply is already persisted by the caller, so it is in the inbox and
      // a human can send it by hand. What must not happen is us pushing past
      // the cap: silence for the rest of today beats the client's business line
      // being banned tomorrow.
      console.warn(
        `[whatsapp] send BLOCKED by warm-up cap — connection ${connection.id}, ` +
          `day ${allowance.day}/${WARMUP_DAYS}, ${allowance.sentToday} messages today, ` +
          `cap ${allowance.cap}. The message is stored but NOT delivered.`,
      );

      const note =
        `Warm-up cap reached: ${allowance.sentToday}/${allowance.cap} messages today ` +
        `(day ${allowance.day} of ${WARMUP_DAYS}). Replies are being stored, not sent.`;
      if (connection.lastErrorMessage !== note) {
        await prisma.channelConnection.update({
          where: { id: connection.id },
          data: { lastErrorAt: new Date(), lastErrorMessage: note },
        });
      }

      // No providerId: nothing was delivered, and claiming an id for a message
      // that does not exist on WhatsApp would poison the dedup namespace.
      return {};
    }

    const sent = await wahaCall<WaMessage>("POST", "/api/sendText", {
      session,
      chatId: to,
      text: msg.text,
      // A preview fetches the link, renders a card and makes a two-line answer
      // look like an advert. Off by default here; Telegram does the same.
      linkPreview: false,
    });

    // Same namespace as inbound ids and never colliding — WhatsApp ids carry a
    // fromMe prefix, so ours begin "true_" and a customer's "false_".
    return { providerId: `wa:${sent?.id ?? `${Date.now()}`}` };
  },

  // The route reads the body once and calls whatsappWebhookAuthentic directly
  // (the signature covers the RAW bytes, so it cannot be re-derived from a
  // parsed object). This exists so any generic caller holding only a Request
  // still gets the same check.
  async verify(req, connection) {
    return whatsappWebhookAuthentic(connection, req.headers, await req.clone().text());
  },
};
