import Section from "./Section";
import {
  IconBadge,
  IconGlobe,
  IconInstagram,
  IconMail,
  IconMessenger,
  IconTelegram,
  IconWhatsApp,
} from "./Icons";

/**
 * Honest state, per channel — said plainly, not apologetically. "live" means
 * answering customers today; "built" means the code exists and has been
 * exercised but no customer has used it yet; "roadmap" means not built.
 * Instagram and Messenger have no Graph API code in this repository at all,
 * only the enum value and a card on the channels screen; their blocker is
 * Meta App Review, which has to be granted before the integration can even be
 * tested. Keep these in step with lib/channels/ and the `built` flags in
 * app/(app)/channels/page.tsx — a card that overstates its state is the
 * fastest way to lose the trust the rest of the page is earning.
 */
type State = { label: string; pill: "ok" | "warn" | "mute" };

const LIVE: State = { label: "live", pill: "ok" };
const BUILT: State = { label: "built · ready to pair", pill: "warn" };
const ROADMAP: State = { label: "on the roadmap", pill: "mute" };

const CHANNELS: { name: string; icon: React.ReactNode; state: State; note: string }[] = [
  { name: "WhatsApp", icon: <IconWhatsApp />, state: BUILT, note: "Pair your number with a QR scan. New numbers warm up under a rising daily send cap, so they stay in good standing while the agent ramps up." },
  { name: "Telegram", icon: <IconTelegram />, state: LIVE, note: "Answering real customers today. Paste a bot token and it is live in five minutes — no approvals from anyone." },
  { name: "Website chat", icon: <IconGlobe />, state: LIVE, note: "One script tag on any site — Shopify, WordPress, custom. Same agent, same inbox, same knowledge." },
  { name: "Instagram DMs", icon: <IconInstagram />, state: ROADMAP, note: "Arrives with Meta App Review. That is Meta's timeline, not ours, so we will tell you when it is live rather than promise a date." },
  { name: "Messenger", icon: <IconMessenger />, state: ROADMAP, note: "Same Meta review as Instagram; ships alongside it." },
  { name: "Email", icon: <IconMail />, state: ROADMAP, note: "Gmail and IMAP with proper threading, so a reply lands in the same conversation." },
  { name: "WhatsApp Business API", icon: <IconBadge />, state: ROADMAP, note: "The official route — no ban risk, message templates, green tick. Pending Meta Business Verification." },
];

export default function Channels() {
  return (
    <Section
      id="channels"
      n="03"
      eyebrow="Channels"
      title="One agent, on the channels your customers already use."
      lede="Live today on Telegram and your website. WhatsApp is built and waiting for your number. Instagram, Messenger, email and the official WhatsApp API are next — and every card below says exactly where it stands."
    >
      <div className="mk-channels">
        {CHANNELS.map((c) => (
          <div key={c.name} className={`mk-channel${c.state.pill === "mute" ? " dim-card" : ""}`}>
            <div className="top">
              <span className="ico">{c.icon}</span>
              <span className={`pill ${c.state.pill}`}>
                {c.state.pill === "ok" ? <span className="dot" /> : null}
                {c.state.label}
              </span>
            </div>
            <h3>{c.name}</h3>
            <p>{c.note}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
