# 07 — Verified from inside the live account

**Session:** 24 August 2026, logged in via Chrome at `foundergrowth.ai`.
**Status:** partial — session ended early (see bottom). Agent configuration and AI quality still unverified.

---

## The headline correction

**Real credit consumption runs roughly 2× the advertised rate**, because *every* AI action is billed separately — not just the visible reply.

The billing ledger itemises each charge. On this account (Max tier, 0.25 credits per action), a single customer conversation on 15 August produced **eight separate charges**:

| Time | Charged action | Credits |
|---|---|---|
| 2:48:06 PM | AI Message | 0.25 |
| 2:48:20 PM | AI First Name Extraction | 0.25 |
| 2:48:37 PM | AI Message | 0.25 |
| 2:49:17 PM | AI Message | 0.25 |
| 2:51:08 PM | AI Tool Use: alertHuman | 0.25 |
| 2:53:14 PM | AI Email Extraction | 0.25 |
| 2:53:21 PM | AI Tool Use: setContactEmail | 0.25 |
| 2:53:34 PM | AI Message | 0.25 |
| | **Total for ~4 visible replies** | **2.00** |

So the customer saw four replies; the account was charged eight times. **~0.5 credits per visible reply against an advertised 0.25.**

Across the visible 30-day ledger: 11 "AI Message" charges but **5 tool-use charges and 3 extraction charges** on top.

### Costs nobody mentions in the marketing

| Charge | Rate | Why it matters |
|---|---|---|
| **KB Source: URL** — knowledge-base ingestion | **1 credit per page** | 15 pages of `altaherchemicals.com` were ingested = **15 credits ($1.50) just to train one client's bot**. A 200-page client site would cost $20 before a single conversation. |
| **Daily Summary Generation** | 0.25/day | Fires **every day regardless of activity** — ~7.5 credits/month of passive burn per workspace. |
| **Follow-up Cycle 1** | 0.25 each | Automated follow-ups are billed like replies. Six fired in the window. |
| **Quick Follow-up (custom message)** | ~0.6 avg | 2 charges totalling 1.25 credits. |
| **Campaign Generation from Sales Page** | 1 credit | Per generation. |

### The numbers on screen

- **Credits used, last 30 days: 71.75** across **95 billed records**
- Dashboard reports **18.06 credits per chat ≈ $1.81 per conversation**
- Balance: **42 remaining** — the dashboard itself warns *"≈ 2 more chats on your balance"*

**Read the 18.06 carefully.** It's inflated by fixed overhead (KB ingestion, daily summaries) spread across only ~4 real chats. The defensible planning figure from the conversational lines alone is **~0.5–0.6 credits per AI reply, about 2× the headline rate**, plus a per-client setup cost of ~1 credit per knowledge-base page, plus ~7.5 credits/month passive per workspace.

### What this does to the cost model

At 500 AI replies/month/client on Max: ~275 credits = **$27.50 per client per month**, versus the ~$12.50 the headline rate implies. At 20 clients that's ~$6,600/year in credits, not ~$3,000.

---

## The BYOK nuance that changes the recommended setup

My earlier analysis assumed bring-your-own-key defuses credit costs. That's **only true on the Pro tier**:

| Tier | Credits per action | With BYOK |
|---|---|---|
| **Pro** (Claude Sonnet) | 1.00 | **0 credits** — you pay Anthropic directly (~$0.005/call cached) |
| **Max** (their model) | 0.25 | **still 0.25** — runs on their infrastructure, key is irrelevant |
| **Mini** | 0.15 | **still 0.15** |

**This account is running Max, where BYOK would do nothing — and BYOK is not offered on this account at all.**

*Confirmed in a second session:* the agent editor's **AI quality** panel offers exactly three options and nothing else —

- **Pro** — "Old reliable — 1 credit per action"
- **Max** *(selected, marked Recommended)* — "Our most reliable AI — top of our benchmarks for real customer conversations — 0.25 credits per action"
- **Mini** — "Same AI as Max at a lower price — 0.15 credits per action. Higher chance of small mistakes or hallucinations, and a lighter memory in long conversations."

There is **no API-key field and no Anthropic option** anywhere in the agent editor or in Settings. So the Pro + BYOK configuration below is **not available to us today** — it would require an Agency-tier plan. Until the account question is settled, our real cost floor is Max at 0.25 credits per billed action.

The cheapest configuration is therefore counter-intuitive — the *most expensive-looking* tier is the cheapest one to run:

- **Max, no BYOK:** $0.025 per action
- **Pro + BYOK:** ~$0.005 per action → **5× cheaper**

Anyone reselling this at volume should run **Pro with their own Anthropic key**, not Max. That single setting is worth more than any plan negotiation.

---

## What the account actually is

This matters, because it determines whether we can resell at all.

**Billing page shows:**
- Monthly AI credits: **— (none)**
- Purchased credits: **100**
- Card on file: **No**
- Subscription: Active

**Plan features listed:** unlimited messaging channels, unlimited contacts, contact tagging, 100K AI agent context, real-time web search, voice/image/video/document understanding, AI media library, tasks, webhooks, custom functions, advanced mode, reply to comments, automatic follow-ups, unlimited AI responses per chat, AI appointment booking, daily summaries, API access, **3 team seats**.

**Conspicuously absent — from both the feature list and the settings navigation:**
- White-label / custom domain settings
- Sub-accounts or any agency section
- AI model selection or BYOK

Settings only contains: Profile, Security & General, Business, Team, Billing, Tags, Channels, Short Links, Booking & Calendar, Webhooks, API Key, Notifications, Data Export.

The string **"Sub Account"** does appear in the settings page text.

### The open question this raises

No monthly credit grant, no card on file, no agency tools, no white-label controls — **yet the site is fully white-labeled as FounderGrowth.AI.**

Two readings, and they lead to opposite conclusions:

1. **This workspace is a sub-account inside someone else's agency.** Someone sold the boss a white-labeled instance. If so, **we cannot resell from this account** — we are the client, not the agency, and the reseller economics in `03` and `04` don't apply to us yet.
2. **The boss holds an AppSumo lifetime deal** (3 team seats + 100K context + no monthly credits fits an LTD tier) and configured white-label from a separate agency-level login, with this being his own working workspace.

**This must be settled before any plan is built on it.** It is now the single most important open question — more important than anything about AI quality.

---

## Confirmed as advertised

- **White-label is genuinely complete.** FounderGrowth.AI logo, colours and naming throughout the dashboard, settings and billing. No DM Champ string anywhere in the interface.
- **"Unknown Unknown" contacts are real** — the review complaint reproduces directly in the activity feed and the chats list. Several contacts and one whole conversation are labelled that way.
- **Data Export exists** as a settings section, which supports the platform-risk mitigation in `04`.
- Custom functions, webhooks and API key are all present and available on this tier.

## Live usage — there is a real client on this

The account is not a toy. It is running **Al Taher Chemicals** (`altaherchemicals.com`), an electroplating and metal-finishing chemicals business, via an agent named **"Tia | ATC"**.

- 15 pages of their site ingested into the knowledge base
- One agent only: **"Tia | ATC"**, English, model tier **MAX**, active, created 12 days ago
- **14 replies at a 0% rate** — the agents list reports zero conversions/bookings from those replies
- Response speed is set to **"Fast"**, not the default "Human Like"; the UI warns in-line that faster speeds *"reduce AI thinking time, which can lower reply quality"*
- 14 replies, 4 new contacts in 30 days
- 37 messages sent — **73% handled by AI**, 27% by a human
- 3 conversations had both AI and human involvement; **0 were AI-only**
- Contacts by country: India (100% of those with a phone number)
- Open tasks include two "Human Alert" items and "Email lead sheet pricing to user"

**Zero conversations completed without human involvement.** On a sample of three that's not damning, but it does not yet demonstrate the autonomous close the marketing sells.

## Only one channel is connected

| Channel | Status |
|---|---|
| Chat Widget | **CONNECTED** — 14 in, 37 out, 27 AI, 3 contacts |
| WhatsApp Business | Not connected |
| WhatsApp Web | Not connected |
| SMS | Not connected |
| Instagram | Not connected |
| Messenger | Not connected |

**The entire Meta integration — the hard part, and the part reviewers complain about — is completely untested on this account.** Everything working today runs through a website chat widget, which is the easiest possible channel and the one that needs no Meta approval at all.

Any confidence about WhatsApp or Instagram working smoothly is currently unfounded on our side.

---

## Why this session ended

While expanding the collapsed sidebar menus to enumerate the navigation, I clicked every button in the sidebar — one of which was **Sign out**. My error. The session ended before I could reach the AI Studio agent configuration.

**Still to verify (needs a fresh login):**
- AI Studio → agent configuration: the actual playbook generated for Al Taher, model tier in use, whether a BYOK field exists
- Whether an account switcher or agency view exists anywhere (settles the sub-account question)
- Read the real conversations in `/chats` to judge AI quality on genuine enquiries
- Test a custom function against our own API
- The `/onboarding` flow and what a new client setup actually involves
