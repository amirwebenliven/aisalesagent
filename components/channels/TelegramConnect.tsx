"use client";

import { useState } from "react";
import TelegramGuide, { TelegramBotPanel, replyDelayOf, type GuideAgent } from "./TelegramGuide";

/**
 * The Telegram card's own controls.
 *
 * Before connecting: the two ways in — Connect, and "How do I get a token?" for
 * the customer who has never met BotFather. Both open the same dialog, because
 * the answer to "how do I get a token" is the form you paste it into.
 *
 * After connecting: the bot's handle, its t.me link and the START warning stay
 * on the card. They are needed tomorrow, not only in the thirty seconds after
 * the token was accepted, and a link that exists only inside a dismissed modal
 * is a link that gets hunted for in Telegram's own settings.
 *
 * The token itself never lives here — it goes straight to a Server Action and
 * is never echoed back, logged, or rendered again.
 */
export default function TelegramConnect({
  agents,
  connected,
}: {
  agents: GuideAgent[];
  connected?: { username: string; agentId: string | null; note: string | null } | null;
}) {
  const [open, setOpen] = useState(false);

  const assigned = connected?.agentId ? agents.find((a) => a.id === connected.agentId) : undefined;

  return (
    <>
      {connected ? (
        <>
          <TelegramBotPanel
            username={connected.username}
            delay={connected.agentId ? replyDelayOf(assigned) : null}
            note={connected.note}
          />
          <div className="card-actions">
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
              Use a different token
            </button>
          </div>
        </>
      ) : (
        <div className="card-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Connect
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
            How do I get a token?
          </button>
        </div>
      )}

      <TelegramGuide
        open={open}
        onClose={() => setOpen(false)}
        agents={agents}
        currentAgentId={connected?.agentId ?? null}
      />
    </>
  );
}
