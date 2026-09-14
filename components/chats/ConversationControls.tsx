"use client";

import { useState, useTransition } from "react";
import { setConversationState } from "@/app/chats/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

const LABEL: Record<string, string> = {
  AI_ACTIVE: "AI replying",
  HUMAN_ACTIVE: "human handling",
  CLOSED: "closed",
};

/** Who owns this thread, and the two buttons that change it. */
export default function ConversationControls({
  conversationId,
  state,
}: {
  conversationId: string;
  state: "AI_ACTIVE" | "HUMAN_ACTIVE" | "CLOSED";
}) {
  const [result, setResult] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  const move = (next: string) => {
    setResult(null);
    start(async () => setResult(await setConversationState(conversationId, next)));
  };

  const pill = state === "HUMAN_ACTIVE" ? "warn" : state === "CLOSED" ? "mute" : "ok";

  return (
    <>
      {result && !result.ok && <Notice state={result} />}
      <span className={`pill ${pill}`}>
        <span className="dot" />
        {LABEL[state]}
      </span>

      {state === "AI_ACTIVE" ? (
        <button className="btn" onClick={() => move("HUMAN_ACTIVE")} disabled={pending} aria-busy={pending}>
          {pending ? "…" : "Take over"}
        </button>
      ) : (
        <button className="btn" onClick={() => move("AI_ACTIVE")} disabled={pending} aria-busy={pending}>
          {pending ? "…" : state === "CLOSED" ? "Reopen for the AI" : "Hand back to AI"}
        </button>
      )}

      {state !== "CLOSED" && (
        <button className="btn" onClick={() => move("CLOSED")} disabled={pending}>
          Close
        </button>
      )}
    </>
  );
}
