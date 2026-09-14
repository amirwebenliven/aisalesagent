# 04 — Build vs. buy

## The question the boss asked

> "Can we create a product like theirs, or if their existing product is cheaper, can we use it instead?"

Short answer: **their product is dramatically cheaper, and the gap is not close.** Building is justifiable only if the goal is to own a sellable product asset, not to serve clients cheaply.

---

## What we would actually have to build

Four independent systems, not one:

### 1. The AI agent layer — *the easy part*
Prompt orchestration, knowledge base retrieval, conversation memory with summarisation, tool/function calling, human handoff, the URL-to-playbook crawler.

**Effort: 4–8 weeks.** With the Claude API this is genuinely tractable — tool use, prompt caching and long context do most of the heavy lifting. Their "realism" tricks (reply delays, message splitting, simulated typing) are simple to copy once you know they matter.

This is the part that *feels* like the product and is the smallest slice of the work. That asymmetry is the whole trap.

### 2. Omnichannel messaging infrastructure — *the hard part*
WhatsApp Cloud API, Instagram Messaging, Messenger, Telegram, Twilio SMS, IMAP/Gmail/Outlook email, a web chat widget. Each has its own webhook contract, message format, media handling, delivery receipts, rate limits, retry semantics and 24-hour-window rules.

**Effort: 3–6 months** for solid coverage, and permanent maintenance — Meta changes these APIs constantly.

### 3. The multi-tenant white-label platform — *the unglamorous part*
Everything in `03-agency-white-label-model.md`: tenant isolation, per-tenant theming, custom domains with automated certificate issuance and renewal, impersonation with audit trails, a credit ledger with per-tenant markup and atomic double-deduction, Stripe billing with plans/trials/invoices/auto-recharge, snapshots.

**Effort: 3–5 months.** Security-sensitive, tedious, and invisible to users until it breaks.

### 4. The application itself
Unified inbox, contact CRM, campaign builder, booking with calendar sync, pipeline, analytics, REST API, webhooks, admin tooling.

**Effort: 3–6 months.**

**Total to genuine parity: 12–24 months with 2+ developers.** A narrow MVP — WhatsApp + web chat, one AI agent, basic inbox, no white-label — is maybe **3–4 months for 2 developers**, and would not yet be resellable.

---

## The Meta approval barrier — the part code cannot solve

This is the constraint most people underestimate.

**For a single business** using WhatsApp Business API, onboarding is fast: 3–10 business days end to end (2–4 days for Business Verification, hours for WABA and number setup, 24–48 hours for first template approval).

**For a platform serving other businesses' accounts — which is exactly what we'd be — it is a different process:**

- Instagram messaging needs **Advanced Access** to `instagram_manage_messages` (plus `instagram_basic`, `pages_manage_metadata`, `pages_show_list`), granted only through **App Review on a verified Meta Business portfolio**.
- Meta's team **actively tests the app's functionality** and audits policy compliance. A missing or non-working webhook callback URL is a standard rejection.
- Rejections are common and each round trip costs weeks.
- Ongoing compliance risk is real: for example, using the `human_agent` tag for automated bot replies is explicitly prohibited and is cited as **one of the fastest ways to lose API access entirely**.

So the barrier isn't a hard wall — it's a **weeks-long, rejection-prone approval process plus permanent compliance exposure**. DM Champ has already been through it and carries that risk on their account, not ours. That is a substantial, unpriced part of what the subscription buys.

Note this cuts both ways: reviewers report DM Champ's *own* Instagram connection flow is fragile (one user spent three days failing to connect). Meta integration is painful even when someone else has done the approval work.

---

## The money

### Cost to buy

| | Annual |
|---|---|
| Agency Unlimited (yearly billing) | **$2,982** |
| Credits at 100 clients, BYOK, cached Sonnet | ~$3,000 |
| **Total, unlimited clients** | **~$6,000/year** |

*(If the AppSumo Tier 6 lifetime deal returns at $999 one-time, the platform cost effectively drops to near zero and only usage remains.)*

### Cost to build

| | Estimate |
|---|---|
| 2 developers × 12 months | $30,000 – $150,000+ *(varies hugely by region and seniority)* |
| Ongoing maintenance, Meta API churn, on-call | 30–50% of build cost, every year, forever |
| Meta approval cycles | Weeks of calendar time, non-deliverable |
| Opportunity cost | Those developers are not building anything else |

### Break-even

Even at the most optimistic build cost, we would need **5+ years of DM Champ subscription** to equal a single year of building it — and that ignores maintenance, which never stops.

### The argument that normally rescues "build" — and why it fails here

The usual case for building is that per-message platform fees explode at volume. That would be true here too: at 100 clients without BYOK we'd pay ~$15,000/year in credits at their 20× markup.

**But BYOK is available on our tier.** Plug in our own Anthropic key and AI replies cost **0 credits** — we pay Anthropic directly at cost. Our marginal cost per client collapses to almost nothing, and the volume argument for building evaporates.

DM Champ built the escape hatch that removes the main reason to leave them.

---

## When building *would* make sense

The financial case is weak. These are the non-financial cases, and they're legitimate:

1. **We want a product to sell, not a service to deliver.** A SaaS we own is an asset with enterprise value; a reseller arrangement is not. If the boss's real ambition is to build DM Champ's *business*, not use their software, then everything above is beside the point — but it should be an explicit, funded product bet with a 12–24 month horizon, not a cost-saving exercise.
2. **A vertical they will never serve.** A safari/tourism-specific agent wired into our own Nuxt API — live availability, real itineraries, real pricing — could be genuinely differentiated. *However:* DM Champ's **Custom Functions** already let their bot call our API mid-conversation. We can likely get 80% of that differentiation without building anything.
3. **Platform risk becomes unacceptable.** See below.
4. **Data or regulatory requirements** we can't meet on their infrastructure.

---

## Platform risk — name it before committing

DM Champ is **3 people, ~$330K ARR, bootstrapped, founded 2023**. We would be putting our client-facing brand and our clients' live sales conversations on it.

If they are acquired, pivot, or fold, **every white-labeled client breaks simultaneously** — and those clients think the product is *ours*.

Mitigations, all cheap:
- Hold our own client contracts; never let DM Champ be the contracting party
- Export contacts and conversation data on a schedule (they support export and have a documented DPA)
- Keep the AI playbooks in our own repo as the source of truth, not only in their UI
- Prefer **Managed billing mode** so client payment relationships stay ours
- Use **BYOK** — our Anthropic account, our key, our model relationship
- Bill annually only once the offer is validated on monthly

On the other side of the ledger: bootstrapped and profitable at 3 people is a *stable* shape. They're not burning VC money chasing a pivot. And reviewers consistently praise the team shipping fixes within days.

---

## Recommendation

**Phase 1 — Resell (now, next 3–6 months).**
Run on the account the boss already has. Onboard 3–5 real clients under `foundergrowth.ai`. Learn the operational reality: how long setup truly takes, how good the AI is on our clients' actual conversations, where it embarrasses us. Cost: essentially the subscription already paid.

**Phase 2 — Decide with evidence (month 6).**
Revisit only if a specific trigger fires:
- We exceed ~30 paying clients and the model is proven
- We hit a hard product limit they refuse to fix
- The boss commits to a product bet rather than a service business

**Phase 3 — Build selectively, if at all.**
Even then, don't rebuild the platform. Build the **thin differentiating layer** — our own vertical playbooks, our own API integrations via Custom Functions, our own onboarding and reporting — on top of their infrastructure. That's where our advantage would actually live, and it's weeks of work rather than years.

**What to do this week regardless:**
1. Get inside the app and verify the claims (see `06-open-questions.md`)
2. Set an AppSumo notification for the lifetime deal returning
3. Diarise **1 September 2026** to check Meta's published WhatsApp service-message rates before quoting any client
