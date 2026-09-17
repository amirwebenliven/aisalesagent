"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { replyDelayOf, type GuideAgent, type ReplyDelay } from "./TelegramGuide";

/**
 * Pairing a real WhatsApp account by QR, and the warning that has to travel
 * with it.
 *
 * The order of this dialog is the whole design. What it does, then what it can
 * cost them, then the code. A ban is not a support ticket — it is the client's
 * business line going dark, with the chat history inside it. Someone who finds
 * that out afterwards was not informed, they were ambushed, so the risk is
 * stated before a QR exists and the button that creates one is gated on
 * ticking that they read it (CLAUDE.md §9: written disclosure).
 *
 * Nothing here holds a credential. The session lives in WAHA; this screen only
 * ever sees a QR image, a phone number and a state string.
 */

/** The ramp DM Champ runs on a freshly paired number. CLAUDE.md §9. */
export const WARMUP_DAYS = 60;

const POLL_MS = 2000;

/**
 * ~5 minutes of polling, then it stops and offers a button.
 *
 * A dialog left open on a second monitor is the normal case, not the odd one,
 * and an interval nobody remembers is a request every two seconds until the
 * tab is closed.
 */
const MAX_POLLS = 150;

/** What the card and the success panel need to describe a live pairing. */
export type WhatsAppPaired = {
  phoneNumber: string | null;
  agentId: string | null;
  /** ISO string — the Date is serialised by the page so the client does no timezone maths. */
  warmupStartedAt: string | null;
  dailySendCap: number | null;
};

/**
 * WAHA's session states are STARTING → SCAN_QR_CODE → WORKING, with FAILED and
 * STOPPED as the ways out. Anything outside that is rendered verbatim rather
 * than flattened into "connecting": a state we did not expect is the one worth
 * reading.
 */
const TERMINAL: string[] = ["WORKING", "FAILED", "STOPPED"];

type StatusBody = {
  status?: unknown;
  qr?: unknown;
  phoneNumber?: unknown;
  agentId?: unknown;
  warmupStartedAt?: unknown;
  dailySendCap?: unknown;
  error?: unknown;
  message?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * WAHA hands back a jid as often as a bare number — `44777…@c.us`, sometimes
 * with a `:12` device suffix. Rendering that to a business owner asks them to
 * recognise their own phone number in a protocol identifier.
 */
export function prettyPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bare = raw.split("@")[0]?.split(":")[0]?.trim() ?? "";
  if (!bare) return null;
  return /^\d{6,15}$/.test(bare) ? `+${bare}` : bare;
}

/**
 * The QR arrives as a data URL, a bare base64 payload or an https link
 * depending on how the adapter passes WAHA's response through. Assume the
 * common case, but do not corrupt the other two by prefixing them.
 */
function qrSrc(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `data:image/png;base64,${raw}`;
}

export type WarmupProgress = { day: number; total: number; percent: number; done: boolean };

/**
 * Day 1 is the day it was paired — "day 0 of 60" on the screen you just paired
 * on reads as nothing having happened. Epoch arithmetic, so a server render and
 * the hydration that follows it agree regardless of timezone.
 */
export function warmupProgress(startedAt: string | null | undefined): WarmupProgress | null {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const elapsedDays = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  const day = Math.min(WARMUP_DAYS, Math.max(1, elapsedDays + 1));
  return {
    day,
    total: WARMUP_DAYS,
    percent: Math.round((day / WARMUP_DAYS) * 100),
    done: day >= WARMUP_DAYS,
  };
}

/**
 * The ramp, explained where it is felt.
 *
 * A user who has not been told about the warm-up reads a quiet first week as
 * the product being broken and asks for a refund — so this is not a footnote,
 * and it stays on the card long after the pairing modal is gone.
 */
export function WarmupPanel({
  startedAt,
  dailyCap,
}: {
  startedAt: string | null;
  dailyCap: number | null;
}) {
  const progress = warmupProgress(startedAt);
  if (!progress) return null;

  if (progress.done) {
    return (
      <p className="small dim">
        Warm-up finished — the number has been paired for {WARMUP_DAYS} days and is off the ramped
        send cap.
      </p>
    );
  }

  return (
    <div className="callout warn callout-bar warmup">
      <div className="warmup-head">
        <strong>Warming up — day {progress.day} of {progress.total}</strong>
        <span className="mono small dim">
          {dailyCap != null ? `${dailyCap}/day cap` : "ramped daily cap"}
        </span>
      </div>
      <div className="warmup-bar" role="img" aria-label={`Day ${progress.day} of ${progress.total} of warm-up`}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="small">
        A number that starts sending hard the day it is paired is the fastest way to get it banned,
        so the agent&apos;s daily send limit starts low and rises across {progress.total} days.{" "}
        <strong>Cold outreach is disabled for the whole period</strong> — the agent answers people
        who message first and never opens a conversation.
      </p>
      <p className="small dim">A quiet first week is the ramp working, not the product failing.</p>
    </div>
  );
}

/**
 * Everything about a live pairing, in one block — rendered both in the success
 * state of this dialog and on the connected channel card, because the warm-up
 * is needed on day 14 and not only in the minute after the QR was scanned.
 */
export function WhatsAppPairedPanel({
  phoneNumber,
  agentName,
  delay,
  warmupStartedAt,
  dailySendCap,
  paused,
}: {
  phoneNumber: string | null;
  /** null = no agent assigned, so nothing will answer. */
  agentName: string | null;
  /** undefined = not known here. */
  delay?: ReplyDelay | null;
  warmupStartedAt: string | null;
  dailySendCap: number | null;
  paused?: boolean;
}) {
  const pretty = prettyPhone(phoneNumber);

  return (
    <div className="bot-panel">
      <div className="bot-panel-top">
        <span className={`pill ${paused ? "warn" : "ok"}`}>
          <span className="dot" />
          {paused ? "paused" : "paired"}
        </span>
        <strong className="mono bot-handle">{pretty ?? "number not reported"}</strong>
      </div>

      <div className="paired-kv">
        <div>
          <div className="lab mono dim">Answering</div>
          <div className="small">{agentName ?? "No agent — messages wait for a human"}</div>
        </div>
        {delay && (
          <div>
            <div className="lab mono dim">Reply delay</div>
            <div className="small">
              {delay.minSec}–{delay.maxSec} s
            </div>
          </div>
        )}
      </div>

      <WarmupPanel startedAt={warmupStartedAt} dailyCap={dailySendCap} />

      {/* Rule 4: the honest gap. Pausing is real and stops the agent; unlinking
          the phone is not built, so say where it is done instead of shipping a
          "Disconnect" that quietly only pauses. */}
      <div className="callout info callout-bar">
        <strong>Unlinking the phone</strong>
        <p className="small">
          <strong>Pause</strong> below stops the agent replying and keeps every conversation. It does
          not unlink the phone — we cannot end a WhatsApp session from here yet. To fully unlink, on
          the phone open <strong>WhatsApp → Settings → Linked devices</strong>, tap this device and
          choose <strong>Log out</strong>.
        </p>
      </div>
    </div>
  );
}

export default function WhatsAppGuide({
  open,
  onClose,
  agents,
  currentAgentId,
  connected,
}: {
  open: boolean;
  onClose: () => void;
  agents: GuideAgent[];
  currentAgentId?: string | null;
  /** Already paired — the dialog is then a re-pair, and says so. */
  connected?: boolean;
}) {
  const router = useRouter();

  const [agentId, setAgentId] = useState(currentAgentId ?? agents[0]?.id ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [paired, setPaired] = useState<WhatsAppPaired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [starting, setStarting] = useState(false);

  /**
   * The single switch the polling effect depends on. Deriving "should I poll?"
   * from `status` inside the dependency array would tear the loop down and
   * rebuild it on every tick, which is how a "stop when done" check ends up
   * racing its own restart.
   */
  const [polling, setPolling] = useState(false);

  function reset() {
    setAcknowledged(false);
    setConnectionId(null);
    setStatus(null);
    setQr(null);
    setPaired(null);
    setError(null);
    setStalled(false);
    setStarting(false);
    setPolling(false);
  }

  function close() {
    // Everything, including the poll switch. A modal that is closed but still
    // polling is a request every two seconds for as long as the tab lives.
    reset();
    onClose();
  }

  /** Create (or restart) the WAHA session and start watching it. */
  const start = useCallback(
    async (chosenAgentId: string) => {
      setStarting(true);
      setError(null);
      setStalled(false);
      setQr(null);
      setStatus(null);
      try {
        const res = await fetch("/api/channels/whatsapp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Only sent when a real agent is chosen: the route's contract is
          // `{ agentId? }` and inventing a null for "no agent" is a guess about
          // a validator we do not own. The card's picker is the authority after.
          body: JSON.stringify(chosenAgentId ? { agentId: chosenAgentId } : {}),
        });
        const body: StatusBody & { connectionId?: unknown; ok?: unknown } = await res
          .json()
          .catch(() => ({}));

        const id = str(body.connectionId);
        if (!res.ok || body.ok === false || !id) {
          // WAHA's own words, or the route's. "Something went wrong" cannot tell
          // a stopped container apart from a rejected pairing.
          setError(
            str(body.error) ?? str(body.message) ?? `The pairing service answered ${res.status}.`,
          );
          return;
        }

        setConnectionId(id);
        setStatus("STARTING");
        setPolling(true);
      } catch (e) {
        setError(
          `Could not reach the pairing service: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  // ── The poll ───────────────────────────────────────────────────────────────
  // One chained setTimeout, not setInterval: a slow answer must not let a second
  // request start on top of the first. Unmount, close and a terminal state all
  // land in the same cleanup.
  useEffect(() => {
    if (!open || !polling || !connectionId) return;

    // Captured, not read off the closure variable inside the loop: it is
    // narrowed here and cannot go null mid-flight.
    const id = connectionId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    async function tick(attempt: number) {
      try {
        const res = await fetch(`/api/channels/whatsapp/status?id=${encodeURIComponent(id)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const body: StatusBody = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          const why = str(body.error) ?? str(body.message) ?? `Status check failed (${res.status}).`;
          // A 5xx is the server having a moment — a restart, a dropped WAHA
          // connection — while the pairing session itself is still alive and
          // the QR on screen is still scannable. Giving up there would throw
          // away a working pairing. A 4xx is about this request (unknown id,
          // not your org) and will not fix itself.
          if (res.status < 500 || attempt >= MAX_POLLS) {
            setError(why);
            setPolling(false);
            return;
          }
          timer = setTimeout(() => void tick(attempt + 1), POLL_MS);
          return;
        }

        const next = (str(body.status) ?? "").toUpperCase();
        if (next) setStatus(next);

        // A QR expires after a few seconds and WAHA issues another. Swap it and
        // keep the old one until the replacement lands — blanking the frame on
        // a poll that happened to omit the code leaves someone aiming a camera
        // at an empty box.
        const nextQr = str(body.qr);
        if (nextQr) setQr(nextQr);

        if (next === "WORKING") {
          setPaired({
            phoneNumber: str(body.phoneNumber),
            agentId: str(body.agentId),
            warmupStartedAt: str(body.warmupStartedAt),
            dailySendCap: typeof body.dailySendCap === "number" ? body.dailySendCap : null,
          });
          setQr(null);
          setPolling(false);
          // The channels page is a server component; without this the card
          // behind the dialog still says "not connected".
          router.refresh();
          return;
        }

        if (next === "FAILED" || next === "STOPPED") {
          setError(
            str(body.error) ??
              (next === "FAILED"
                ? "WhatsApp rejected the pairing. Start again with a fresh code."
                : "The session stopped before it paired."),
          );
          setPolling(false);
          return;
        }
      } catch (e) {
        if (cancelled || ctrl.signal.aborted) return;
        // A blip while a laptop wakes up is not a failed pairing — the session
        // is alive in WAHA either way. Keep trying, and stop only on the budget.
        if (attempt >= MAX_POLLS) {
          setError(`Lost contact with the pairing service: ${e instanceof Error ? e.message : String(e)}`);
          setPolling(false);
          return;
        }
      }

      if (cancelled) return;
      if (attempt >= MAX_POLLS) {
        setStalled(true);
        setPolling(false);
        return;
      }
      timer = setTimeout(() => void tick(attempt + 1), POLL_MS);
    }

    void tick(1);

    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [open, polling, connectionId, router]);

  const pairedAgent = paired?.agentId
    ? agents.find((a) => a.id === paired.agentId)
    : agents.find((a) => a.id === agentId);

  const showQr = connectionId !== null && paired === null;
  const waiting = status === "SCAN_QR_CODE" || status === "STARTING" || status === null;

  /** One stable sentence per state — a live region that changes every poll is noise. */
  const statusLine = paired
    ? "Paired. This WhatsApp number is now linked."
    : error
      ? error
      : stalled
        ? "Stopped waiting for a scan."
        : status === "SCAN_QR_CODE"
          ? "Waiting for the code to be scanned on the phone."
          : status === "STARTING" || starting
            ? "Starting the WhatsApp session."
            : status && !TERMINAL.includes(status)
              ? `Session state: ${status}.`
              : "";

  return (
    <Modal
      open={open}
      onClose={close}
      width={620}
      title={paired ? "WhatsApp is paired" : connected ? "Pair a different number" : "Connect WhatsApp"}
      subtitle={
        paired
          ? "The number below is linked. Read the warm-up note before you test it."
          : "Scanning a QR links a real WhatsApp account — and carries a real risk. Read it first."
      }
    >
      <span aria-live="polite" className="sr-live">
        {statusLine}
      </span>

      {paired ? (
        <>
          <WhatsAppPairedPanel
            phoneNumber={paired.phoneNumber}
            agentName={pairedAgent?.name ?? null}
            delay={pairedAgent ? replyDelayOf(pairedAgent) : null}
            warmupStartedAt={paired.warmupStartedAt}
            dailySendCap={paired.dailySendCap}
          />
          <div className="card-actions">
            <button type="button" className="btn primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small" style={{ color: "var(--ink-2)", marginBottom: 12 }}>
            This links a real WhatsApp account to your agent, the same way WhatsApp Web links a
            laptop: you scan a code with the phone, and the phone stays paired. There is no
            application to Meta and nothing to approve — it is live in about two minutes.
          </p>

          {/* Before the code, never after it. Someone who reads this once the
              number is already linked has been told too late. */}
          <div className="callout warn callout-bar">
            <strong>This can get the number banned</strong>
            <p>
              WhatsApp does not offer this officially. Pairing works through the same protocol
              WhatsApp Web uses, which is <strong>against WhatsApp&apos;s terms</strong>, and numbers
              that use it do get banned. If that happens the number stops working — the account, the
              chats and the business line go with it, and there is no appeal we can file for you.
            </p>
            <p>
              <strong>Use a spare number while you test.</strong> Do not pair the number your
              customers already have, and do not pair the one printed on your invoices or your
              storefront.
            </p>
          </div>

          {showQr ? (
            <>
              <ol className="guide-steps" style={{ marginTop: 16 }}>
                <li>Open WhatsApp on the phone that owns this number.</li>
                <li>
                  Tap <strong>Settings</strong> (iPhone) or the <strong>⋮</strong> menu (Android),
                  then <strong>Linked devices</strong>.
                </li>
                <li>
                  Tap <strong>Link a device</strong> and unlock the phone if it asks.
                </li>
                <li className="key">
                  <strong>Point the camera at the code below.</strong> It expires every few seconds
                  and is replaced automatically — if the phone was slow to open, just aim at
                  whatever is on screen now.
                </li>
              </ol>

              <div className="qr-stage">
                <div className="qr-frame">
                  {qr ? (
                    <img src={qrSrc(qr) ?? ""} alt="WhatsApp pairing QR code" width={224} height={224} />
                  ) : (
                    <div className="qr-waiting">
                      {waiting && !stalled && !error && <span className="qr-pulse" aria-hidden="true" />}
                      <span>
                        {error
                          ? "No code — see the message below."
                          : stalled
                            ? "The code stopped refreshing."
                            : status === "STARTING" || status === null
                              ? "Starting the WhatsApp session…"
                              : "Waiting for a code…"}
                      </span>
                    </div>
                  )}
                </div>

                {!error && !stalled && (
                  <p className="qr-note">
                    {status === "SCAN_QR_CODE"
                      ? "The code refreshes on its own every few seconds. Leave this open until the phone confirms."
                      : "The bridge takes a few seconds to wake up the first time."}
                  </p>
                )}
              </div>

              {stalled && !error && (
                <div className="callout info callout-bar">
                  <strong>Stopped waiting</strong>
                  <p className="small">
                    Nobody scanned a code for about five minutes, so this stopped refreshing rather
                    than asking the server every two seconds all day. Press the button below for a
                    fresh code.
                  </p>
                </div>
              )}

              {error && (
                <div className="notice err block" role="alert">
                  {error}
                </div>
              )}

              <div className="card-actions">
                {(stalled || error) && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void start(agentId)}
                    disabled={starting}
                    aria-busy={starting}
                  >
                    {starting ? "Starting…" : "Get a new code"}
                  </button>
                )}
                <button type="button" className="btn" onClick={close}>
                  {stalled || error ? "Cancel" : "Close — I'll pair later"}
                </button>
              </div>
            </>
          ) : (
            <form
              className="connect-form guide-form"
              style={{ marginTop: 16 }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!acknowledged || starting) return;
                void start(agentId);
              }}
            >
              {agents.length > 0 ? (
                <div className="field">
                  <label htmlFor="wa-agent">Which agent answers</label>
                  <select
                    id="wa-agent"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    disabled={starting}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    <option value="">No agent — hold for a human</option>
                  </select>
                </div>
              ) : (
                <p className="small dim" style={{ marginBottom: 12 }}>
                  You have no agents yet — messages will be recorded and wait for a human until you
                  create one and assign it to this channel.
                </p>
              )}

              <label className="check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={starting}
                />
                <span>
                  I understand this number can be banned and that we would lose it. This is not our
                  main business line.
                </span>
              </label>

              {error && (
                <div className="notice err block" role="alert">
                  {error}
                </div>
              )}

              <div className="card-actions" style={{ marginTop: 4 }}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!acknowledged || starting}
                  aria-busy={starting}
                >
                  {starting ? "Starting the session…" : "Show the QR code"}
                </button>
                <button type="button" className="btn" onClick={close} disabled={starting}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
