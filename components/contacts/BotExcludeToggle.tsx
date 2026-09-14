"use client";

import { useState, useTransition } from "react";
import { setBotExcluded } from "@/app/contacts/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/** Whether the AI is allowed to answer this person. */
export default function BotExcludeToggle({ contactId, excluded }: { contactId: string; excluded: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {state && !state.ok && <Notice state={state} />}
      <button
        type="button"
        className="btn"
        disabled={pending}
        aria-busy={pending}
        title={excluded ? "The AI never answers this contact" : "The AI answers this contact"}
        onClick={() => {
          setState(null);
          start(async () => setState(await setBotExcluded(contactId, !excluded)));
        }}
      >
        {pending ? "…" : excluded ? "Muted — let the AI reply" : "Mute the AI"}
      </button>
    </span>
  );
}
