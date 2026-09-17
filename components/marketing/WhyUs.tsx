import Section from "./Section";

/**
 * Three things neither DM Champ nor AiEngage offers. Each card carries a piece
 * of evidence from the product rather than an icon: a named query, the cost
 * readout, an escalation record. Where a feature is still being built, the
 * card says so — the schema exists, the executor does not, and the page must
 * not blur that line.
 */
export default function WhyUs() {
  return (
    <Section
      id="why"
      n="04"
      eyebrow="Why this one"
      title="Three things the alternatives do not do."
      lede="An agent that can answer from your live systems, a bill you can actually read, and an AI that knows when to stop."
      className="wash"
    >
      <div className="mk-why">
        <article className="mk-why-card">
          <h3>Live answers from your own systems.</h3>
          <p>
            Stock, order status, delivery slots — the questions a website can never answer. You
            connect a database or API through a read-only role and define named queries with typed
            parameters. The model picks the query and fills the arguments.{" "}
            <b>It never writes SQL.</b>
          </p>
          <div className="evidence">
            <pre className="mk-code">{`check_order_status(order_no: string)
  → SELECT status, eta FROM orders WHERE no = $1
  role: readonly · timeout: 2s · rows: 1`}</pre>
            <div className="state" style={{ marginTop: 10 }}>
              <span className="pill warn">in progress</span>
              Schema and safety model shipped; executor and UI shipping next.
            </div>
          </div>
        </article>

        <article className="mk-why-card">
          <h3>Any AI provider. Your key, your bill, the real number on screen.</h3>
          <p>
            Use our platform key, or bring your own from any provider that speaks the OpenAI API —
            not one vendor’s. Every message records the model, the tokens and the cache hits; on our
            key, the cost in dollars too. Nobody else shows you this.
          </p>
          <div className="evidence">
            <div className="mk-stats">
              <div className="stat">
                <div className="k">Cost per reply</div>
                <div className="v">$0.0005</div>
                <div className="d">warm conversation</div>
              </div>
              <div className="stat">
                <div className="k">Cache hits</div>
                <div className="v">60%</div>
                <div className="d">prompt tokens read from cache</div>
              </div>
            </div>
            <div className="state" style={{ marginTop: 10 }}>
              As shown in Settings → AI model. Figures illustrative of a test workspace.
            </div>
          </div>
        </article>

        <article className="mk-why-card">
          <h3>The AI knows when to stop.</h3>
          <p>
            Escalation is the feature, not the failure mode. You write the rules — never quote a
            price, never guess at food-contact chemistry — and a handover is a real function call
            that pauses the AI and lands the thread in your inbox. On WhatsApp, new numbers start
            under a daily send cap that rises over sixty days, because that is how numbers stay
            unbanned.
          </p>
          <div className="evidence">
            <div className="callout warn callout-bar">
              <strong>Handover · high</strong>
              <p>Food-contact application: chrome plating on cookware. Conversation → human. AI paused.</p>
              <p className="mono small dim">alertHuman · $0.0004 · day 3 of warm-up · cap 60/day</p>
            </div>
          </div>
        </article>
      </div>
    </Section>
  );
}
