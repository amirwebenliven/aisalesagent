import Link from "next/link";
import { GITHUB_URL } from "./nav-links";

export default function ClosingCta() {
  return (
    <section className="mk-cta">
      <div className="mk-wrap mk-cta-in">
        <p className="mk-eyebrow">Start here</p>
        <h2>Give it your website and one channel. See what it says to your first lead.</h2>
        <p>
          Free to start, no card. Connect Telegram or drop the widget on your site, read what the
          agent generated from your pages, and watch the first real conversation — cost, tool calls
          and all — in your inbox.
        </p>
        <div className="mk-hero-cta">
          <Link href="/signup" className="btn primary mk-btn-lg">
            Start free
          </Link>
          <a href={GITHUB_URL} className="btn mk-btn-lg" target="_blank" rel="noreferrer">
            Read the source
          </a>
        </div>
      </div>
    </section>
  );
}
