"use client";

import { useState, useTransition } from "react";
import { refreshSource } from "@/app/(app)/knowledge/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";

/** Re-crawl one source. Hand-written answers attached to it survive. */
export default function RefreshSourceButton({ sourceId, busy }: { sourceId: string; busy: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
      {state && !state.ok && <Notice state={state} />}
      <button
        type="button"
        className="btn"
        disabled={pending || busy}
        aria-busy={pending}
        onClick={() => {
          setState(null);
          start(async () => setState(await refreshSource(sourceId)));
        }}
      >
        {pending || busy ? "Crawling…" : "Refresh"}
      </button>
    </span>
  );
}
