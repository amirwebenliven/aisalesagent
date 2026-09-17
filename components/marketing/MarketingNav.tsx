import Link from "next/link";
import { NAV_LINKS } from "./nav-links";
import NavMenu from "./NavMenu";

export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="mk-nav">
      <div className="mk-wrap mk-nav-in">
        <Link href="/" className="mk-brand">
          <span className="mk-mark" aria-hidden="true">AI</span>
          Agent Platform
        </Link>

        <nav className="mk-nav-links" aria-label="Primary">
          {NAV_LINKS.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ) : (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ),
          )}
        </nav>

        <div className="mk-nav-cta">
          {signedIn ? (
            <Link href="/dashboard" className="btn primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn hide-sm">
                Log in
              </Link>
              <Link href="/signup" className="btn primary">
                Start free
              </Link>
            </>
          )}
          <NavMenu links={NAV_LINKS} signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}
