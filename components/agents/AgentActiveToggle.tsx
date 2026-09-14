"use client";

import { useState, useTransition } from "react";
import { setAgentActive } from "@/app/agents/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/** Live / paused, with the pill next to the button that changes it. */
export default function AgentActiveToggle({ agentId, isActive }: { agentId: string; isActive: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  return (
    <>
      {state && !state.ok && <Notice state={state} />}
      <span className={`pill ${isActive ? "ok" : "mute"}`}>
        <span className="dot" />
        {isActive ? "active" : "paused"}
      </span>
      <button
        type="button"
        className="btn"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setState(null);
          start(async () => setState(await setAgentActive(agentId, !isActive)));
        }}
      >
        {pending ? "…" : isActive ? "Pause" : "Activate"}
      </button>
    </>
  );
}
