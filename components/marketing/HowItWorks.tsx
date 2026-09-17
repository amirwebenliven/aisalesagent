import Section from "./Section";

const STEPS: {
  title: string;
  body: string;
  tools?: string[];
  fine?: string;
}[] = [
  {
    title: "Connect in minutes",
    body:
      "Paste your website address. Connect Telegram with a bot token, WhatsApp by scanning a QR code, and your own site with one script tag.",
    fine: "No Meta approval needed for any of the three.",
  },
  {
    title: "It learns your business",
    body:
      "We read your site and turn it into clear question-and-answer pairs your team can review, edit and add to — pricing rules, lead times, the things that were never written down.",
    fine: "The knowledge base is a snapshot, not a live link. When your site changes, press Refresh.",
  },
  {
    title: "It answers and acts",
    body:
      "Every reply is grounded in that knowledge and your written rules. When something needs to happen — save a lead, book a call, set a reminder — the agent calls a function, and every call is logged with its cost.",
    tools: ["captureContact", "bookMeeting", "scheduleFollowUp", "tagContact", "alertHuman"],
  },
  {
    title: "You step in when it matters",
    body:
      "A handover moves the thread to your inbox and pauses the AI. Reply in the same conversation, on the same channel, and hand it back when you are done.",
    fine: "Escalation is a real function call, not a sentence — the AI saying “I’ll pass this on” is not the same as passing it on, and we built it so it cannot fake it.",
  },
];

export default function HowItWorks() {
  return (
    <Section
      id="how"
      n="02"
      eyebrow="How it works"
      title="From your website to a working sales agent in an afternoon."
      lede="Four steps. The first two are yours, the third is the agent’s, and the fourth is what makes it safe to let it talk to your customers."
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
