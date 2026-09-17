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
 * Honest state, per channel. "live" means answering today; "built" means the
 * code exists and has been exercised, but no customer has used it yet; "not
 * built" means exactly that — including Instagram and Messenger, where there is
 * no Graph API code in this repository at all, only the enum value and a card
 * on the channels screen. Their blocker is Meta App Review, which has to be
 * granted before the integration can even be tested. A channel card that
 * overstates its state is the fastest way to lose the trust the rest of the
 * page is trying to earn. Keep these in step with lib/channels/ and the
 * `built` flags in app/(app)/channels/page.tsx.
 */
type State = { label: string; pill: "ok" | "warn" | "mute" };

const LIVE: State = { label: "live", pill: "ok" };
const BUILT: State = { label: "built · awaiting first pairing", pill: "warn" };
const NOT_BUILT: State = { label: "not built", pill: "mute" };
const NOT_BUILT_META: State = { label: "not built · needs Meta review", pill: "mute" };

const CHANNELS: { name: string; icon: React.ReactNode; state: State; note: string }[] = [
  { name: "Telegram", icon: <IconTelegram />, state: LIVE, note: "Answering real customers today. A bot token is all it takes." },
  { name: "WhatsApp", icon: <IconWhatsApp />, state: BUILT, note: "Scan a QR code to connect. Built and tested against the bridge; no customer number has been paired yet. New numbers warm up under a daily send cap." },
  { name: "Website widget", icon: <IconGlobe />, state: LIVE, note: "One script tag on your site. No approval from anyone." },
  { name: "Instagram", icon: <IconInstagram />, state: NOT_BUILT_META, note: "Not started. Needs Advanced Access to instagram_manage_messages through Meta App Review — weeks, and rejections are routine." },
  { name: "Messenger", icon: <IconMessenger />, state: NOT_BUILT_META, note: "Not started. Same Meta App Review as Instagram. We will not name a date." },
  { name: "Email", icon: <IconMail />, state: NOT_BUILT, note: "IMAP and Gmail, with threading. Not built yet." },
  { name: "WhatsApp Business API", icon: <IconBadge />, state: NOT_BUILT, note: "The official route, no ban risk. Needs Meta Business Verification; not built yet." },
];

export default function Channels() {
  return (
    <Section
      id="channels"
      n="03"
      eyebrow="Channels"
      title="The channels your customers already use — with the honest state of each."
      lede="Two are live. One is built and waiting for its first real number. Four are not built — two of them cannot even be tested until Meta grants App Review, which is calendar time nobody can compress. We would rather you knew."
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
