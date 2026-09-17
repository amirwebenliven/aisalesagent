import Section from "./Section";

/**
 * Native <details>, no JavaScript. The questions a prospect actually asks,
 * answered the way we would answer them in the room — including the WhatsApp
 * ban question, which most pages leave off.
 */
const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: "How does the free month work?",
    a: (
      <>
        <p>
          Sign up, connect a channel, and you have thirty days with AI credits included — no card,
          nothing to cancel. When the month ends, pick a monthly or yearly plan to keep the agent
          answering. If you take a few days to decide, nothing is deleted: your channels, knowledge
          and conversations stay exactly where they are, and the agent simply pauses until you
          renew.
        </p>
      </>
    ),
  },
  {
    q: "Is there a referral offer?",
    a: (
      <>
        <p>
          Yes. Every account gets a referral link. When a business you refer buys any paid plan, your
          next month is free — one free month for each paying business you bring. Pay yearly and
          you also get two months free on the plan itself.
        </p>
      </>
    ),
  },
  {
    q: "Is it really my data?",
    a: (
      <>
        <p>
          Yes. Each workspace is isolated at the database level — every row carries your
          organisation’s id and every query is scoped by it — and we have tested that boundary
          adversarially and kept the regression tests. Conversations, contacts and knowledge live in
          Postgres. Ask and we hand you a full export of your organisation’s data.
        </p>
        <p>
          If you connect your own database, it is read through a read-only role that you create,
          and nothing is copied out of it. We process your customers’ data on your behalf; we do
          not own it and we do not train models on it.
        </p>
      </>
    ),
  },
  {
    q: "What happens when the AI does not know?",
    a: (
      <>
        <p>
          It says so and hands over. The agent answers only from your knowledge base and your
          written rules; when a question falls outside them — or hits a rule like “never quote a
          discount” — it calls <span className="mono">alertHuman</span>, which pauses the AI, moves
          the thread to your inbox and notes the reason for whoever picks it up.
        </p>
        <p>
          That is a real function call, not a promise in prose. Models will happily write “I’ll
          pass this on” and pass nothing on, so every agent is built with the rule that saying it
          is not doing it.
        </p>
      </>
    ),
  },
  {
    q: "Will my WhatsApp number get banned?",
    a: (
      <>
        <p>
          It can. QR pairing uses the WhatsApp Web protocol, which is outside WhatsApp’s terms, and
          numbers that behave like bots do get banned. We would rather tell you that here than
          after it happens.
        </p>
        <p>
          What we do about it: a new number starts under a daily send cap that rises over sixty
          days, a fresh number never does cold outreach, and the risk is in writing before you
          connect. For a line your business cannot lose, use the official WhatsApp Business API,
          which carries no ban risk and is on our roadmap pending Meta approval.
        </p>
      </>
    ),
  },
  {
    q: "How fast is setup?",
    a: (
      <>
        <p>
          Paste your website address and the crawl turns each page into question-and-answer pairs in
          minutes. Telegram takes a bot token and about five minutes; the website widget is one
          script tag; WhatsApp is a QR scan. A first real reply within the hour is realistic.
        </p>
        <p>
          Then spend an afternoon reading what it generated, fixing what is wrong, and adding the
          rules that were never on your website. That afternoon is where the quality comes from.
        </p>
      </>
    ),
  },
  {
    q: "Which AI models can I use?",
    a: (
      <>
        <p>
          Any provider that speaks the OpenAI chat API: our platform gateway, OpenAI, DeepSeek,
          Qwen, MiniMax, Kimi, or your own endpoint. You choose per workspace and can change it
          without a redeploy, and every message records which model answered and what it cost — so
          you compare models on your own conversations, not a leaderboard.
        </p>
      </>
    ),
  },
  {
    q: "Can it read my database or my store?",
    a: (
      <>
        <p>
          That is the design. Connect a Postgres, MySQL or REST source through a read-only role,
          then define named queries — <span className="mono">check_order_status(order_no)</span> —
          with typed parameters and the SQL or path template behind each. The agent chooses a query
          and fills in the arguments; it never writes SQL, and every argument is validated before
          anything runs.
        </p>
        <p>
          Where it stands today: the data model and the safety rules are built; the query runner and
          the screen to define queries are being built now. Ask us for the date rather than assuming
          it is there on day one.
        </p>
      </>
    ),
  },
];

export default function Faq() {
  return (
    <Section
      id="faq"
      n="06"
      eyebrow="Questions"
      title="The questions we get asked in the room."
      lede="Straight answers — including the ones other pages leave out."
    >
      <div className="mk-faq">
        {QA.map((item) => (
          <details key={item.q} className="mk-q">
            <summary>{item.q}</summary>
            <div className="a">{item.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
