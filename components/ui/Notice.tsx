import type { ActionState } from "./action-state";

/** The result of an action, rendered where the user pressed the button. */
export default function Notice({ state }: { state: ActionState }) {
  if (!state) return null;
  const text = state.ok ? state.message : state.error;
  if (!text) return null;
  return (
    <span className={`notice ${state.ok ? "ok" : "err"}`} role="status">
      {text}
    </span>
  );
}
