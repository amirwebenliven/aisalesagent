"use client";

import { useEffect, useRef } from "react";

export type ThreadMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  stamp: string;
};

/**
 * The message list, pinned to the newest message.
 *
 * Times are formatted on the server and passed as strings: formatting a Date
 * here would use the visitor's timezone on the client and the server's during
 * SSR, which React reports as a hydration mismatch on every thread.
 *
 * Mount the component with key={conversationId} — switching conversations then
 * remounts it and the first paint is already at the bottom, instead of
 * animating through someone else's history.
 */
export default function ChatThread({ messages }: { messages: ThreadMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Instant on first paint (nobody watched it arrive), smooth for a message
    // that lands while you are reading.
    el.scrollTo({ top: el.scrollHeight, behavior: mounted.current ? "smooth" : "auto" });
    mounted.current = true;
  }, [lastId]);

  return (
    <div className="thread-body" ref={ref}>
      {messages.map((m) => (
        <div key={m.id} className={`bubble ${m.direction === "INBOUND" ? "in" : "out"}`}>
          {m.body}
          <span className="stamp">{m.stamp}</span>
        </div>
      ))}
      {messages.length === 0 && <div className="empty">No messages yet.</div>}
    </div>
  );
}
