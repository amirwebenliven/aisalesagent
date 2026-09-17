"use client";

import { useActionState, useEffect, useState } from "react";
import { addSource } from "@/app/(app)/knowledge/actions";
import Notice from "@/components/ui/Notice";
import SubmitButton from "@/components/ui/SubmitButton";

/**
 * Start a crawl. The action returns as soon as the source row exists — the
 * crawl itself carries on in the background and the status pill in the table
 * moves from pending to crawling to ready on its own.
 */
export default function AddSourceForm() {
  const [state, formAction] = useActionState(addSource, null);
  const [url, setUrl] = useState("");

  // Clear only on success: a rejected URL stays in the box so it can be fixed
  // rather than retyped.
  useEffect(() => {
    if (state?.ok) setUrl("");
  }, [state]);

  return (
    <form action={formAction} className="card card-p" id="add-source">
      <h2 className="sec">Add a source</h2>
      <p className="small dim" style={{ marginBottom: 12 }}>
        We fetch the site once, read the pages, and turn them into answers. Roughly one credit per
        page, and a minute or two for a typical site.
      </p>
      <div className="row-form">
        <input
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          aria-label="Website address"
        />
        <SubmitButton pendingLabel="Starting…">Add source</SubmitButton>
      </div>
      <div style={{ marginTop: 10 }}>
        <Notice state={state} />
      </div>
    </form>
  );
}
