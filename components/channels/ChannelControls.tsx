"use client";

import { useState, useTransition } from "react";
import { assignAgent, disconnectChannel, pauseChannel, resumeChannel } from "@/app/(app)/channels/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/**
 * What you can do to a live channel: choose who answers it, pause it, or
 * disconnect it.
 *
 * Pause keeps the provider link and stops the agent. Disconnect ends the link —
 * WhatsApp is logged out of the phone, Telegram's webhook is removed and the
 * token forgotten, the widget's embed secret is rotated — and keeps every
 * conversation. There is still no delete: a ChannelConnection cascades to its
 * conversations and every message in them, and "disconnect" must never mean
 * "erase the customer's history".
 *
 * Disconnect asks once, inline, with the consequence spelled out for THIS
 * channel — a native confirm() would say "Are you sure?" and nothing else, and
 * what happens to the phone is the thing worth knowing before pressing it.
 */
const DISCONNECT_COPY: Record<string, string> = {
  WHATSAPP_QR:
    "Logs this number out of the link — it disappears from the phone's Linked devices and the agent stops answering on it. Every conversation stays in the inbox. Reconnect by scanning a new QR.",
  TELEGRAM:
    "Removes the webhook and forgets the bot token. The bot stops answering until a token is connected again. Every conversation stays in the inbox.",
  WIDGET:
    "Disables the embed code on your site — the old snippet stops working for good. Connect again to get a new snippet. Every conversation stays in the inbox.",
};

export default function ChannelControls({
  channelId,
  kind,
  status,
  agentId,
  agents,
}: {
  channelId: string;
  kind: string;
  status: string;
  agentId: string | null;
  agents: { id: string; name: string }[];
}) {
  const [state, setState] = useState<ActionState>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const paused = status === "PAUSED";

  return (
    <>
      <div className="channel-controls">
        {agents.length > 0 && (
          <select
            value={agentId ?? ""}
            disabled={pending}
            aria-label="Agent answering this channel"
            onChange={(e) => {
              const next = e.target.value;
              setState(null);
              start(async () => setState(await assignAgent(channelId, next)));
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="">No agent — hold for a human</option>
          </select>
        )}

        <button
          type="button"
          className="btn"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            setState(null);
            start(async () => setState(paused ? await resumeChannel(channelId) : await pauseChannel(channelId)));
          }}
        >
          {pending ? "…" : paused ? "Resume" : "Pause"}
        </button>

        <button
          type="button"
          className="btn ghost"
          disabled={pending || confirming}
          onClick={() => {
            setState(null);
            setConfirming(true);
          }}
        >
          Disconnect…
        </button>
      </div>

      {confirming && (
        <div className="callout warn callout-bar" style={{ marginTop: 10 }}>
          <strong>Disconnect this channel?</strong>
          <p className="small">{DISCONNECT_COPY[kind] ?? "Ends the connection. Every conversation stays in the inbox."}</p>
          <div className="card-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  setState(await disconnectChannel(channelId));
                  setConfirming(false);
                })
              }
            >
              {pending ? "Disconnecting…" : "Yes, disconnect"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      <Notice state={state} />
    </>
  );
}
