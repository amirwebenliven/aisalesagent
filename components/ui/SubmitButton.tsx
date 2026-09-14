"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that knows when its own form is in flight. Must be rendered
 * INSIDE the <form> it submits — useFormStatus reads the nearest form context,
 * and a button placed outside one silently never shows pending.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "btn primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
