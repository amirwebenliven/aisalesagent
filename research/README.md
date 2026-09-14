# DM Champ — Research Dossier

**Prepared for:** decision on whether to resell DM Champ or build our own equivalent
**Date:** 24 August 2026
**Status:** Public research complete. Logged-in app teardown pending (see `06-open-questions.md`).

---

## Files

| File | Contents |
|------|----------|
| `01-product-teardown.md` | What the product actually is, full feature surface, how the AI agent works |
| `02-pricing-and-unit-economics.md` | Plans, the credit system, what a reply really costs them vs. us |
| `03-agency-white-label-model.md` | The reseller machinery — sub-accounts, branding, Stripe, margins |
| `04-build-vs-buy.md` | What building our own would cost, the Meta approval moat, break-even maths |
| `05-competitor-landscape.md` | Alternatives, and where DM Champ genuinely differs |
| `06-open-questions.md` | What still needs answering from inside the logged-in app |

---

## Executive summary

**DM Champ is not a website builder.** It is a **white-label AI sales agent** — an AI that reads and replies to customer messages on WhatsApp, Instagram DMs, Messenger, Telegram, SMS, email and web chat, qualifies the lead, handles objections and books the call. Agencies rebrand the whole platform under their own domain and resell it to their clients at whatever price they choose.

`https://foundergrowth.ai/login` is **our boss's white-labeled instance of DM Champ**. There is zero DM Champ branding on it — that is the product working exactly as designed. It is not a separate product he built.

### The company

- Founded 2023 by **Sohaib Ahmad**, based in the Netherlands (Den Haag / Dordrecht).
- **~$330K ARR** as of mid-2025, **3 employees**, **bootstrapped** (zero outside funding).
- Sells direct ($97–$497/mo) and has run an AppSumo lifetime deal ($59–$999 one-time, currently sold out).

### The revenue model, in one line

**Subscription for access + marked-up credits for usage.** The subscription is the smaller half. The real margin is in credits: they sell a credit at **$0.10**, and one AI reply burns 1 credit on their top tier. The underlying model call costs a fraction of a cent. That spread is the business.

They then let agencies do the same thing one level down — you buy credits at $0.10 and resell them to your clients at whatever rate you set per sub-account.

### The recommendation, up front

**Resell theirs first. Do not build yet.**

- **Agency Unlimited is $2,982/year** for unlimited client accounts and full white-label. Building a genuine equivalent is a **12–24 month, 2+ developer project** — call it $30K–$150K+ before maintenance. The subscription is not the expensive option; it is the cheap one by an order of magnitude.
- **The hardest barrier isn't code, it's Meta.** Serving *other businesses'* Instagram and WhatsApp accounts requires **Advanced Access via Meta App Review** on a verified Business portfolio — Meta actively tests the app, rejections are common, and each round trip costs weeks. Compliance exposure is permanent (misusing the `human_agent` tag, for instance, can cost API access outright). DM Champ already carries that approval and that risk on their account rather than ours.
- **BYOK removes the usual reason to build.** Normally you outgrow a per-message platform and building becomes rational at volume. DM Champ lets you plug in your **own Anthropic API key**, at which point AI replies cost **0 credits** and you pay Anthropic directly at cost. That kills the volume penalty and with it most of the financial case for building.

**Build only if the goal changes** — i.e. if the boss wants to own a *product* to sell as an asset, not just run an agency service on top of someone else's. That is a strategy decision, not a cost decision, and the maths in `04-build-vs-buy.md` should be read with that distinction in mind.

### The one risk worth naming now

We would be putting our client-facing brand on a **3-person bootstrapped company**. If they are acquired, pivot, or fold, every white-labeled client we have breaks at once. This is survivable but must be planned for: keep our own contracts and contact data, export regularly, and avoid building processes that only work inside their platform.

### Time-sensitive: 1 October 2026

Meta is changing WhatsApp pricing on **1 October 2026** — service messages (replies inside the 24-hour customer window), which are **free today**, become **charged per message**. Rates are due to be published 1 September 2026. Any pricing we quote a client before then needs a clause covering this. See `02-pricing-and-unit-economics.md`.
