import Link from "next/link";
import { GITHUB_URL } from "./nav-links";

export default function ClosingCta() {
  return (
    <section className="mk-cta">
      <div className="mk-wrap mk-cta-in">
        <p className="mk-eyebrow">Start here</p>
        <h2>Give it your website and one channel. Watch it handle your first lead tonight.</h2>
        <p>
          A full month free, AI credits included, no card. Connect Telegram or drop the widget on
          your site, read what the agent learned from your pages, and see the first real
          conversation land in your inbox — every reply, every action, every rupee it cost.
        </p>
        <div className="mk-hero-cta">
          <Link href="/signup" className="btn primary mk-btn-lg">
            Start your free month
          </Link>
          <a href={GITHUB_URL} className="btn mk-btn-lg" target="_blank" rel="noreferrer">
            Read the source
          </a>
        </div>
      </div>
    </section>
  );
}
