import Link from "next/link";
import { GITHUB_URL } from "./nav-links";
import { IconGitHub } from "./Icons";

/**
 * Deep footer. Legal pages do not exist yet, so they are rendered as labelled
 * placeholders rather than links to nowhere — a dead link in a footer reads as
 * an abandoned product. No competitor links anywhere (CLAUDE.md §16).
 */
export default function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-footer-grid">
          <div>
            <span className="mk-brand" style={{ color: "var(--ink)" }}>
              <span className="mk-mark" aria-hidden="true">AI</span>
              Agent Platform
            </span>
            <p className="blurb">
              The AI sales agent that answers from your own knowledge, shows you what every reply
              cost, and knows when to hand over to a person.
            </p>
            <p style={{ marginTop: 12 }}>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
                <IconGitHub />
                amirwebenliven/aisalesagent
              </a>
            </p>
          </div>

          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="#demo">See it work</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#channels">Channels</a></li>
              <li><a href="#why">Why this one</a></li>
              <li><a href="#pricing">Pricing</a></li>
            </ul>
          </div>

          <div>
            <h4>Get started</h4>
            <ul>
              <li><Link href="/signup">Free month</Link></li>
              <li><a href="#referral">Refer &amp; earn</a></li>
              <li><a href="#faq">Questions</a></li>
            </ul>
          </div>

          <div>
            <h4>Account</h4>
            <ul>
              <li><Link href="/login">Log in</Link></li>
              <li><Link href="/signup">Start free</Link></li>
              <li><a href={GITHUB_URL} target="_blank" rel="noreferrer">Docs (README)</a></li>
            </ul>
          </div>

          <div>
            <h4>Legal</h4>
            <ul>
              <li className="soon">Privacy policy<i>soon</i></li>
              <li className="soon">Terms of service<i>soon</i></li>
              <li className="soon">Data processing<i>soon</i></li>
            </ul>
          </div>
        </div>

        <div className="mk-footer-bottom">
          <span>© 2026 Agent Platform. Built in India, priced in rupees, exported in dollars.</span>
          <span className="mono">Channel status and pricing on this page as of 18 Sep 2026.</span>
        </div>
      </div>
    </footer>
  );
}
