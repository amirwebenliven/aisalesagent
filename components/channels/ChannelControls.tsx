"use client";

import { useState, useTransition } from "react";
import { assignAgent, pauseChannel, resumeChannel } from "@/app/(app)/channels/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/**
 * What you can do to a live channel: pause it, and choose who answers it.
 *
 * There is no delete. Deleting a connection cascades to its conversations and
 * every message in them — pausing stops the channel and keeps the history.
 */
export default function ChannelControls({
  channelId,
  status,
  agentId,
  agents,
}: {
  channelId: string;
  status: string;
  agentId: string | null;
  agents: { id: string; name: string }[];
}) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const paused = status === "PAUSED";

  return (
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

      <Notice state={state} />
    </div>
  );
}
