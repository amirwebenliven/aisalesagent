"use client";

import { useState, useTransition } from "react";
import { sendHumanReply } from "@/app/(app)/chats/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/**
 * The human reply box. Sending persists the message, hands the thread to the
 * human, and delivers it on the channel — see sendHumanReply.
 *
 * The text is controlled state rather than an uncontrolled form field because a
 * form action resets the field when it completes, including when it FAILED.
 * Losing a paragraph you just typed because the bot token expired is the wrong
 * way round; on failure the text stays put so you can press send again.
 */
export default function Composer({ conversationId, closed }: { conversationId: string; closed: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  function send() {
    if (pending || !text.trim()) return;
    const body = text;
    setState(null);
    start(async () => {
      const result = await sendHumanReply(conversationId, body);
      if (result?.ok) setText("");
      setState(result);
    });
  }

  return (
    <div className="composer-wrap">
      {state && (state.error || state.message) && (
        <div className="composer-note">
          <Notice state={state} />
        </div>
      )}
      <div className="composer">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            closed
              ? "Replying reopens this conversation and pauses the AI"
              : "Type a reply — this pauses the AI on this conversation"
          }
          disabled={pending}
          aria-label="Reply"
        />
        <button className="btn primary" onClick={send} disabled={pending || !text.trim()} aria-busy={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
