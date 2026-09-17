"use client";

import { useActionState, useState, useTransition } from "react";
import { clearApiKey, saveSettings } from "@/app/(app)/settings/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";

/**
 * Model, spend cap and the optional own key.
 *
 * The key field is always empty on load and its placeholder is literal dots —
 * nothing derived from the stored value reaches this component, so there is no
 * version of this screen that can leak a prefix of a live credential.
 */
export default function SettingsForm({
  modelChat,
  modelUtility,
  modelBaseUrl,
  dailyCostCapUsd,
  byok,
  platformDefaults,
  platformCapUsd,
}: {
  modelChat: string;
  modelUtility: string;
  modelBaseUrl: string;
  dailyCostCapUsd: string;
  byok: boolean;
  platformDefaults: { chat: string; utility: string };
  platformCapUsd: number;
}) {
  const [state, formAction] = useActionState(saveSettings, null);
  const [removal, setRemoval] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  return (
    <form action={formAction} className="card card-p">
      <div className="grid g3" style={{ marginBottom: 4 }}>
        <div className="field">
          <label htmlFor="modelChat">Conversation model</label>
          <span className="hint">Handles replies and tool calls. Quality matters here.</span>
          <input id="modelChat" name="modelChat" defaultValue={modelChat} placeholder={platformDefaults.chat} />
        </div>
        <div className="field">
          <label htmlFor="modelUtility">Utility model</label>
          <span className="hint">Extraction and classification only — use the cheapest.</span>
          <input id="modelUtility" name="modelUtility" defaultValue={modelUtility} placeholder={platformDefaults.utility} />
        </div>
        <div className="field">
          <label htmlFor="dailyCostCapUsd">Daily spend cap (USD)</label>
          <span className="hint">
            Hard stop. The platform also caps every workspace at ${platformCapUsd} a day, and the
            lower of the two wins.
          </span>
          <input id="dailyCostCapUsd" name="dailyCostCapUsd" inputMode="decimal" defaultValue={dailyCostCapUsd} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="modelApiKey">
          Your own API key
          <span className="pill mute" style={{ marginLeft: 6 }}>{byok ? "in use" : "optional"}</span>
        </label>
        <span className="hint">
          Bring your own key and requests go to your provider on your bill instead of ours. Any
          OpenAI-compatible endpoint works, including MeshAPI. Stored encrypted and never shown
          again — leave this blank to keep the key you already have.
        </span>
        <input
          id="modelApiKey"
          name="modelApiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={byok ? "••••••••••••••••  (stored — blank leaves it alone)" : "sk-… (leave blank to use the platform key)"}
        />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="modelBaseUrl">Provider URL</label>
        <span className="hint">Only needed with your own key, and only if it is not MeshAPI.</span>
        <input id="modelBaseUrl" name="modelBaseUrl" defaultValue={modelBaseUrl} placeholder="https://api.openai.com/v1" />
      </div>

      <div className="save-bar">
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
        {byok && (
          <button
            type="button"
            className="btn"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              setRemoval(null);
              start(async () => setRemoval(await clearApiKey()));
            }}
          >
            {pending ? "Removing…" : "Remove my key"}
          </button>
        )}
        <Notice state={state} />
        <Notice state={removal} />
      </div>
    </form>
  );
}
