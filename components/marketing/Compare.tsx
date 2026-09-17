import Section from "./Section";
import { IconCheck, IconDash, IconHalf } from "./Icons";

/**
 * Honest three-way comparison. The competitors get their wins in plain text —
 * AiEngage has voice, a mobile app, a pipeline and payments; DM Champ has
 * Instagram today and a white-label tier — because a table where the home
 * column is all ticks convinces nobody who has used either product.
 */
type Mark = "yes" | "part" | "no";
type Cell = { mark: Mark; text: string };
type Row = { label: string; dmchamp: Cell; aiengage: Cell; us: Cell };

const ROWS: Row[] = [
  {
    label: "Built for",
    dmchamp: { mark: "part", text: "The AI agent first; white-label for agencies" },
    aiengage: { mark: "part", text: "A full CRM; the AI WhatsApp agent is one feature" },
    us: { mark: "yes", text: "The AI agent first, with the CRM basics a business actually needs" },
  },
  {
    label: "Channels live today",
    dmchamp: { mark: "yes", text: "WhatsApp (official + QR), Instagram, Messenger, Telegram, SMS, email, web widget" },
    aiengage: { mark: "yes", text: "WhatsApp, email, SMS, calls, web forms, Meta and Google Ads lead sync" },
    us: { mark: "part", text: "Telegram and the website widget live; WhatsApp (QR) built, awaiting its first real number. Instagram and Messenger not built — they need Meta App Review first" },
  },
  {
    label: "Answers from your own database or API",
    dmchamp: { mark: "part", text: "Custom Functions — you wire up the API call yourself" },
    aiengage: { mark: "part", text: "REST API and MCP on the Business Pro plan" },
    us: { mark: "part", text: "Named read-only queries; the model never writes SQL. Executor shipping next" },
  },
  {
    label: "AI provider",
    dmchamp: { mark: "part", text: "Their model tiers; bring-your-own-key is Anthropic only, on one tier" },
    aiengage: { mark: "no", text: "Theirs" },
    us: { mark: "yes", text: "Any OpenAI-compatible provider. Your key, your bill" },
  },
  {
    label: "Cost per reply on screen",
    dmchamp: { mark: "part", text: "Credits at $0.10; real usage runs about 2× the headline because tool calls bill separately" },
    aiengage: { mark: "no", text: "Bundled into the plan" },
    us: { mark: "yes", text: "Real dollars per message, model and cache-hit rate, in Settings" },
  },
  {
    label: "Human handover",
    dmchamp: { mark: "yes", text: "Yes — alertHuman" },
    aiengage: { mark: "yes", text: "Yes — hands to your team" },
    us: { mark: "yes", text: "A first-class tool; the thread moves to your inbox and the AI pauses" },
  },
  {
    label: "WhatsApp ban-risk handling",
    dmchamp: { mark: "yes", text: "60-day warm-up on QR numbers" },
    aiengage: { mark: "yes", text: "Official API only, so no QR risk" },
    us: { mark: "yes", text: "Rising daily caps on QR numbers plus written disclosure; official API coming" },
  },
  {
    label: "Voice calling · mobile app",
    dmchamp: { mark: "no", text: "Not offered" },
    aiengage: { mark: "yes", text: "Calling with recording and transcription; iOS and Android apps" },
    us: { mark: "no", text: "Neither. Responsive web only" },
  },
  {
    label: "Pipeline, quotes, payments",
    dmchamp: { mark: "no", text: "No CRM depth" },
    aiengage: { mark: "yes", text: "Kanban pipeline, quotes, Stripe and Razorpay" },
    us: { mark: "no", text: "Not yet — sequenced after channels and live data" },
  },
  {
    label: "White-label reselling",
    dmchamp: { mark: "yes", text: "Agency tiers at $297 and $497 a month" },
    aiengage: { mark: "no", text: "Not offered" },
    us: { mark: "no", text: "Not yet" },
  },
  {
    label: "Pricing",
    dmchamp: { mark: "part", text: "$97 – $497 a month plus credits" },
    aiengage: { mark: "part", text: "₹1,799 – ₹9,999 a month per workspace" },
    us: { mark: "yes", text: "INR tiers below, USD for export; bring your own key and pay the provider directly" },
  },
];

function MarkCell({ cell }: { cell: Cell }) {
  const Icon = cell.mark === "yes" ? IconCheck : cell.mark === "part" ? IconHalf : IconDash;
  return (
    <span className={`mark ${cell.mark}`}>
      <Icon />
      <span>{cell.text}</span>
    </span>
  );
}

export default function Compare() {
  return (
    <Section
      id="compare"
      n="05"
      eyebrow="Compare"
      title="Against the two you will be shown next."
      lede="DM Champ is the agent-first product agencies resell. AiEngage is the Indian CRM with an AI WhatsApp agent bolted on. Here is where each one is ahead, including them."
    >
      <div className="cmp-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              <th scope="col">DM Champ</th>
              <th scope="col">AiEngage</th>
              <th scope="col" className="us">
                Agent Platform
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td className="lab">{r.label}</td>
                <td>
                  <MarkCell cell={r.dmchamp} />
                </td>
                <td>
                  <MarkCell cell={r.aiengage} />
                </td>
                <td className="us">
                  <MarkCell cell={r.us} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cmp-note">
        Competitor details from their public sites and our own evaluation of a live DM Champ
        account, August–September 2026. Where a row says “not offered” for a competitor, we could
        not find it; tell us if we are wrong and we will fix the row.
      </p>
    </Section>
  );
}
