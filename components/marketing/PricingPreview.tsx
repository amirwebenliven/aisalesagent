import Link from "next/link";
import Section from "./Section";
import { IconCheck } from "./Icons";

/**
 * Early-access pricing in INR, the export price in USD in small print. Tiers
 * match CLAUDE.md §15; the offer (free month, sign-up credits, yearly = two
 * months free, referral month) is §16. The footnote keeps the per-reply model
 * cost floor written down, so the "we show you the real cost" claim is embodied
 * on the pricing section itself.
 */
const PLANS: {
  name: string;
  forWho: string;
  inr: string;
  inrYear: string;
  usd: string;
  hi?: boolean;
  items: string[];
}[] = [
  {
    name: "Starter",
    forWho: "One business, one agent, finding its feet.",
    inr: "1,499",
    inrYear: "14,990",
    usd: "$29",
    items: [
      "1 AI agent",
      "Telegram + website chat",
      "1 team seat",
      "Knowledge base up to 500 pages",
      "1,000 AI replies a month on our key — or bring your own, unmetered",
      "Spend caps per conversation and per day",
    ],
  },
  {
    name: "Business",
    forWho: "A sales team that wants WhatsApp and a shared inbox.",
    inr: "3,999",
    inrYear: "39,990",
    usd: "$79",
    hi: true,
    items: [
      "3 AI agents",
      "Everything in Starter, plus WhatsApp with warm-up",
      "5 team seats, shared inbox with handover",
      "Live data: 2 read-only sources, unlimited named queries (coming next)",
      "5,000 AI replies a month on our key — or bring your own, unmetered",
      "Follow-ups and meeting booking",
    ],
  },
  {
    name: "Scale",
    forWho: "Several brands or a high-volume line.",
    inr: "7,999",
    inrYear: "79,990",
    usd: "$149",
    items: [
      "Unlimited agents",
      "15 team seats",
      "Unlimited live-data sources (coming next)",
      "Official WhatsApp API when Meta approves it",
      "20,000 AI replies a month on our key — or bring your own, unmetered",
      "Priority support and a custom warm-up plan",
    ],
  },
];

export default function PricingPreview() {
  return (
    <Section
      id="pricing"
      n="05"
      eyebrow="Pricing · early access"
      title="Start free for a month. Then pay for replies, not seats."
      lede="Every plan begins with thirty days free and AI credits included — no card. Priced in rupees, costed to the reply, with the model cost written down underneath instead of hidden in credits."
    >
      <div className="mk-trial" role="note">
        <span className="pill ok"><span className="dot" />free month</span>
        <p>
          <b>Sign up today, pay nothing for 30 days.</b> Your account starts with AI credits to run a
          real month. When it ends, renew monthly — or pay yearly and get <b>two months free</b>.
        </p>
      </div>

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
            <div className="mk-usd">
              or ₹{p.inrYear} / year · two months free
              <br />
              outside India {p.usd} / month
            </div>
            <ul>
              {p.items.map((it) => (
                <li key={it}>
                  <IconCheck />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className={`btn${p.hi ? " primary" : ""}`}>
              Start your free month
            </Link>
          </div>
        ))}
      </div>

      <div id="referral" className="mk-referral">
        <div>
          <p className="mk-eyebrow">Refer &amp; earn</p>
          <h3>Bring a business, get a month free.</h3>
          <p>
            Every account has a referral link. When a business you refer buys any paid plan, your
            next month is on us — one free month for each paying business you bring.
          </p>
        </div>
        <div className="mk-referral-chip mono">
          agentplatform.in/signup?ref=<b>your-code</b>
        </div>
      </div>

      <div className="mk-notes">
        <p>
          <span className="mono">Early access.</span> Tiers and limits may move before general
          availability; what your plan says at sign-up is what your invoice says. INR is the
          billing currency. The USD figure is the export price for customers outside India.
        </p>
        <p>
          <span className="mono">The model cost, written down.</span> On our platform key a reply
          works out to roughly <span className="mono">₹0.03 – ₹0.07</span> (≈ $0.0003 – $0.0008) with
          a warm prompt cache, depending on the model and how long the conversation has run. Every
          message in the product carries its own figure, computed from the tokens it actually used.
          Included replies count one visible reply at a time — a function call inside a reply is
          never a second reply.
        </p>
        <p>
          <span className="mono">Bring your own key.</span> Point the workspace at your own provider
          and pay them directly; we bill only the platform fee and replies are unmetered. Every
          message still records the model, the tokens and the cache hits.
        </p>
      </div>
    </Section>
  );
}
