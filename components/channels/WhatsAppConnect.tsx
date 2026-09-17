"use client";

import { useState } from "react";
import { replyDelayOf, type GuideAgent } from "./TelegramGuide";
import WhatsAppGuide, { WhatsAppPairedPanel } from "./WhatsAppGuide";

/**
 * The WhatsApp card's own controls.
 *
 * Before pairing: one button, and the risk lives one click away inside the
 * dialog rather than on the card — the card already carries the one-line
 * caution, and a wall of warning text on a catalogue tile gets skimmed by
 * everyone including the people it is for.
 *
 * After pairing: the number, who answers it and the warm-up stay on the card.
 * The warm-up runs for sixty days and the question "why is it so quiet" is
 * asked on day nine, not in the minute after the QR was scanned — an answer
 * that only existed inside a dismissed modal is an answer nobody has.
 *
 * The agent picker and Pause come from ChannelControls, rendered next to this
 * by the page. Nothing here touches a credential: the WhatsApp session lives in
 * WAHA and this component only ever sees a number and a state string.
 */
export default function WhatsAppConnect({
  agents,
  connected,
}: {
  agents: GuideAgent[];
  connected?: {
    phoneNumber: string | null;
    agentId: string | null;
    status: string;
    /** ISO — the page serialises the Date so this side does no timezone maths. */
    warmupStartedAt: string | null;
    dailySendCap: number | null;
  } | null;
}) {
  const [open, setOpen] = useState(false);

  const assigned = connected?.agentId ? agents.find((a) => a.id === connected.agentId) : undefined;

  return (
    <>
      {connected ? (
        <>
          <WhatsAppPairedPanel
            phoneNumber={connected.phoneNumber}
            agentName={assigned?.name ?? null}
            delay={connected.agentId ? replyDelayOf(assigned) : null}
            warmupStartedAt={connected.warmupStartedAt}
            dailySendCap={connected.dailySendCap}
            paused={connected.status === "PAUSED"}
          />
          <div className="card-actions">
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
              Pair a different number
            </button>
          </div>
        </>
      ) : (
        <div className="card-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Connect WhatsApp
          </button>
        </div>
      )}

      <WhatsAppGuide
        open={open}
        onClose={() => setOpen(false)}
        agents={agents}
        currentAgentId={connected?.agentId ?? null}
        connected={Boolean(connected)}
      />
    </>
  );
}
