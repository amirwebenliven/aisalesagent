"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteFaq, updateFaq } from "@/app/knowledge/actions";
import type { ActionState } from "@/components/ui/action-state";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";

export type FaqView = {
  id: string;
  question: string;
  answer: string;
  isManual: boolean;
  useCount: number;
  sourceUrl: string | null;
};

/**
 * One answer, readable by default and editable in place.
 *
 * Delete is a two-step button rather than window.confirm: a native dialog is
 * suppressed in some embedded browsers, and an ignored confirm reads as a
 * button that does nothing.
 */
export default function FaqCard({ faq }: { faq: FaqView }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(updateFaq, null);
  const [removal, setRemoval] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  // Controlled, so a rejected save leaves the edit on screen — a form action
  // resets uncontrolled fields whether it succeeded or not.
  const [draft, setDraft] = useState({ question: faq.question, answer: faq.answer });

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={formAction} className="card card-p">
        <input type="hidden" name="id" value={faq.id} />
        <div className="field">
          <label htmlFor={`q-${faq.id}`}>Question</label>
          <textarea
            id={`q-${faq.id}`}
            name="question"
            rows={2}
            value={draft.question}
            onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
          />
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor={`a-${faq.id}`}>Answer</label>
          <textarea
            id={`a-${faq.id}`}
            name="answer"
            rows={5}
            value={draft.answer}
            onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
          />
        </div>
        <p className="small dim" style={{ marginBottom: 10 }}>
          Editing makes this answer hand-written, so the next refresh of its source will not
          overwrite it.
        </p>
        <div className="save-bar">
          <SubmitButton pendingLabel="Saving…">Save answer</SubmitButton>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft({ question: faq.question, answer: faq.answer });
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <Notice state={state} />
        </div>
      </form>
    );
  }

  return (
    <div className="card card-p">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <strong style={{ fontSize: 13.5 }}>{faq.question}</strong>
        <span className="pill mute mono">used {faq.useCount}&times;</span>
      </div>
      <p className="small dim" style={{ marginTop: 7, whiteSpace: "pre-wrap" }}>{faq.answer}</p>

      <div className="card-actions">
        {faq.isManual && <span className="pill info">hand-written · outranks crawled</span>}
        {faq.sourceUrl && (
          <a className="small dim" href={faq.sourceUrl} target="_blank" rel="noreferrer">
            {faq.sourceUrl}
          </a>
        )}
        <span style={{ flex: 1 }} />
        {removal && !removal.ok && <Notice state={removal} />}
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="btn danger"
              disabled={pending}
              aria-busy={pending}
              onClick={() => {
                setRemoval(null);
                start(async () => {
                  const result = await deleteFaq(faq.id);
                  if (!result?.ok) setRemoval(result);
                  setConfirming(false);
                });
              }}
            >
              {pending ? "Deleting…" : "Delete for good"}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={pending}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
