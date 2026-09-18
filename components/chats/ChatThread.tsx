"use client";

import { useEffect, useRef } from "react";

export type ThreadMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  /** A photo the agent sent; the body is its caption (often empty). */
  mediaUrl?: string | null;
  stamp: string;
};

/** Only an absolute http(s) URL is drawn — never javascript: or data:. */
function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

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
      {messages.map((m) => {
        // A colleague taking over has to SEE the photo the agent sent, or they
        // answer "is this the one with the golden border?" blind.
        const img = safeImageUrl(m.mediaUrl);
        return (
          <div key={m.id} className={`bubble ${m.direction === "INBOUND" ? "in" : "out"}`}>
            {img && (
              // eslint-disable-next-line @next/next/no-img-element -- a remote URL from the tenant's own site; next/image would need every host allow-listed
              <img
                src={img}
                alt={m.body || "photo"}
                loading="lazy"
                style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 8, marginBottom: m.body ? 6 : 0 }}
              />
            )}
            {m.body}
            <span className="stamp">{m.stamp}</span>
          </div>
        );
      })}
      {messages.length === 0 && <div className="empty">No messages yet.</div>}
    </div>
  );
}
