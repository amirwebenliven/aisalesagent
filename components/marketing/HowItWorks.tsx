import Section from "./Section";

const STEPS: {
  title: string;
  body: string;
  tools?: string[];
  fine?: string;
}[] = [
  {
    title: "Connect",
    body:
      "Paste your website URL. Connect Telegram with a bot token, WhatsApp by scanning a QR code, and your own site with one script tag.",
    fine: "No Meta approval needed for any of the three.",
  },
  {
    title: "The agent learns",
    body:
      "We crawl your site and turn it into question-and-answer pairs your team can read, edit and add to — pricing rules, lead times, the things that were never on the website.",
    fine: "The knowledge base is a snapshot, not a live link. When your site changes, press Refresh.",
  },
  {
    title: "It answers and acts",
    body:
      "Every reply is grounded in that knowledge base and your written rules. When something needs to happen, the agent calls a function — and every call is logged with its cost.",
    tools: ["alertHuman", "captureContact", "tagContact", "scheduleFollowUp", "bookMeeting"],
  },
  {
    title: "You take over when it matters",
    body:
      "A handover moves the thread to your inbox and pauses the AI. Reply in the same conversation, on the same channel, and hand it back when you are done.",
    fine: "Escalation is a real function call, not a sentence — saying “I’ll pass this on” does not pass it on.",
  },
];

export default function HowItWorks() {
  return (
    <Section
      id="how"
      n="02"
      eyebrow="How it works"
      title="From a URL to a working agent in an afternoon."
      lede="Four steps. The first two are yours, the third is the agent’s, and the fourth is the reason it is safe to let it talk to your customers."
    >
      <ol className="mk-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="mk-step">
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            {s.tools ? (
              <div className="tools">
                {s.tools.map((t) => (
                  <span key={t} className="mk-tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {s.fine ? <p className="fine">{s.fine}</p> : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
