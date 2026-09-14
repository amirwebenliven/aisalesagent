"use client";

import { useState, useTransition } from "react";
import { connectWidget } from "@/app/channels/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/**
 * The website widget. Connecting creates the connection row; the only thing to
 * hand over afterwards is the script tag.
 *
 * The secret in the snippet is public by design — it sits in the page source of
 * whatever site embeds it — so rendering it here is not a leak. Abuse is bounded
 * by origin allow-listing and the per-visitor rate limit in the widget route.
 */
export default function WidgetConnect({ embed }: { embed: string | null }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  if (!embed) {
    return (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            setState(null);
            start(async () => setState(await connectWidget()));
          }}
        >
          {pending ? "Creating…" : "Connect"}
        </button>
        <Notice state={state} />
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(embed!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context; over plain http on a LAN
      // address it throws. Say so rather than showing a button that did nothing.
      setState({ ok: false, error: "Copy is blocked here — select the snippet and copy it by hand." });
    }
  }

  return (
    <div className="snippet-block">
      <div className="small dim mono lab">Paste this before &lt;/body&gt;</div>
      <pre className="snippet">{embed}</pre>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy snippet"}
        </button>
        <Notice state={state} />
      </div>
    </div>
  );
}
