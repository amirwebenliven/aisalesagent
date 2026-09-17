"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addFaq } from "@/app/(app)/knowledge/actions";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";

/**
 * A hand-written answer — knowledge that was never on the website. These
 * outrank generated ones at retrieval and survive every refresh, which makes
 * this the place to put the correction after the AI got something wrong.
 */
export default function AddFaqForm() {
  const [state, formAction] = useActionState(addFaq, null);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Write an answer yourself
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card card-p">
      <div className="field">
        <label htmlFor="new-question">Question</label>
        <span className="hint">How a customer would phrase it, not how you would.</span>
        <input id="new-question" name="question" placeholder="Do you deliver outside the UAE?" />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="new-answer">Answer</label>
        <textarea id="new-answer" name="answer" rows={4} placeholder="Yes — across the GCC, usually within a week." />
      </div>
      <div className="save-bar">
        <SubmitButton pendingLabel="Adding…">Add answer</SubmitButton>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}
