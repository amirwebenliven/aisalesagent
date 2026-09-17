"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavLink } from "./nav-links";

/**
 * The mobile menu — the one piece of the marketing chrome that needs state.
 * Hidden by CSS above 720px (.mk-menu { display: none }), so on desktop it
 * costs nothing but the markup.
 */
export default function NavMenu({ links, signedIn }: { links: NavLink[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="mk-menu">
      <button
        type="button"
        className="mk-menu-btn"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mk-menu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        )}
      </button>

      {open && (
        <div id="mk-menu-panel" className="mk-menu-panel">
          {links.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" onClick={close}>
                {l.label}
              </a>
            ) : (
              <a key={l.href} href={l.href} onClick={close}>
                {l.label}
              </a>
            ),
          )}
          <div className="sep" />
          {signedIn ? (
            <Link href="/dashboard" onClick={close}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" onClick={close}>
                Log in
              </Link>
              <Link href="/signup" onClick={close}>
                Start free
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
