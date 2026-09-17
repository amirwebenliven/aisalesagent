"use client";

import { useState, useTransition } from "react";
import { createAgent } from "@/app/(app)/agents/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/** Creates an agent with starter instructions and opens it. */
export default function NewAgentButton() {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  return (
    <>
      {state && !state.ok && <Notice state={state} />}
      <button
        type="button"
        className="btn primary"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setState(null);
          // createAgent redirects on success, so the transition ends on the new
          // page and nothing here re-renders.
          start(async () => setState(await createAgent()));
        }}
      >
        {pending ? "Creating…" : "New agent"}
      </button>
    </>
  );
}
