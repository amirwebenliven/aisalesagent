import Link from "next/link";

/**
 * The hero's picture is not a dashboard mockup — it is the itemised line every
 * AI reply in the product carries (UsageRecord: model, prompt/cached/output
 * tokens, tool calls, cost). The FIGURES are illustrative and say so: the demo
 * transcript below was not produced by this pipeline, so there is no measured
 * cost for it, and the numbers in prisma/seed.ts are typed-in constants, not
 * measurements. Never label an illustrative figure "as recorded".
 */
function Receipt() {
  return (
    <aside className="mk-receipt" aria-label="What one AI reply consists of">
      <div className="head">
        <span className="mk-eyebrow">One reply, itemised</span>
        <span className="dim">illustrative</span>
      </div>
      <div className="row"><span className="k">channel</span><span className="v">Telegram</span></div>
      <div className="row"><span className="k">knowledge</span><span className="v">3 FAQs retrieved</span></div>
      <div className="row"><span className="k">model</span><span className="v">minimax-m3 · platform key</span></div>
      <div className="row"><span className="k">prompt</span><span className="v">2,148 tokens · 61% cached</span></div>
      <div className="row"><span className="k">tool call</span><span className="v acc">alertHuman · food-contact</span></div>
      <div className="row"><span className="k">reply</span><span className="v">2 bubbles · 19 s delay</span></div>
      <div className="total">
        <span className="k">cost of this reply</span>
        <span className="v">$0.00038</span>
      </div>
      <p className="fine">
        Illustrative. These are the fields every AI reply in the product records — model, tokens,
        cache hits, tool calls and the cost in dollars, computed from the tokens actually used. The
        figures are typical of minimax-m3 on our platform key; they are not a measurement of the
        conversation below.
      </p>
    </aside>
  );
}

export default function Hero() {
  return (
    <section className="mk-hero">
      <div className="mk-wrap mk-hero-grid">
        <div className="mk-hero-copy">
          <p className="mk-eyebrow">AI sales agent · Telegram · WhatsApp · your website</p>
          <h1>Answer every lead in seconds, on the channels they already use, from what your business actually knows.</h1>
          <p className="mk-lede">
            It learns your website, replies on Telegram, WhatsApp and your site, captures the lead and
            books the call. And when a question is above its pay grade, it says so and hands to a
            person — without losing the lead.
          </p>
          <div className="mk-hero-cta">
            <Link href="/signup" className="btn primary mk-btn-lg">
              Start free
            </Link>
            <a href="#demo" className="btn mk-btn-lg">
              See it answer
            </a>
          </div>
          <p className="mk-trust">
            <b>Source on GitHub.</b> Bring your own AI key. Your data, your database.
          </p>
        </div>
        <Receipt />
      </div>
    </section>
  );
}
