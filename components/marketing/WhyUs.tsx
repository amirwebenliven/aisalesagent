import Section from "./Section";

/**
 * The three things this product is built around. Each card carries a piece of
 * evidence from the product rather than an icon: a named query, the cost
 * readout, an escalation record. Where a feature is still being built the card
 * says so — the schema exists, the executor does not, and the page must not
 * blur that line. No competitor is named here or anywhere public (CLAUDE.md §16).
 */
export default function WhyUs() {
  return (
    <Section
      id="why"
      n="04"
      eyebrow="Why this one"
      title="Built around the three things that actually matter."
      lede="Answers from your live systems, a bill you can read to the reply, and an AI that knows when to stop."
      className="wash"
    >
      <div className="mk-why">
        <article className="mk-why-card">
          <h3>Live answers from your own systems.</h3>
          <p>
            Stock, order status, delivery slots, account balances — the questions a website can
            never answer. Connect a database or API through a read-only role and define named
            queries with typed parameters. The agent picks the query and fills in the arguments.{" "}
            <b>It never writes SQL.</b>
          </p>
          <div className="evidence">
            <pre className="mk-code">{`check_order_status(order_no: string)
  → SELECT status, eta FROM orders WHERE no = $1
  role: readonly · timeout: 2s · rows: 1`}</pre>
            <div className="state" style={{ marginTop: 10 }}>
              <span className="pill warn">coming next</span>
              Data model and safety rules are shipped; the query runner and screen are being built now.
            </div>
          </div>
        </article>

        <article className="mk-why-card">
          <h3>Any AI provider. Your key, your bill, the real number on screen.</h3>
          <p>
            Run on our platform key, or bring your own from any provider that speaks the OpenAI API —
            you are never locked to one vendor. Every message records the model, the tokens and the
            cache hits, and on our key the cost in rupees and dollars. You always know what a
            conversation cost you.
          </p>
          <div className="evidence">
            <div className="mk-stats">
              <div className="stat">
                <div className="k">Cost per reply</div>
                <div className="v">₹0.04</div>
                <div className="d">≈ $0.0005 · warm conversation</div>
              </div>
              <div className="stat">
                <div className="k">Cache hits</div>
                <div className="v">60%+</div>
                <div className="d">prompt tokens read from cache</div>
              </div>
            </div>
            <div className="state" style={{ marginTop: 10 }}>
              As shown in Settings → AI model. Typical figures on our platform key.
            </div>
          </div>
        </article>

        <article className="mk-why-card">
          <h3>The AI knows when to stop.</h3>
          <p>
            Escalation is a feature, not a failure. You write the rules — never quote a discount,
            never handle a complaint — and a handover is a real function call that pauses the AI
            and lands the thread in your inbox with the reason. On WhatsApp, new numbers start under
            a daily send cap that rises over sixty days, because that is how numbers stay in good
            standing.
          </p>
          <div className="evidence">
            <div className="callout warn callout-bar">
              <strong>Handover · warranty claim</strong>
              <p>Cracked top on a table bought in 2024. Conversation → human. AI paused.</p>
              <p className="mono small dim">alertHuman · WhatsApp · ₹0.03 · day 3 of warm-up · cap 60/day</p>
            </div>
          </div>
        </article>
      </div>
    </Section>
  );
}
