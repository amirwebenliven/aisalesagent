import Link from "next/link";

/**
 * The hero's picture is a phone: a short WhatsApp exchange with a fictional
 * furniture studio, ending in a booked meeting. It is an EXAMPLE — the same
 * fictional conversation the demo section below annotates in full — and the
 * demo's caption says so. The bubbles reuse the .dm-bubble / .dm-event
 * primitives so the two pictures are visibly the same product.
 *
 * The floating cost badge is the product's own idea — every reply carries a
 * cost — with a typical figure for a warm conversation on our platform key.
 */
function Phone() {
  return (
    <div className="mk-phone" aria-label="Example WhatsApp conversation with the agent">
      <div className="mk-phone-head">
        <span className="dm-avatar" aria-hidden="true">A</span>
        <span className="who">
          <span className="nm">Aster &amp; Oak</span>
          <br />
          <span className="ch">WhatsApp · studio assistant</span>
        </span>
        <span className="pill ok">
          <span className="dot" />
          AI online
        </span>
      </div>

      <div className="mk-phone-body">
        <div className="dm-date">Today · 9:42 pm</div>

        <div className="dm-msg in">
          <div className="dm-bubble in">
            Hi! Do you make a 6-seater dining table in walnut? Need it before Diwali 🙏
          </div>
        </div>

        <div className="dm-msg out">
          <div className="dm-bubble out">
            Hi Priya 👋 Yes — the Solstice table in solid walnut seats six, from ₹68,500. Lead time
            is 4–5 weeks, so an order this week lands well before Diwali. Chairs or a bench with it?
            <span className="stamp">AI · answered from your catalogue · 2.4 s</span>
          </div>
        </div>

        <div className="dm-msg in">
          <div className="dm-bubble in">Chairs. Can we talk to someone about a custom size?</div>
        </div>

        <div className="dm-msg out">
          <div className="dm-bubble out">
            Of course. Our designer Ananya has Tuesday 4:30 pm or Wednesday 11:00 am — which suits
            you?
            <span className="stamp">AI · 1.9 s</span>
          </div>
        </div>

        <div className="dm-msg in">
          <div className="dm-bubble in">Tuesday works</div>
        </div>

        <div className="dm-event ok">
          <strong>bookMeeting</strong>
          <span className="mono">Tue 4:30 pm · Ananya · invite sent</span>
        </div>

        <div className="mk-typing" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="mk-phone-float" aria-label="Cost of this conversation">
        <span className="k">this conversation</span>
        <span className="v">₹0.11</span>
        <span className="d">3 replies · 1 action · typical</span>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="mk-hero">
      <div className="mk-wrap mk-hero-grid">
        <div className="mk-hero-copy">
          <p className="mk-eyebrow">AI sales agent · WhatsApp · Telegram · your website</p>
          <h1>Every lead answered in seconds. Every hard one handed to you.</h1>
          <p className="mk-lede">
            It learns your business from your website, replies to customers around the clock on
            WhatsApp, Telegram and your site, saves their details, books the meeting — and hands
            over to a person the moment a question is out of its depth.
          </p>
          <div className="mk-hero-cta">
            <Link href="/signup" className="btn primary mk-btn-lg">
              Start your free month
            </Link>
            <a href="#demo" className="btn mk-btn-lg">
              See it work
            </a>
          </div>
          <p className="mk-trust">
            <b>30 days free · AI credits included · no card.</b> Any AI provider, or bring your own key.
          </p>
          <div className="mk-hero-stats" aria-label="At a glance">
            <div>
              <div className="v">&lt; 3 s</div>
              <div className="k">to the first reply</div>
            </div>
            <div>
              <div className="v">24 / 7</div>
              <div className="k">on every channel</div>
            </div>
            <div>
              <div className="v">₹0.04</div>
              <div className="k">typical cost per reply</div>
            </div>
            <div>
              <div className="v">1 click</div>
              <div className="k">to take over a chat</div>
            </div>
          </div>
        </div>
        <Phone />
      </div>
    </section>
  );
}
