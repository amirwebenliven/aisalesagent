"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ConnectResponse = {
  ok?: boolean;
  connection?: { id: string; displayName: string; username: string; status: string };
  webhookUrl?: string;
  error?: string;
};

/**
 * Paste the BotFather token, we validate it against Telegram, store it
 * encrypted and register the webhook.
 *
 * The token goes to /api/channels/telegram/connect and is never held in state
 * after the request, never echoed back by the server, and never rendered again.
 * What comes back is the bot's username — the thing that proves it worked.
 */
export default function TelegramConnect({
  agents,
  currentAgentId,
}: {
  agents: { id: string; name: string }[];
  currentAgentId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [agentId, setAgentId] = useState(currentAgentId ?? agents[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ConnectResponse | null>(null);

  async function connect() {
    if (pending || !token.trim()) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/channels/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim(), agentId: agentId || undefined }),
      });
      const data = (await res.json().catch(() => null)) as ConnectResponse | null;

      if (!res.ok || !data?.ok) {
        // Telegram's own words — "Unauthorized" means the token, "bad webhook"
        // means APP_URL. Collapsing them into one message hides which.
        setError(data?.error ?? `Connect failed with ${res.status} ${res.statusText}.`);
        return;
      }

      setToken("");
      setDone(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (done?.connection) {
    return (
      <div className="connected-note">
        <span className="pill ok">
          <span className="dot" />
          connected
        </span>
        <span className="mono small">@{done.connection.username}</span>
        <p className="small dim" style={{ marginTop: 6 }}>
          Message the bot on Telegram to test it. Inbound messages appear in Chats.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Connect
      </button>
    );
  }

  return (
    <div className="connect-form">
      <div className="field">
        <label htmlFor="tg-token">Bot token</label>
        <span className="hint">
          From @BotFather: <span className="mono">/newbot</span>, then paste what it gives you. Stored
          encrypted, never shown again.
        </span>
        <input
          id="tg-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456789:AA…"
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />
      </div>

      {agents.length > 0 && (
        <div className="field">
          <label htmlFor="tg-agent">Which agent answers</label>
          <select id="tg-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={pending}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="">No agent — hold for a human</option>
          </select>
        </div>
      )}

      {error && <div className="notice err block">{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn primary" onClick={() => void connect()} disabled={pending || !token.trim()}>
          {pending ? "Talking to Telegram…" : "Connect"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
