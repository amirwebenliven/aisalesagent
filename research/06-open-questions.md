# 06 — Open questions & the logged-in walkthrough

## Why this file exists

Everything in files 01–05 comes from public sources: DM Champ's marketing site, their help centre, AppSumo verified reviews, Latka's revenue data, Meta's developer documentation and independent reviews.

**What is not yet verified is the inside of the app** — the part the boss actually wants assessed, since he set up `foundergrowth.ai` specifically so it could be examined.

## Blocker: I can't log in, and shouldn't

I can't type credentials into a login form — entering passwords into fields is off-limits for me regardless of who supplies them.

**The workaround, which costs about thirty seconds:**

1. Open `https://foundergrowth.ai/login` in **Chrome** (the normal browser, not the in-app one)
2. Sign in with the boss's credentials
3. Tell me it's done

Once the session exists in Chrome, I can drive the logged-in app through Claude-in-Chrome and do the full teardown without ever handling the password. Nothing needs to be shared with me.

**Also worth doing separately:** change that password. It has now been sent through a chat interface, and it looks like a default (`Admin@123$`). If the account has any real client data on it, rotate it.

---

## What I'll verify once inside

### Product reality vs. marketing claims
- [ ] Does the **URL-to-agent** crawler actually produce a usable playbook, or a generic one? Test it against `zafstours.com` and see what it writes.
- [ ] What does the generated playbook look like in full — how much editing would each client need?
- [ ] Is the **conversation quality** actually good? Use the built-in test environment on a realistic safari enquiry.
- [ ] How well do the **realism controls** (reply delay, message splitting, typing simulation) hold up in practice?
- [ ] Do the "Unknown Unknown" Instagram contact naming issues appear?

### The commercial mechanics that decide our margin
- [ ] Exact **credit consumption** in practice — does a real conversation cost the advertised 1 / 0.25 / 0.15 credits per reply, or more?
- [ ] What plan is this account actually on, and what's the real credit balance and burn rate?
- [ ] Is **BYOK** present and working on this tier? *(This is the single most important thing to confirm — the entire cost argument in `04-build-vs-buy.md` rests on it.)*
- [ ] Are **sub-accounts** available, and does the **per-client credit markup** work as documented?
- [ ] What are the undocumented **"platform minimums"** on client pricing?

### White-label completeness
- [ ] Confirm **zero** DM Champ branding anywhere — including emails, error pages, password reset flows, the mobile view, and page source
- [ ] Check whether `tenants.youraiconnector.com` or similar leaks anywhere client-visible
- [ ] What does a **client's** view look like versus the agency view?

### Integration fit for our own work
- [ ] Test **Custom Functions** against our ZAFS Nuxt API — can the bot pull live tour/pricing data mid-conversation? This determines whether option 2 in `04-build-vs-buy.md` ("vertical differentiation without building") is real.
- [ ] Assess the REST API and webhook surface
- [ ] Check the MCP server integration

### Operational
- [ ] How long does onboarding a **new client** genuinely take, start to finish?
- [ ] How painful is the **Instagram/Meta connection** flow that reviewers complained about?
- [ ] What does data **export** look like (for the platform-risk mitigation in `04`)?

---

## Other open items

- **AppSumo lifetime deal** is sold out. Set a "notify me" alert — Tier 6 at $999 one-time would materially change the economics.
- **Meta's WhatsApp service-message rates** publish **1 September 2026**, effective **1 October 2026**. Re-run the cost model then, before quoting any client. Especially important if clients are UAE-based, where rates are 5–50× India's.
- **The YouTube channel** (`youtube.com/@dmchamp`, 195 videos, 131 subscribers) is a product tutorial library, not a marketing channel — and a large share of it is in **Dutch**. None of the videos carry captions or transcripts, so they can't be read programmatically. The good news: the content duplicates `help.dmchamp.com`, which is in text, in English, and far more complete — that's what files 01–03 are built from. If the boss specifically wants the video walkthroughs covered, the efficient path is for us to watch the ~20 English ones (listed below) rather than all 195.

**The English videos on the channel:**
`Meet DM Champ: Your 24/7 AI Sales Assistant` (1.5K views) · `DM Champ - AppSumo Welcome` (550) · `Connecting Phone Numbers with DM Champ` (642) · `Creating Campaigns DM Champ` (382) · `How Billing Works in DM Champ` (277) · `Creating Contacts in DM Champ` (155) · `Connect Google Calendar to your DM Champ` (127) · `List Management in DM Champ` (114) · `Importing Contacts DM Champ` (77) · `Creating Tags in DM Champ` (39) · `Exporting Contacts DM Champ` (30)

Also referenced from search but not on their own channel: `DM Champ Complete Setup Tutorial (Every Feature Explained)` and a third-party `DM Champ Review 2026 — Full Demo`.

---

## Sources used

**DM Champ's own:** [dmchamp.com](https://dmchamp.com/) · [pricing](https://dmchamp.com/pricing/) · [features](https://dmchamp.com/features/) · [for agencies](https://dmchamp.com/for-agencies/) · [help centre](https://help.dmchamp.com/) (AI model & BYOK, bot setup, custom functions, billing system, sub-accounts, white-labeling, WhatsApp pricing) · [YouTube](https://www.youtube.com/@dmchamp)

**Independent:** [AppSumo product](https://appsumo.com/products/dm-champ/) and [reviews](https://appsumo.com/products/dm-champ/reviews/) · [Latka revenue data](https://getlatka.com/companies/dmchamp.com) · [LifetimeDealTech review](https://lifetimedealtech.com/dm-champ-lifetime-deal-review-2026/) · [KATTA.CO review](https://katta.co/dm-champ-review/) · [Sohaib Ahmad on LinkedIn](https://www.linkedin.com/in/thesohaibahmad/)

**Meta / infrastructure:** [WhatsApp App Review docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review) · [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/) · [Instagram Messaging API approval guide 2026](https://singhamandeep.com/instagram-messaging-api-approval-getting-instagram_business_manage_messages-2026/) · [WhatsApp API pricing 2026](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)

**Alternatives:** [Chatwoot](https://www.chatwoot.com/) · [openalternative.co/chatwoot](https://openalternative.co/chatwoot)
