"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { connectTelegramChannel, type TelegramConnectResult } from "@/app/(app)/channels/actions";
import Modal from "@/components/ui/Modal";

/**
 * The whole Telegram setup, in one dialog.
 *
 * Written for someone who has never made a bot. The steps and the token box
 * live together on purpose: a guide that sends you back to the card to find the
 * field is a guide you read twice.
 *
 * What it will not do is pretend. Telegram's own error text is rendered
 * verbatim — "Unauthorized" tells someone they pasted a dead token, and
 * "something went wrong" tells them to open a support ticket.
 */

export type GuideAgent = {
  id: string;
  name: string;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
};

export type ReplyDelay = { minSec: number; maxSec: number };

/** Seconds, rounded — the note is about what to expect, not a stopwatch. */
export function replyDelayOf(agent: GuideAgent | undefined): ReplyDelay | null {
  if (!agent) return null;
  return {
    minSec: Math.round(agent.replyDelayMinMs / 1000),
    maxSec: Math.round(agent.replyDelayMaxMs / 1000),
  };
}

/**
 * lib/channels/telegram.ts writes its notes with `backticks` around commands.
 * Rendering them as code is typesetting; changing the sentence would be
 * rewriting a message the server owns.
 */
function withInlineCode(text: string): ReactNode[] {
  return text.split(/`([^`]+)`/g).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="mono code-inline">
        {part}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Everything someone needs the moment the bot exists — and again tomorrow, which
 * is why this is a component and not a paragraph inside the modal. It renders
 * both in the post-connect dialog and on the connected channel card.
 */
export function TelegramBotPanel({
  username,
  delay,
  note,
}: {
  username: string;
  /** null = no agent assigned, so nothing will answer. undefined = not known here. */
  delay?: ReplyDelay | null;
  /** The server's own note, e.g. polling mode on a non-https APP_URL. */
  note?: string | null;
}) {
  const link = `https://t.me/${username}`;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard API needs a secure context; over plain http on a LAN
      // address it throws. Say so rather than leaving a button that did nothing.
      setCopyError("Copy is blocked here — select the link and copy it by hand.");
    }
  }

  return (
    <div className="bot-panel">
      <div className="bot-panel-top">
        <span className="pill ok">
          <span className="dot" />
          connected
        </span>
        <strong className="mono bot-handle">@{username}</strong>
      </div>

      <div className="field-lab lab mono dim">Share this link</div>
      <div className="bot-link-row">
        <a className="bot-link mono" href={link} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <span aria-live="polite" className="sr-live">
        {copied ? "Link copied to clipboard" : ""}
      </span>
      {copyError && (
        <p className="notice err" role="status">
          {copyError}
        </p>
      )}

      {/* The failure that actually happened: a friend was messaged directly on
          Telegram instead of opening the bot, and nobody could see why nothing
          arrived. It is not a footnote. */}
      <div className="callout warn bot-start">
        <strong>They must press START first</strong>
        <p className="small">
          Whoever you send this to has to open the link in Telegram and press <strong>START</strong>{" "}
          before the bot can reply. Telegram does not let a bot message anyone who has not started a
          conversation with it first — so messaging <em>you</em> on Telegram, or any other chat,
          reaches nothing.
        </p>
      </div>

      {delay === null ? (
        <p className="small dim">
          No agent is answering this channel yet — messages will be recorded and wait for a human
          until you assign one.
        </p>
      ) : delay ? (
        <p className="small dim">
          Replies take {delay.minSec}–{delay.maxSec} seconds by design — the agent waits a
          human-like moment before answering. Half a minute of silence is the feature, not a fault.
        </p>
      ) : null}

      {/* The <p> matters: .callout is a flex column, so bare inline runs would
          each become a flex item and the command would sit on a line of its
          own with its full stop orphaned on the next. */}
      {note && (
        <div className="callout info bot-note">
          <p>{withInlineCode(note)}</p>
        </div>
      )}
    </div>
  );
}

/** A masked shape, not a token. Never paste a live one into a screenshot or a UI. */
const EXAMPLE_TOKEN = "1234567890:AAFq7d••••••••••••••••••••••••••••";

export default function TelegramGuide({
  open,
  onClose,
  agents,
  currentAgentId,
}: {
  open: boolean;
  onClose: () => void;
  agents: GuideAgent[];
  currentAgentId?: string | null;
}) {
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [agentId, setAgentId] = useState(currentAgentId ?? agents[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<TelegramConnectResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const tokenRef = useRef<HTMLInputElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  function close() {
    // The token never outlives the dialog. It is full control of the customer's
    // bot; there is no reason for it to sit in a React tree afterwards.
    setToken("");
    setReveal(false);
    setError(null);
    setDone(null);
    onClose();
  }

  function submit() {
    if (pending || !token.trim()) return;
    setError(null);
    start(async () => {
      const result = await connectTelegramChannel({
        botToken: token.trim(),
        agentId: agentId || null,
      });
      if (result.ok) {
        setToken("");
        setReveal(false);
        setDone(result);
      } else {
        setError(result.error);
        // Pressing Connect disables it, which drops focus to <body>, and the
        // message renders below the fold on a short window — so the refusal
        // could be missed entirely. Put the cursor back where the fix is and
        // bring the reason on screen. setTimeout, not rAF: rAF never fires in
        // a backgrounded tab, and this must survive someone alt-tabbing to
        // Telegram to re-copy the token.
        setTimeout(() => {
          tokenRef.current?.focus();
          tokenRef.current?.select();
          errorRef.current?.scrollIntoView({ block: "nearest" });
        }, 0);
      }
    });
  }

  const connectedAgent = done ? agents.find((a) => a.id === done.agentId) : undefined;

  return (
    <Modal
      open={open}
      onClose={close}
      width={620}
      title={done ? "Your bot is live" : "Create your Telegram bot"}
      subtitle={
        done
          ? "Send the link below to anyone who should be able to talk to it."
          : "Telegram hands out bots through a bot. Six steps, about two minutes."
      }
    >
      {done ? (
        <>
          <TelegramBotPanel
            username={done.username}
            delay={done.agentId ? replyDelayOf(connectedAgent) : null}
            note={done.note}
          />
          <div className="card-actions">
            <button type="button" className="btn primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className="guide-steps">
            <li>
              Open Telegram and search for{" "}
              <a
                className="guide-link mono"
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
              >
                @BotFather
              </a>
              . It is Telegram&apos;s official account for making bots — the one with the blue
              verified tick.
            </li>
            <li>
              Send it <code className="mono code-inline">/newbot</code>.
            </li>
            <li>
              Choose a <strong>display name</strong> — this is what your customers see at the top of
              the chat, e.g. <span className="mono">Acme Support</span>.
            </li>
            <li>
              Choose a <strong>username</strong> — it must be unique and end in{" "}
              <span className="mono">bot</span>, e.g.{" "}
              <span className="mono">acme_support_bot</span>. If it is taken, BotFather asks again.
            </li>
            {/* The step people scroll past. The token is in the middle of a wall
                of BotFather's text, and half of them copy the wrong line. */}
            <li className="key">
              <strong>BotFather replies with a token.</strong> One long line that looks like this:
              <span className="token-sample mono">{EXAMPLE_TOKEN}</span>
              Copy the whole thing — digits, colon and all. Nothing else in that message matters.
              Treat it like a password: anyone holding it controls the bot.
            </li>
            <li>Paste it below and press Connect.</li>
          </ol>

          <form
            className="connect-form guide-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="field">
              <label htmlFor="tg-token">Bot token</label>
              <span className="hint">Stored encrypted. It is never shown again after this.</span>
              <div className="input-with-action">
                <input
                  id="tg-token"
                  ref={tokenRef}
                  type={reveal ? "text" : "password"}
                  value={token}
                  // The message goes the moment they start fixing it. A
                  // rejection still sitting under a token they have since
                  // retyped reads as a second failure.
                  onChange={(e) => {
                    setToken(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="1234567890:AAFq7d…"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setReveal((r) => !r)}
                  aria-pressed={reveal}
                  disabled={pending}
                >
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {agents.length > 0 && (
              <div className="field">
                <label htmlFor="tg-agent">Which agent answers</label>
                <select
                  id="tg-agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={pending}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="">No agent — hold for a human</option>
                </select>
              </div>
            )}

            {error && (
              <div className="notice err block" role="alert" ref={errorRef}>
                {error}
              </div>
            )}

            <div className="card-actions" style={{ marginTop: 4 }}>
              <button
                type="submit"
                className="btn primary"
                disabled={pending || !token.trim()}
                aria-busy={pending}
              >
                {pending ? "Checking with Telegram…" : "Connect"}
              </button>
              <button type="button" className="btn" onClick={close} disabled={pending}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
