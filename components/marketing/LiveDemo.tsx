/**
 * The centrepiece: a REAL conversation produced by THIS product.
 *
 * On 18 Sep 2026 the same four customer messages that a real Al Taher Chemicals
 * prospect sent in August were replayed through our agent (scripts/replay-demo.ts:
 * the seeded "Tia | ATC" workspace, its eight crawled FAQs, model minimax-m3 via
 * OpenRouter, the live tool registry). What is below is that run, verbatim,
 * including the turn where the agent did not understand a one-word answer.
 *
 * It replaced a transcript from a competitor's product that we had captured in
 * August. That one read well, but it was not ours, and a homepage that shows
 * someone else's model as its centrepiece is a lie of placement even with an
 * honest caption. This is ours. Token counts, cache hits and cost are the
 * measured figures from that run, not typed in.
 *
 * Layout is one CSS grid — bubbles in column 1, notes in column 2 — so each
 * note sits on the same row as the message it explains. Interleaving them in
 * DOM order is what makes the phone layout (single column) read correctly
 * without any JavaScript.
 */

type Note = { title: string; body: string; key?: boolean };
type Turn = {
  from: "ai" | "customer";
  text: string;
  note?: Note;
  /** Measured on the run that produced this reply. Only on AI turns. */
  meta?: { promptTokens: number; cachedTokens: number; outputTokens: number };
  /** A function the model called in the same turn as this reply. */
  tool?: { name: string; reason: string };
};

const TURNS: Turn[] = [
  { from: "customer", text: "What kind of service are you providing" },
  {
    from: "ai",
    text:
      "Hi Rajesh 👋\n\nAl Taher Chemicals supplies industrial chemistry for metal finishing — mainly:\n\n" +
      "- Electroplating chemicals (nickel, chrome, zinc, tin, gold, rhodium, palladium)\n" +
      "- Electroless nickel (low/mid/high phosphorous)\n" +
      "- Metal stripping, pickling & passivation\n" +
      "- Abrasives and stainless steel cleaners\n\n" +
      "We work with defence, aviation, marine, fasteners, heavy machinery and similar sectors across the UAE and GCC.",
    note: {
      title: "Answered from the knowledge base",
      body: "Every product family here came from eight FAQs the crawler generated off the company’s own website. Nobody wrote this list for the demo.",
    },
    meta: { promptTokens: 2148, cachedTokens: 128, outputTokens: 163 },
  },
  {
    from: "ai",
    text: "What are you working on? Happy to point you to the right product family if you tell me the substrate and finish you need.",
    note: {
      title: "Qualifying question",
      body: "It asks what they are building before it pitches anything — the flow says one question at a time.",
    },
  },
  { from: "customer", text: "Elegant" },
  {
    from: "ai",
    text: "No worries, Rajesh. Whenever you're ready, just let me know what you're trying to plate or finish and I'll point you in the right direction.",
    note: {
      title: "The weak turn — left in",
      body: "One word, and the agent did not infer “decorative finish” from it. It asked again rather than guess. We would rather show you this than trim it.",
    },
    meta: { promptTokens: 2290, cachedTokens: 2048, outputTokens: 33 },
  },
  { from: "customer", text: "Yes yes" },
  {
    from: "ai",
    text:
      "Great 😊\n\nSo tell me — what are you working on? For example:\n\n" +
      "- What substrate (steel, copper, brass, plastic…)?\n" +
      "- What finish do you want (nickel, chrome, zinc, gold…)?\n" +
      "- Which industry is it for?\n\n" +
      "Once I know that, I can match it to the right chemistry.",
    note: {
      title: "Cache hit: 99%",
      body: "2,304 of 2,334 input tokens were served from cache. The instruction prefix never changes between turns, which is why a reply costs a fraction of a cent.",
    },
    meta: { promptTokens: 2334, cachedTokens: 2304, outputTokens: 69 },
  },
  {
    from: "customer",
    text: "I am looking for Chrome plating in utensils that normally we are using in cooking. Also we need to check plating for car accessories",
  },
  {
    from: "ai",
    text: "Rajesh, the cooking utensils part is a food-contact application — I don't want to guess on that one, so I'll pass it to our team to advise properly.",
    note: {
      key: true,
      title: "Declined to guess — and actually escalated",
      body: "Its rules say never guess chemistry for food contact. It said so, and in the same turn it called alertHuman with the reason. The thread moved to the inbox; the AI will not reply again until a person hands it back.",
    },
    meta: { promptTokens: 2437, cachedTokens: 2304, outputTokens: 152 },
    tool: {
      name: "alertHuman",
      reason:
        "Food-contact chrome plating enquiry for cooking utensils — needs proper technical guidance on food-safe chemistry. Also interested in chrome plating for car accessories.",
    },
  },
];

export default function LiveDemo() {
  return (
    <section id="demo" className="mk-section">
      <div className="mk-wrap">
        <div className="mk-section-head">
          <p className="mk-eyebrow">
            <span className="n">01</span>
            Live demo
          </p>
          <h2>A real conversation, not a mockup.</h2>
          <p className="mk-lede">
            Four messages a real prospect sent an electroplating supplier, replayed through this
            product’s agent on 18 September 2026 with nothing but the supplier’s website as
            knowledge. Reproduced verbatim — including the turn it fumbled. Read the last message:
            the agent recognised a question it should not answer, said so, and handed the lead to a
            human with a function call, not a sentence.
          </p>
        </div>

        <div className="dm">
          <div className="dm-head">
            <div className="dm-who">
              <span className="dm-avatar" aria-hidden="true">AT</span>
              <span>
                <span className="nm">Tia · Al Taher Chemicals</span>
                <br />
                <span className="ch">This product’s agent · demo workspace</span>
              </span>
            </div>
            <span className="pill warn">
              <span className="dot" />
              human
            </span>
          </div>
          <div className="dm-rail-head">
            <p className="mk-eyebrow">What happened</p>
          </div>

          {TURNS.map((t, i) => (
            <Turn key={i} turn={t} />
          ))}

          <div className="dm-foot">
            <div className="fake-input">Your team replies here — the AI is paused</div>
            <span className="btn" aria-hidden="true">Send</span>
          </div>
        </div>

        <p className="dm-caption">
          Transcript reproduced verbatim, including the customer’s spelling. Customer details are
          from the demo workspace; timestamps removed. Token counts, cache hits and the{" "}
          <span className="mono">alertHuman</span> call are the measured record of that run — total
          cost for all four replies was <span className="mono">$0.0014</span>. No line was written
          for this page.
        </p>
      </div>
    </section>
  );
}

function Turn({ turn }: { turn: Turn }) {
  const out = turn.from === "ai";
  const m = turn.meta;
  const cachePct = m && m.promptTokens ? Math.round((m.cachedTokens / m.promptTokens) * 100) : null;
  return (
    <>
      <div className={`dm-msg ${out ? "out" : "in"}`}>
        {/* pre-line: the model writes real paragraphs and bullet lists, and a
            chat bubble that collapses them into one run of text misrepresents
            what the customer actually saw. */}
        <div className={`dm-bubble ${out ? "out" : "in"}`} style={{ whiteSpace: "pre-line" }}>
          {turn.text}
          {out ? (
            <span className="stamp">
              AI
              {m ? ` · ${m.promptTokens.toLocaleString()} in${cachePct !== null ? ` (${cachePct}% cached)` : ""} · ${m.outputTokens} out` : ""}
            </span>
          ) : null}
        </div>
      </div>
      {/* Order matters for the grid: the note (column 2) is auto-placed on the
          row of the column-1 item before it, so it must follow the bubble
          directly to sit beside it. The event is a column-1 grid child in its
          own right — inside .dm-msg it would join the flex row and squash the
          bubble sideways — so it comes last and drops onto the next row. */}
      {turn.note ? (
        <div className={`dm-note${turn.note.key ? " key" : ""}`}>
          <span className="t">{turn.note.title}</span>
          {turn.note.body}
        </div>
      ) : null}
      {turn.tool ? (
        <div className="dm-event">
          <strong>Function call in the same turn</strong>
          <span className="mono">
            {turn.tool.name}(reason: “{turn.tool.reason}”) · AI paused
          </span>
        </div>
      ) : null}
    </>
  );
}
