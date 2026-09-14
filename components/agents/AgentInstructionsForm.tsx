"use client";

import { useActionState, useState } from "react";
import { saveAgent } from "@/app/agents/actions";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";

export type AgentFormValues = {
  id: string;
  name: string;
  persona: string;
  goal: string;
  companyInfo: string;
  rules: string;
  conversationFlow: string;
  alertHumanWhen: string;
  concludeWhen: string;
  extraContext: string;
  primaryLanguage: string;
  modelOverride: string;
  // Strings, not numbers: a controlled number field that coerces every keystroke
  // turns an emptied box into "0" and fights the person retyping it. The action
  // validates and coerces on the way in.
  replyDelayMinMs: string;
  replyDelayMaxMs: string;
  maxRepliesPerTurn: string;
  splitMessages: boolean;
};

type TextKey =
  | "persona"
  | "goal"
  | "companyInfo"
  | "rules"
  | "conversationFlow"
  | "alertHumanWhen"
  | "concludeWhen"
  | "extraContext";

// Mirrors the step structure we studied on DM Champ — each concern named and
// separate, so a non-developer can tune one part without collapsing the rest.
const FIELDS: { key: TextKey; label: string; hint: string; rows: number }[] = [
  { key: "persona", label: "Who you are", hint: "The bot's name, role and personality.", rows: 4 },
  { key: "goal", label: "Your goal", hint: "What a successful conversation achieves.", rows: 3 },
  { key: "companyInfo", label: "About the business", hint: "Products, customers, credentials.", rows: 6 },
  { key: "rules", label: "Rules you must follow", hint: "Guardrails — what it must never do or say.", rows: 5 },
  { key: "conversationFlow", label: "How the conversation should go", hint: "Numbered steps.", rows: 5 },
  {
    key: "alertHumanWhen",
    label: "When to hand over to a human",
    hint: "The most important field. This is what makes the agent safe to deploy.",
    rows: 5,
  },
  { key: "concludeWhen", label: "When to end the conversation", hint: "So it stops rather than looping.", rows: 3 },
  {
    key: "extraContext",
    label: "Temporary context",
    hint: "A running promotion, a holiday closure. Blank when there isn't one — it sits outside the cached prefix.",
    rows: 3,
  },
];

/**
 * The instruction editor.
 *
 * Every field is CONTROLLED. React resets an uncontrolled form after a form
 * action completes — including a failed one — so a rejected save would wipe the
 * six paragraphs someone just wrote. Holding the values here means a validation
 * error leaves the text exactly where it was.
 */
export default function AgentInstructionsForm({
  values,
  defaultModel,
}: {
  values: AgentFormValues;
  defaultModel: string;
}) {
  const [state, formAction] = useActionState(saveAgent, null);
  const [v, setV] = useState<AgentFormValues>(values);

  function set<K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={formAction} className="card card-p">
      <input type="hidden" name="id" value={v.id} />

      <h2 className="sec">Instructions</h2>
      <p className="small dim" style={{ marginBottom: 18 }}>
        These sections are assembled into the system prompt in this order. The first sections are
        the cache prefix — keeping them stable between messages is what keeps the cost down.
      </p>

      <div className="grid g3">
        <div className="field">
          <label htmlFor="name">Agent name</label>
          <span className="hint">Internal — customers never see it.</span>
          <input id="name" name="name" value={v.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="primaryLanguage">Primary language</label>
          <span className="hint">ISO code. The agent still answers in whatever the customer writes.</span>
          <input
            id="primaryLanguage"
            name="primaryLanguage"
            value={v.primaryLanguage}
            onChange={(e) => set("primaryLanguage", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="modelOverride">Model override</label>
          <span className="hint">Blank uses the workspace model ({defaultModel}).</span>
          <input
            id="modelOverride"
            name="modelOverride"
            value={v.modelOverride}
            placeholder={defaultModel}
            onChange={(e) => set("modelOverride", e.target.value)}
          />
        </div>
      </div>

      {FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={f.key}>{f.label}</label>
          <span className="hint">{f.hint}</span>
          <textarea
            id={f.key}
            name={f.key}
            rows={f.rows}
            value={v[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </div>
      ))}

      <h2 className="sec" style={{ marginTop: 26 }}>
        Realism
      </h2>
      <p className="small dim" style={{ marginBottom: 14 }}>
        Cheap to copy, and most of why a good agent does not read as a bot.
      </p>
      <div className="grid g3">
        <div className="field">
          <label htmlFor="replyDelayMinMs">Reply delay — min (ms)</label>
          <input
            id="replyDelayMinMs"
            name="replyDelayMinMs"
            inputMode="numeric"
            value={v.replyDelayMinMs}
            onChange={(e) => set("replyDelayMinMs", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="replyDelayMaxMs">Reply delay — max (ms)</label>
          <input
            id="replyDelayMaxMs"
            name="replyDelayMaxMs"
            inputMode="numeric"
            value={v.replyDelayMaxMs}
            onChange={(e) => set("replyDelayMaxMs", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="maxRepliesPerTurn">Max bubbles per turn</label>
          <input
            id="maxRepliesPerTurn"
            name="maxRepliesPerTurn"
            inputMode="numeric"
            value={v.maxRepliesPerTurn}
            onChange={(e) => set("maxRepliesPerTurn", e.target.value)}
          />
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          name="splitMessages"
          checked={v.splitMessages}
          onChange={(e) => set("splitMessages", e.target.checked)}
        />
        <span>
          Split long answers into separate messages
          <span className="dim"> — one paragraph per bubble, like a person typing.</span>
        </span>
      </label>

      <div className="save-bar">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        <Notice state={state} />
      </div>
    </form>
  );
}
