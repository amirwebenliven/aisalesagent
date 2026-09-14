"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The sandbox conversation.
 *
 * Posts to /api/agent/try, which runs the real prompt, the real model and the
 * real tool loop but persists NOTHING — no contact, no conversation, no usage
 * row. What comes back is the reply bubbles, the tool calls the model made, and
 * what the turn cost.
 *
 * Showing the tool calls is the point of the screen: "it replied nicely" is
 * easy to fake, "it called alertHuman the moment the customer got annoyed" is
 * the product.
 */

type Usage = { promptTokens: number; cachedTokens: number; outputTokens: number };
type ToolCallView = { id: string; name: string; args: unknown; result: string };
/** What the route accepts as prior context — one of the two shapes it parses. */
type HistoryItem = { role: "user" | "assistant"; content: string };

type Turn =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "agent";
      id: string;
      bubbles: string[];
      toolCalls: ToolCallView[];
      usage: Usage;
      costUsd: number;
      model: string | null;
      steps: number;
      stopped: string;
      reason?: string;
    };

type TryResponse = {
  bubbles?: string[];
  toolCalls?: ToolCallView[];
  usage?: Usage;
  costUsd?: number;
  model?: string | null;
  steps?: number;
  stopped?: string;
  reason?: string;
  error?: string;
};

const EMPTY_USAGE: Usage = { promptTokens: 0, cachedTokens: 0, outputTokens: 0 };

function money(n: number): string {
  // Turns cost fractions of a cent; two decimals would render every one as $0.00.
  return `$${n.toFixed(6)}`;
}

function argsText(args: unknown): string {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

export default function TryOut({
  agentId,
  agentName,
  tools,
}: {
  agentId: string;
  agentName: string;
  tools: { name: string; description: string }[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sessionCost = turns.reduce((a, t) => a + (t.kind === "agent" ? t.costUsd : 0), 0);
  const fired = new Set(
    turns.flatMap((t) => (t.kind === "agent" ? t.toolCalls.map((c) => c.name) : [])),
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending]);

  async function send() {
    const message = text.trim();
    if (!message || pending) return;

    setError(null);
    setPending(true);
    setText("");
    setTurns((prev) => [...prev, { kind: "user", id: `u${Date.now()}`, text: message }]);

    // The API rebuilds the prompt from scratch each turn, so it needs the
    // transcript back. Capped at 40 items, which is the route's own limit.
    const history: HistoryItem[] = turns
      .flatMap((t): HistoryItem[] =>
        t.kind === "user"
          ? [{ role: "user", content: t.text }]
          : t.bubbles.map((b) => ({ role: "assistant", content: b })),
      )
      .slice(-40);

    try {
      const res = await fetch("/api/agent/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, message, history }),
      });

      // A 500 or an auth redirect returns HTML, and res.json() would throw a
      // parser error that says nothing about what actually happened.
      const data = (await res.json().catch(() => null)) as TryResponse | null;

      if (!res.ok || !data) {
        setError(data?.error ?? `The sandbox returned ${res.status} ${res.statusText}.`);
        return;
      }

      setTurns((prev) => [
        ...prev,
        {
          kind: "agent",
          id: `a${Date.now()}`,
          bubbles: data.bubbles ?? [],
          toolCalls: data.toolCalls ?? [],
          usage: data.usage ?? EMPTY_USAGE,
          costUsd: data.costUsd ?? 0,
          model: data.model ?? null,
          steps: data.steps ?? 0,
          stopped: data.stopped ?? "complete",
          reason: data.reason,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card card-p">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 className="sec">Try out</h2>
          <p className="small dim">
            The real prompt, the real model, the real tools — nothing is saved. No conversation, no
            contact, no usage row. It runs the <strong>saved</strong> instructions, so save first if
            you have just edited them.
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="small dim mono" style={{ fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase" }}>
            Session cost
          </div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{money(sessionCost)}</div>
        </div>
      </div>

      <div className="tool-roster">
        {tools.map((t) => (
          <span key={t.name} className={`pill ${fired.has(t.name) ? "info" : "mute"}`} title={t.description}>
            {fired.has(t.name) ? "▸ " : ""}
            {t.name}
          </span>
        ))}
      </div>

      <div className="sandbox" ref={bodyRef}>
        {turns.length === 0 && !pending && (
          <div className="empty">
            Send a message as a customer would. Try one the agent should escalate — that is the
            behaviour worth checking.
          </div>
        )}

        {turns.map((t) =>
          t.kind === "user" ? (
            <div key={t.id} className="bubble in">
              {t.text}
              <span className="stamp">you, as the customer</span>
            </div>
          ) : (
            <div key={t.id} className="turn">
              {t.toolCalls.map((c) => (
                <details key={c.id} className="toolcall">
                  <summary>
                    <span className="pill info">tool</span>
                    <span className="mono">{c.name}</span>
                    <span className="dim small">called mid-turn</span>
                  </summary>
                  <div className="toolcall-body">
                    <div className="small dim mono lab">arguments</div>
                    <pre>{argsText(c.args)}</pre>
                    <div className="small dim mono lab">result the model read next</div>
                    <pre>{c.result}</pre>
                  </div>
                </details>
              ))}

              {t.bubbles.map((b, i) => (
                <div key={i} className="bubble out">
                  {b}
                  <span className="stamp">{agentName}</span>
                </div>
              ))}

              {t.bubbles.length === 0 && (
                <div className="bubble out dim">
                  (no text — the model ended the turn without saying anything)
                  <span className="stamp">{agentName}</span>
                </div>
              )}

              <div className="turn-meta mono">
                <span>{money(t.costUsd)}</span>
                <span>{t.model ?? "—"}</span>
                <span>
                  {t.steps} step{t.steps === 1 ? "" : "s"}
                </span>
                <span>
                  {t.usage.promptTokens} in
                  {t.usage.cachedTokens ? ` (${t.usage.cachedTokens} cached)` : ""} · {t.usage.outputTokens} out
                </span>
                {t.stopped !== "complete" && (
                  <span className="pill warn">
                    {t.stopped}
                    {t.reason ? `: ${t.reason}` : ""}
                  </span>
                )}
              </div>
            </div>
          ),
        )}

        {pending && <div className="bubble out dim">thinking…</div>}
      </div>

      {error && <div className="notice err block">{error}</div>}

      <div className="composer" style={{ border: "1px solid var(--line)", borderRadius: 6, marginTop: 12 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Send the agent a test message…"
          disabled={pending}
          aria-label="Test message"
        />
        <button type="button" className="btn primary" onClick={() => void send()} disabled={pending || !text.trim()}>
          {pending ? "Running…" : "Send"}
        </button>
        {turns.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTurns([]);
              setError(null);
            }}
            disabled={pending}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
