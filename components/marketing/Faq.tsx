import Section from "./Section";

/**
 * Native <details>, no JavaScript. Six questions a prospect actually asks,
 * answered the way we would answer them in the room — including the WhatsApp
 * ban question, which most competitors leave off the page.
 */
const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is it really my data?",
    a: (
      <>
        <p>
          Yes. Each workspace is isolated at the database level — every row carries your
          organisation’s id and every query is scoped by it, and we have tested that boundary
          adversarially, found two bugs, fixed them and kept the regression test. Conversations,
          contacts and knowledge live in Postgres. There is no one-click export yet; until there
          is, ask and we hand you a dump of your organisation’s rows.
        </p>
        <p>
          If you connect your own database, it is read through a read-only role that you create,
          and nothing is copied out of it. We are a processor of your customers’ data, not its
          owner, and we do not train models on it.
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
          price” — it calls <span className="mono">alertHuman</span>, which pauses the AI, moves the
          thread to your inbox and notes the reason for whoever picks it up.
        </p>
        <p>
          That is a real function call, not a promise in prose. We learned the hard way that
          models will write “I’ll pass this on” and pass nothing on, so the instruction that saying
          it is not doing it is baked into every agent.
        </p>
      </>
    ),
  },
  {
    q: "Will my WhatsApp number get banned?",
    a: (
      <>
        <p>
          It can. QR pairing uses the WhatsApp Web protocol, which is against WhatsApp’s terms, and
          numbers that behave like bots do get banned. Anyone who tells you otherwise is selling
          something.
        </p>
        <p>
          What we do about it: a new number starts under a daily send cap that rises over sixty
          days, we never let a fresh number do cold outreach, and we put the risk in writing before
          you connect. For a line your business cannot lose, wait for the official WhatsApp
          Business API, which carries no ban risk and is on our roadmap pending Meta approval.
        </p>
      </>
    ),
  },
  {
    q: "How fast is setup?",
    a: (
      <>
        <p>
          Paste your website URL and the crawl turns each page into question-and-answer pairs in
          minutes. Telegram takes a bot token and about five minutes; the website widget is one
          script tag; WhatsApp is a QR scan (built, and waiting for its first real number). A first
          real reply inside an hour is realistic on Telegram or the widget.
        </p>
        <p>
          Then spend an afternoon reading what it generated, editing what is wrong, and adding the
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
          Any provider that speaks the OpenAI chat-completions API: our platform gateway, OpenAI,
          DeepSeek, Qwen, MiniMax, Kimi, or your own endpoint. (Moving the platform key to a
          gateway that takes payment in rupees by UPI is planned, not done.) You choose per
          workspace, you can change it without a redeploy, and every
          message records which model answered and what it cost — so you can compare them on your
          own conversations rather than a leaderboard.
        </p>
      </>
    ),
  },
  {
    q: "Can it read my database?",
    a: (
      <>
        <p>
          That is the design. You connect a Postgres, MySQL or REST source through a read-only
          role, then define named queries — <span className="mono">check_order_status(order_no)</span>
          — with typed parameters and the SQL or path template behind each. The model chooses a
          query and fills in the arguments; it never writes SQL, and every argument is validated
          before anything runs.
        </p>
        <p>
          Honestly, where it stands: the data model and the safety rules are built and in the
          schema; the query executor and the screen to define queries are being built now. Ask us
          for the date rather than assuming it is there on day one.
        </p>
      </>
    ),
  },
];

export default function Faq() {
  return (
    <Section
      id="faq"
      n="07"
      eyebrow="Questions"
      title="The questions we get asked in the room."
      lede="Straight answers, including the ones that are not entirely comfortable."
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
