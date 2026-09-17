import Link from "next/link";
import Section from "./Section";
import { IconCheck } from "./Icons";

/**
 * Indicative early-access pricing in INR, USD in small print. The footnotes
 * are the point: the per-reply model cost floor is written down, so the
 * "we show you the real cost" claim is embodied on the pricing page itself.
 */
const PLANS: {
  name: string;
  forWho: string;
  inr: string;
  usd: string;
  hi?: boolean;
  items: string[];
}[] = [
  {
    name: "Starter",
    forWho: "One business, one agent, finding its feet.",
    inr: "1,999",
    usd: "≈ $24",
    items: [
      "1 AI agent",
      "Telegram + website widget",
      "1 team seat",
      "Knowledge base up to 500 pages",
      "1,000 AI replies a month on our key, or bring your own",
      "Spend caps per conversation and per day",
    ],
  },
  {
    name: "Business",
    forWho: "A sales team that wants WhatsApp and a shared inbox.",
    inr: "5,999",
    usd: "≈ $72",
    hi: true,
    items: [
      "3 AI agents",
      "Everything in Starter, plus WhatsApp (QR) with warm-up",
      "5 team seats, shared inbox with handover",
      "Live data: 2 read-only sources, unlimited named queries — shipping next",
      "5,000 AI replies a month on our key, or bring your own",
      "Follow-ups and meeting booking",
    ],
  },
  {
    name: "Scale",
    forWho: "Several brands or a high-volume line.",
    inr: "14,999",
    usd: "≈ $180",
    items: [
      "Unlimited agents",
      "15 team seats",
      "Unlimited live-data sources, when live data ships",
      "Official WhatsApp API when Meta approves it",
      "20,000 AI replies a month on our key, or bring your own",
      "Priority support and a custom warm-up plan",
    ],
  },
];

export default function PricingPreview() {
  return (
    <Section
      id="pricing"
      n="06"
      eyebrow="Pricing · early access"
      title="Priced in rupees. Costed to the reply."
      lede="Indicative early-access pricing while the product is in its first customers’ hands. What you see here is what the invoice will say — and the model cost underneath it is written down, not hidden in credits."
    >
      <div className="mk-plans">
        {PLANS.map((p) => (
          <div key={p.name} className={`mk-plan${p.hi ? " hi" : ""}`}>
            <div className="name">
              {p.name}
              {p.hi ? <span className="pill info">most teams</span> : null}
            </div>
            <p className="for">{p.forWho}</p>
            <div className="mk-price">
              ₹{p.inr}
              <small>/ month</small>
            </div>
            <div className="mk-usd">{p.usd} · billed in INR</div>
            <ul>
              {p.items.map((it) => (
                <li key={it}>
                  <IconCheck />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className={`btn${p.hi ? " primary" : ""}`}>
              Start free
            </Link>
          </div>
        ))}
      </div>

      <div className="mk-notes">
        <p>
          <span className="mono">Indicative.</span> Early-access pricing; tiers and limits will move
          before general availability. INR is the billing currency. USD is shown at an approximate
          rate for export customers and is not a quote.
        </p>
        <p>
          <span className="mono">The model cost floor, written down.</span> On our platform key a
          reply works out to roughly <span className="mono">$0.0003 – $0.0008</span> (≈ ₹0.03–0.07)
          with a warm prompt cache, depending on the model and how long the conversation has run —
          an estimate from provider list rates, not a promise. Every message in the product carries
          its own figure, computed from the tokens it actually used. Included replies are counted one
          visible reply at a time — a tool call inside a reply is not a second reply.
        </p>
        <p>
          <span className="mono">Bring your own key.</span> Point the workspace at your own provider
          and you pay them directly; we bill only the platform fee. Every message still records the
          model, the tokens and the cache hits. The dollar figure on those rows reads $0 today,
          because the bill is your provider’s, not ours — pricing them at your provider’s rates is
          on the list, not on the screen.
        </p>
      </div>
    </Section>
  );
}
