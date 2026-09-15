"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A dialog, by hand. No library — this app has none and one modal is not a
 * reason to start.
 *
 * The three things a bare <div> gets wrong and a dialog must not:
 *   - Escape closes it.
 *   - Tab cannot walk out of it into the page behind, which is how a keyboard
 *     user ends up typing into a form they cannot see.
 *   - Focus returns to whatever opened it, rather than dumping them back at the
 *     top of the document.
 *
 * Rendered through a portal into <body>: an ancestor with a transform or a
 * filter becomes the containing block for `position: fixed` descendants, and
 * the overlay then lays out inside a card instead of over the page.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Panel max width in px. */
  width?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const subtitleId = useId();

  // Read by the keydown listener below, which is installed once per open and
  // must not be torn down and rebuilt every time the parent re-renders — doing
  // that would re-run the focus setup mid-dialog.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // document does not exist during the server render; the portal waits a tick.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // The panel takes focus first, not the first field: a screen reader then
    // reads the dialog's name and the steps before the token box.
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 0);

    /**
     * On the document, not on the overlay element.
     *
     * Focus does not reliably stay inside: disabling the button you just
     * pressed — which is what "Connect" does while it talks to Telegram —
     * hands focus back to <body>, and a keydown on <body> never bubbles into
     * the overlay. Escape stopped working at exactly the moment a stuck
     * request makes someone want it. Listening here catches the key wherever
     * it lands, and Tab is bounced back into the panel.
     */
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      // Re-queried every keystroke: the panel swaps its whole body between the
      // form and the success state, so a list captured on open goes stale.
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        // Focus is loose in the page behind the dialog. Tabbing from there
        // walks the sidebar, which is the failure a trap exists to prevent.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousOverflow;
      // A trigger that has since been re-rendered away cannot take focus back;
      // focusing a detached node silently does nothing, so check first.
      const target = returnTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="modal-overlay"
      // A click that STARTED inside the panel and ended on the backdrop — a
      // drag while selecting the token — must not count as "clicked outside".
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        style={width ? { maxWidth: width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="small dim" style={{ marginTop: 3 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
