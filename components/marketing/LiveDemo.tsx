/**
 * The centrepiece: one annotated conversation that shows what the agent does.
 *
 * It is an EXAMPLE, and the caption says so. "Aster & Oak" is a fictional
 * made-to-order furniture studio and "Priya" is not a real customer; the
 * exchange was written to walk through the agent's real behaviours in the
 * order a sale actually happens — answer from the knowledge base, qualify,
 * capture the lead, book the meeting, schedule the follow-up, and hand over
 * when a question is outside its rules. Every function named here exists in
 * lib/ai/tools.ts today. Nothing is presented as a customer transcript, and no
 * competitor or their client appears on this page (CLAUDE.md §16).
 *
 * Layout is one CSS grid — bubbles and events in column 1, notes in column 2 —
 * so each note sits on the row of the item it explains. DOM order inside a
 * turn is bubble → events → note: the note is auto-placed beside the LAST
 * column-1 item before it, so a note about an action sits beside the action.
 */

type Tone = "ok" | "warn";
type Note = { title: string; body: string; key?: boolean };
type Tool = { name: string; detail: string; tone: Tone };
type Turn = {
  from: "ai" | "customer";
  text: string;
  /** Shown under an AI bubble: what it drew on and how long it took (typical). */
  stamp?: string;
  tools?: Tool[];
  note?: Note;
};

const TURNS: Turn[] = [
  {
    from: "customer",
    text: "Hi! Do you make a 6-seater dining table in walnut? Need it before Diwali 🙏",
  },
  {
    from: "ai",
    text:
      "Hi Priya 👋 Yes — our Solstice dining table comes in solid walnut and seats six (180 × 90 cm) or eight (220 × 100 cm). The 6-seater starts at ₹68,500.\n\n" +
      "Lead time right now is 4–5 weeks, so an order this week lands well before Diwali. Would you like it with the matching bench or chairs?",
    stamp: "answered from 3 knowledge entries · 2.4 s",
    note: {
      title: "Answers from your knowledge base",
      body: "Sizes, price and lead time came from the studio’s own website, turned into question-and-answer pairs the team reviewed. It does not invent products, prices or dates.",
    },
  },
  { from: "customer", text: "Chairs. Can you do a custom length, around 200 cm?" },
  {
    from: "ai",
    text:
      "We can — custom lengths between 160 and 240 cm are made to order. A 200 cm walnut top comes to about ₹74,000, and the Ridge chairs are ₹9,800 each.\n\n" +
      "Shall I have our designer send you a proper quote and a swatch pack? I just need your email and the delivery pincode.",
    stamp: "2.1 s",
    note: {
      title: "Qualifies before it sells",
      body: "One question at a time, exactly as the conversation flow you write tells it to. It asks for what moves the sale forward — and nothing more.",
    },
  },
  { from: "customer", text: "priya.n@example.com — 560034. Also, do you offer EMI?" },
  {
    from: "ai",
    text:
      "Saved, thank you 🙂 Yes — 3, 6 and 9-month EMI on all major cards at checkout, with no extra cost on the 3-month plan.\n\n" +
      "Want a quick 20-minute call with our designer Ananya to finalise the size and finish? She has Tuesday 4:30 pm or Wednesday 11:00 am.",
    stamp: "2.6 s",
    tools: [
      { name: "captureContact", detail: "email · pincode 560034 · tags: dining, walnut, custom-size", tone: "ok" },
    ],
    note: {
      title: "Saves the lead as it goes",
      body: "Email and pincode go straight onto the contact, tagged for your pipeline — a real function call, not a form the customer has to fill in.",
    },
  },
  { from: "customer", text: "Tuesday works" },
  {
    from: "ai",
    text: "Done — Tuesday 4:30 pm with Ananya. The calendar invite is on its way, and the swatch pack ships tomorrow. Anything else I can help with?",
    stamp: "1.8 s",
    tools: [
      { name: "bookMeeting", detail: "Tue 16:30 · Ananya · invite sent", tone: "ok" },
      { name: "scheduleFollowUp", detail: "Wed 10:00 · “Did the swatch pack go out?”", tone: "ok" },
    ],
    note: {
      title: "Books it, then remembers",
      body: "The meeting and the follow-up are both logged actions you can see in the thread. Nothing depends on someone remembering to check.",
    },
  },
  {
    from: "customer",
    text: "Actually — the table I bought from you in 2024 has a crack down the top. What do you do about that?",
  },
  {
    from: "ai",
    text: "I’m really sorry to hear that, Priya — that needs a person, not a bot. I’ve passed it to our team with your details, and someone will message you here within the hour.",
    stamp: "1.7 s",
    tools: [
      {
        name: "alertHuman",
        detail: "Warranty claim: cracked top on a 2024 order. Customer also has a ₹1.3L quote in progress. AI paused.",
        tone: "warn",
      },
    ],
    note: {
      key: true,
      title: "Knows when to stop",
      body: "A complaint is outside its rules, so it hands over — a real function call that pauses the AI and lands the thread in your inbox with the reason. Never a reassuring sentence that goes nowhere.",
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
            See it work
          </p>
          <h2>One conversation. Answered, qualified, booked — and handed over at the right moment.</h2>
          <p className="mk-lede">
            Follow a customer from “do you make this?” to a booked design call in five messages, and
            watch what the agent does behind each reply. Then read the last message: when the
            question turns into a complaint, it stops and brings in your team.
          </p>
        </div>

        <div className="dm">
          <div className="dm-head">
            <div className="dm-who">
              <span className="dm-avatar" aria-hidden="true">A</span>
              <span>
                <span className="nm">Aster &amp; Oak · Studio assistant</span>
                <br />
                <span className="ch">WhatsApp · example conversation</span>
              </span>
            </div>
            <span className="pill warn">
              <span className="dot" />
              with your team
            </span>
          </div>
          <div className="dm-rail-head">
            <p className="mk-eyebrow">What the agent did</p>
          </div>

          <div className="dm-date">Today · 9:42 pm</div>

          {TURNS.map((t, i) => (
            <Turn key={i} turn={t} />
          ))}

          <div className="dm-foot">
            <div className="fake-input">Your team replies here — the AI is paused on this thread</div>
            <span className="btn" aria-hidden="true">Send</span>
          </div>
        </div>

        <p className="dm-caption">
          Example conversation. Aster &amp; Oak is a fictional furniture studio and Priya is not a
          real customer — the exchange was written to show how the agent behaves. The functions
          shown (<span className="mono">captureContact</span>, <span className="mono">bookMeeting</span>,{" "}
          <span className="mono">scheduleFollowUp</span>, <span className="mono">alertHuman</span>) are
          the ones it has today, and each is logged in your inbox with its cost. Response times are
          typical.
        </p>
      </div>
    </section>
  );
}

function Turn({ turn }: { turn: Turn }) {
  const out = turn.from === "ai";
  return (
    <>
      <div className={`dm-msg ${out ? "out" : "in"}`}>
        {/* pre-line: the agent writes real paragraphs, and a bubble that
            collapses them into one run of text misrepresents what the
            customer sees. */}
        <div className={`dm-bubble ${out ? "out" : "in"}`} style={{ whiteSpace: "pre-line" }}>
          {turn.text}
          {out ? <span className="stamp">AI{turn.stamp ? ` · ${turn.stamp}` : ""}</span> : null}
        </div>
      </div>
      {turn.tools?.map((tool) => (
        <div key={tool.name} className={`dm-event ${tool.tone}`}>
          <strong>{tool.name}</strong>
          <span className="mono">{tool.detail}</span>
        </div>
      ))}
      {turn.note ? (
        <div className={`dm-note${turn.note.key ? " key" : ""}`}>
          <span className="t">{turn.note.title}</span>
          {turn.note.body}
        </div>
      ) : null}
    </>
  );
}
