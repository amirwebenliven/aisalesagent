# Product plan — complete working product

What a customer signs up for, what they connect, and what the AI does with it.

`CLAUDE.md` is the engineering reference — architecture, schema, conventions, gotchas. **This document is the product**: the user journey, the screens, the phases, and what is already proven to work.

---

## 1. The product in one paragraph

A business signs up, connects the places its customers already message it — WhatsApp, Telegram, Instagram, its website — and points us at what it knows: its website, and optionally its live database or API. From then on an AI answers every incoming message: it qualifies the lead, answers product questions from the business's own material, handles objections, looks up live data when the answer changes (stock, orders, availability), books a meeting when the lead is ready, and pulls in a human the moment it should stop guessing. The business watches it all in one inbox and can take over any conversation with one click.

**The job to be done:** a lead messages at 11pm and gets a real answer in thirty seconds instead of a reply on Monday.

### Where it sits in the market (17 Sep 2026)

Between DM Champ and AiEngage. **DM Champ** (`research/01`–`08`) is an AI agent for DMs with almost no CRM, sold to agencies who rebrand it. **AiEngage** (`research/10`) is a full CRM — pipeline, quotes, Razorpay, calling, a mobile app — with an AI WhatsApp agent as one of nine features, sold to Indian SMBs at ₹1,799–9,999 a month; their reps pitched it in our office this week. We are agent-first like DM Champ, we add the CRM basics an SMB uses daily (contacts, assignment, a simple pipeline, follow-ups), and we do three things neither does:

1. **The agent answers from the customer's own data** — stock, orders, availability — through named read-only queries a human defined (§4 step 5). The model never writes SQL. *Status: schema exists; the executor and UI are Phase 13.*
2. **Any AI provider, the customer's key, the real cost on screen** — per-message USD and cache hit rate, never "credits". *Status: built.*
3. **Risk in the open** — warm-up caps enforced at send time, escalation as a tool the inbox enforces (§7), spend caps per conversation and per day, ban-risk disclosure at connect time. *Status: built, except the disclosure copy in the UI.*

What AiEngage has that we do not, said plainly: official WhatsApp, Instagram and Messenger, voice calling, a mobile app, a Kanban pipeline, quotes and Razorpay, Meta/Google ads lead sync, a support team and 2,000 references. Phases 13–16 in §8 sequence what we close and what we leave. We do not sell against them as a CRM; we sell the agent that answers from the customer's stock list and connects to whatever CRM they already have. The full comparison and the "could we win the deal" verdict are in `research/10-competitors-aiengage-vs-dmchamp.md`.

---

## 2. The user journey

```
Sign up  →  Onboarding wizard  →  Live  →  Daily use
  │             │                   │         │
  │             ├─ 1 Business       │         ├─ Inbox: read, take over, hand back
  │             ├─ 2 Website        │         ├─ Agent: tune wording, add FAQs
  │             ├─ 3 Agent review   │         ├─ Dashboard: volume, cost, escalations
  │             ├─ 4 Channels       │         └─ Settings: model, spend cap, team
  │             ├─ 5 Live data      │
  │             └─ 6 Test           │
  └─ email + password, creates an Organization
```

**Target: signed up to first real AI reply in under 15 minutes.** That is the benchmark DM Champ set and the one reviewers actually praise them for. Everything in the wizard is arranged around hitting it.

---

## 3. Sign up

| | |
|---|---|
| Fields | Work email, password, business name |
| Creates | `User` + `Organization` + `Membership(OWNER)` |
| Email | Always stored lowercased — the classic bug is creating with `.toLowerCase()` and logging in without it, so a real account reports "email not found" |
| Rate limit | On login and on signup. Size the window for shared/CGNAT IPs or you lock out whole offices |
| Team | Owner invites Admins and Members later from Settings |

No credit card at signup. A new organization gets a trial credit balance so the wizard can run the AI immediately — the moment of value has to come before the payment form.

---

## 4. Onboarding wizard

Six steps, each independently skippable except the first two. Progress is saved, so a user can leave and come back.

### Step 1 · Your business

Name, timezone, primary language. Thirty seconds.

### Step 2 · Your website

The user pastes one URL. We crawl it (sitemap first, same-origin BFS as fallback, capped depth and page count), extract the main content of each page, and generate question-and-answer pairs with the utility model.

**What the user sees:** a live counter — *"Reading altaherchemicals.com… 38 of 59 pages · 84 answers so far."*

**Say the limitation plainly, in the UI:** this is a **snapshot, not a live link**. Change the website and the AI will not know until someone presses Refresh. Every customer assumes otherwise, and it becomes a support ticket the first time a price changes.

Costs roughly 1 credit per page. Show the estimate before starting.

### Step 3 · Review your agent

We pre-fill the whole agent from the crawl, then show it for editing in named sections:

| Section | What it holds |
|---|---|
| Who you are | Name, role, personality |
| Your goal | What a successful conversation achieves |
| About the business | Products, customers, credentials |
| Rules you must follow | Guardrails — what it must never do |
| How the conversation should go | Numbered steps |
| **When to hand over to a human** | **The most important field — see §7** |
| When to end the conversation | So it stops rather than looping |

The user edits prose, never a prompt. That separation is what lets a non-developer tune the agent without collapsing it.

### Step 4 · Connect channels

Ordered by how fast they work, not alphabetically — the user should hit a success in step 4, not a Meta form.

| Channel | What the user does | Approval | Time |
|---|---|---|---|
| **WhatsApp (QR)** | Scans a QR with their phone's WhatsApp | **None** | **2 min** |
| Website widget | Copies a `<script>` tag into their site | None | 10 min |
| Telegram | Pastes a bot token from BotFather | None | 5 min |
| Email | OAuth to Gmail/Outlook, or IMAP details | None | 5 min |
| WhatsApp Business API | Embedded Signup, or bring a Cloud API number | Meta Business Verification | 3–10 days |
| Instagram & Messenger | Connect a Facebook Page | **Meta App Review** | **Weeks, rejections common** |

**WhatsApp QR is the wedge.** It is the only way to get a real WhatsApp number answering within minutes, and it is why a demo lands. Its cost: the protocol is unofficial, numbers can be banned, and each new number warms up over ~60 days with a rising daily cap. We show the warm-up state in the UI and put the ban risk in writing at connect time — never bury it.

### Step 5 · Live data *(optional — the differentiator)*

Static FAQs cannot answer "is it in stock", "where is my order", "what's free on Thursday". This step connects the business's own systems so the AI can.

**Two ways in:**

**A · Database** — the user gives a connection string for a **read-only role**. We never take write credentials. Then they define named queries:

```
Name        check_stock
When to use "Customer asks whether a product is available or how much is in stock"
Inputs      productCode (string)
Query       SELECT code, name, qty_available, unit FROM products WHERE code = $1
```

**B · API endpoint** — base URL plus an auth header, then named operations mapped to paths.

**The safety model is the whole point.** The model **never writes SQL and never picks a URL**. A human defines the query; the model may only call it by name with arguments validated against a JSON Schema, bound by the driver, capped at N rows with a timeout. A customer typing something clever into WhatsApp cannot reach anything the business did not explicitly expose.

We also provide a guided SQL generator for non-technical users: they describe what they want, we propose the query, they approve it. Approval by a human is mandatory — that is the gate.

### Step 6 · Try it

A sandbox chat against the real agent. No channel, no contact, nothing saved. The user sends three messages, sees it answer from their own website's content, and the wizard is done.

---

## 5. What the customer uses day to day

| Screen | Purpose |
|---|---|
| **Dashboard** | Volume, AI-vs-human split, spend, channel health, what needs attention |
| **Chats** | One inbox for every channel. Read along, take over, hand back |
| **Contacts** | Who has messaged, tags, history |
| **AI Agents** | Tune instructions, review escalation rules |
| **Knowledge Base** | Sources, answers ranked by how often the AI actually used them, add hand-written FAQs |
| **Live Data** | Manage named queries, see what the AI called and when |
| **Channels** | Connect, disconnect, warm-up state |
| **Settings** | Model choice, own API key, spend caps, team, usage |

**Taking over must be one click and instantly obvious.** The AI pauses the moment a human replies and stays paused until explicitly handed back. Anything subtler and a customer gets two voices in one thread.

---

## 6. How the AI converts a lead

This is the part that has to be good, and it is mostly instruction design rather than code.

**1 · Qualify before pitching.** One question at a time, never a form. Substrate, application, industry, volume — whatever the business actually needs to route the enquiry.

**2 · Answer from the business's own material.** Retrieved FAQs outrank the model's general knowledge. Hand-written FAQs outrank crawled ones. If nothing covers it, say so and offer to find out — never invent.

**3 · Handle objections instead of dodging them.** The common ones are predictable and belong in the agent's instructions as worked responses:

| Objection | The move |
|---|---|
| "Too expensive" | Reframe against cost of failure/rework, then offer a consultant call rather than arguing price |
| "Just looking" | Offer something useful with no ask — a spec sheet, a selection guide — and leave the door open |
| "Send me a price list" | Explain why spec drives price, ask the two questions that let the team quote properly |
| "I'll think about it" | Agree, then schedule the follow-up explicitly rather than waiting |
| "Are you a bot?" | Answer honestly and immediately offer a human. Denying it is how trust dies |

**4 · Detect the buying signal and ask for the meeting.** Concrete quantities, timelines, named applications — that is the trigger. Then propose two specific slots, not "when are you free?"

**5 · Book it.** `bookMeeting` checks availability, writes to the business's Google Calendar, confirms in-chat.

**6 · Follow up if it goes quiet.** Scheduled, contextual, and capped — every follow-up is a model call and an irritation risk. Two, then stop.

**7 · Escalate rather than guess.** Covered next, because it matters more than any of the above.

---

## 7. Escalation is the feature

The single thing that makes this safe to sell is that the AI **knows when to stop**.

We first saw the behaviour in August on **DM Champ's** agent, on the boss's foundergrowth.ai account — *"The cookware side is a little different, since it's food-contact and I don't want to point you to the wrong chemistry there."* Good line; not our product. It said it in prose and no function fired.

On 18 Sep 2026 the same four customer messages were replayed through **our** agent (`bun scripts/replay-demo.ts`, seeded Al Taher workspace, eight crawled FAQs, minimax-m3). Ours said:

> *"Rajesh, the cooking utensils part is a food-contact application — I don't want to guess on that one, so I'll pass it to our team to advise properly."*

— and in the same turn **called `alertHuman`** with the reason *"Food-contact chrome plating enquiry for cooking utensils — needs proper technical guidance on food-safe chemistry."* The thread moved to the inbox. That is the difference between a sentence and an escalation, and it is the one the homepage demo now shows (`components/marketing/LiveDemo.tsx`), verbatim, including the turn where it failed to infer "decorative finish" from the one-word answer "Elegant." Measured cost for all four replies: $0.0014, cache hit 99% by turn three.

**Hard-won implementation note, verified in testing on 14 Sep 2026:** models will happily *describe* an escalation in prose — "I'll pass this to the team" — and never call the function. Nobody is notified, the lead goes cold, and nothing appears broken. The fix is an imperative instruction that saying it is not doing it:

> *Calling a function is how anything actually happens — describing an action in your reply does NOT perform it. When any situation under "When to hand over to a human" applies, you MUST call alertHuman in the same turn.*

Before that line: escalation silently failed. After it: fired correctly with an accurate reason. **This belongs in every agent's prompt and in the model evaluation in `CLAUDE.md` §11** — it is the first thing to test when changing model.

---

## 8. Build phases

Each phase ends with something a customer could use. Estimates assume one developer with AI assistance.

| Phase | Weeks | Ships | Status |
|---|---|---|---|
| **0 · Foundations** | 1 | Bun + Next + Prisma + Postgres, schema, crypto, env | **Done** |
| **1 · Model layer** | 1 | OpenAI-compatible client, BYOK, prompt assembly, cost accounting | **Done** |
| **2 · Dashboard UI** | 1 | All screens reading real data | **Done** |
| **3 · Agent loop** | 1–2 | Queue + worker, tool registry, `alertHuman` / `captureContact` (+ `tagContact`, `scheduleFollowUp`, `bookMeeting`), Try-out tab live | **Done** |
| **4 · Telegram** | 1 | First real channel end to end — no approval needed | **Done — live**, answering real customers |
| **5 · Auth + onboarding** | 2 | Signup, sessions, the six-step wizard | **Partial** — multi-tenant auth done, isolation audited (2 real bugs fixed, regression-tested); the wizard is not built, its screens exist separately → Phase 14 |
| **6 · Knowledge crawler** | 2 | Crawl → FAQs → pgvector retrieval, Refresh | **Done** — with Postgres full-text retrieval, not pgvector; it did not earn its migration |
| **7 · Website widget** | 1–2 | Embeddable script + public chat endpoint | **Done** |
| **8 · WhatsApp QR** | 1–2 | WAHA, pairing, warm-up caps, risk disclosure | **Built** — warm-up caps enforced at send; awaiting first real pairing; disclosure copy not yet in the UI |
| **9 · Live data** | 2 | Read-only connectors, named queries, guided SQL | **Schema only** — `DataSource` / `DataQuery` exist; no executor, no UI → Phase 13 |
| **10 · Meetings** | 1–2 | Availability, Google Calendar, `bookMeeting` | **Partial** — `bookMeeting` records the slot as a `REMINDER` job + contact note; no calendar write, no availability → Phase 15 |
| **11 · Follow-ups** | 1 | Scheduled jobs, caps | **Done** for model-written text; a follow-up with no text waits for a human → AI-composed in Phase 15 |
| **12 · Harden** | 2 | Dedup, retries, rate limits, spend caps, error log | **Partial** — per-conversation dedup, spend caps (per conversation, per org per day), login rate limits done; retry policy and error log open |

**≈ 16–20 weeks to the complete product described above**, single-tenant-per-org but multi-org from day one.

**Meta channels (Instagram, Messenger, official WhatsApp) land whenever Meta approves** — file the App Review in week 1, because it is calendar time nobody can compress.

**Deliberately after launch:** white-label reselling (per-tenant branding, custom domains, credit ledgers, Stripe) — another 6–10 weeks, and worthless until paying customers exist.

### Added 17 Sep 2026 — closing the gap to AiEngage

Sequenced from `research/10-competitors-aiengage-vs-dmchamp.md`; the reasoning behind each is `CLAUDE.md` §15. Numbering continues; nothing above is renumbered.

| Phase | Weeks | Ships | Status |
|---|---|---|---|
| **13 · Live data executor** | 2 | `queryLiveData` tool: JSON-Schema-validated arguments, driver-bound parameters, read-only transaction + statement timeout, row cap, a log row per call. Live Data screen: connection test, propose-then-approve query builder, call log | **Next** — the differentiator; ships before anything else below |
| **14 · Win the demo** | 3 | Onboarding wizard (URL → agent pre-filled from the crawl → connect → sandbox); teammate assignment + escalation notifications (Telegram / email); CSV contact import/export; rule-based lead score as a tag; per-conversation cost in the thread; escalation rate + first-response time on the dashboard; ban-risk disclosure on the WhatsApp connect screen | |
| **15 · The agent grows up** | 4 | Email adapter with threading; Google Calendar OAuth + availability so `bookMeeting` writes a real event (file Google verification when 13 starts); AI-composed follow-ups capped at two; voice notes / images / PDFs via the utility model; outbound webhooks (lead, escalation, booking); hand-written FAQs outrank crawled ones | |
| **16 · CRM basics** | 4 | `Deal` with stages + Kanban view; Razorpay payment link as an agent tool (quotes stay human); public REST API + MCP server over contacts, conversations, queries | Build only after the §11 "table stakes vs noise" decision |
| **Meta track** | Meta's clock, ~1 wk code | File Business Verification + App Review when 13 starts (if not already filed — nothing in the repo records it). On approval: official WhatsApp Cloud API, Instagram, Messenger adapters on the same `ChannelAdapter`; Meta Lead Ads webhook → contact + first WhatsApp message | Blocked on Meta |
| **17 · Billing, credits, referral, super admin** | 2 | Free month with sign-up credits; monthly / yearly plans (yearly = two months free); agent pauses when the period lapses; referral link → one free month per paying referral; Razorpay + manual "mark paid"; **platform super-admin** screen (all orgs, credits, trials, purchases, activate / deactivate, audit log). Model + enforcement point in `CLAUDE.md` §16 | **Decided 18 Sep 2026**; after 13 or 14 at the boss's call |

**≈ 13 weeks of code (13–16) to parity where it matters**; the Meta track runs alongside on Meta's calendar.

**Deliberately not this year:** voice/calling (integrate Exotel or Twilio when a client pays for it), a native mobile app (a PWA with push is the honest step), SMS in India (DLT templates, no sales value). White-label stays where the paragraph above puts it.

---

## 9. What is already proven

Not planned — run, on this machine, against the real seeded agent:

- **Bun + Prisma + Postgres** — `bun scripts/smoke.ts` passes; query engine runs under Bun, not just codegen
- **The model path** — `bun scripts/test-model.ts` against OpenRouter:
  - Answered a real product question from the seeded knowledge, in the agent's voice, asking a qualifying question back
  - **Fired `alertHuman` correctly** on a price request, with an accurate reason
  - **Prompt caching works** — 931 of 1552 input tokens cached (60%) on the second call, cost per reply $0.000497
- **The UI** — seven screens rendering live data, typecheck clean

The cost figure is the one to keep watching. At ~$0.0005 per reply, 10,000 replies/month is **about $5** — which is the whole argument for why the model was never the expensive part.

---

## 10. Risks, named

| Risk | Reality | What we do |
|---|---|---|
| **Meta App Review** | Weeks, rejection-prone, not a coding problem | File week 1, build everything else meanwhile |
| **WhatsApp QR bans** | Unofficial protocol; numbers do get banned | Warm-up caps, no cold outreach from new numbers, written disclosure |
| **AI says something wrong** | Reputational damage to our customer | Strict rules, retrieved answers outrank model knowledge, aggressive escalation |
| **Runaway spend** | A loop or an injection could burn a month's budget | Per-conversation and per-org-per-day hard caps |
| **Tenant data leakage** | Catastrophic and unrecoverable | Every query scoped through `lib/tenant.ts`; never reach for `prisma` with a hardcoded id |
| **Credentials** | We hold keys to customers' WhatsApp, mailboxes and databases | AES-256-GCM at rest, never logged, read-only DB roles only |
| **Knowledge goes stale** | Silent wrong answers after a site change | Refresh action, last-crawled shown, scheduled re-crawl later |

---

## 11. Open decisions

- [ ] Fork **Chatwoot** (MIT — freely rebrandable and resellable) for the inbox and channel adapters instead of building them? Removes much of phases 4, 7, 8 — but it is Rails, which nobody here runs.
- [ ] Hosting: existing VPS, or Vercel + managed Postgres? *(the BrandMyTissue VPS is at 99% disk)*
- [ ] **Pricing in INR.** Proposal in `research/10`: **₹1,499 / ₹3,999 / ₹7,999** a month for 1,000 / 5,000 / 20,000 AI replies, overage ₹0.50 → ₹0.30 per reply, BYOK unmetered, contacts never charged, a **free month** without a card (was 14 days; changed 18 Sep); export at $29 / $79 / $149 as a regional price.
- [ ] **The offer's numbers (decided in shape on 18 Sep 2026, `CLAUDE.md` §16 — figures still the boss's call):** how many replies the sign-up credit grant covers; the yearly discount (the page says two months free = 10 × monthly); the referral reward (one free month per paying referral — capped or not); whether a paused organisation keeps its channels connected (the plan says yes). **Until Phase 17 ships, the free month is enforced by hand** from the super-admin's seat — the homepage must describe the offer, not promise automation.
- [ ] **Public site policy (decided 18 Sep 2026):** no competitor names or comparisons on any public page; the homepage demo is a labelled example, not a customer transcript; no testimonials until real customers agree to be quoted. Still to decide: (a) the metered unit — a *visible reply* or a *model call*? A reply that fires a tool is two calls, and billing per call is exactly what made DM Champ's real cost 2× its headline (`research/07`); the proposal bills per visible reply and absorbs the tool calls. (b) The default platform model — at full allowance the Business tier is 22% cost on a cheap model and **110%** on Sonnet-class, so the `CLAUDE.md` §11 eval settles it and Sonnet-class is BYOK-only. (c) How official-WhatsApp carrier fees (Meta charges per message from 1 Oct 2026) appear — a pass-through line, never baked into the tier. (d) ₹88/USD is assumed throughout; re-check before publishing.
- [ ] **Which of AiEngage's CRM features are table stakes for our buyer, and which are noise?** Proposed split — table stakes: contacts with import/export and custom fields, assignment to a teammate, a simple stage pipeline, follow-up tasks, payment links (Phases 14 and 16). Noise for an agent-first product: built-in calling with recordings, a quote builder, a native mobile app, "100+ integrations", SMS. Test the split against the first five prospects' actual questions before Phase 16 is built — if nobody asks for the Kanban, it is not built.
- [ ] Are any target clients contractually blocked from routing conversations through Chinese model providers (Qwen, Kimi, DeepSeek, GLM, MiniMax)? Ask before standardising.
- [ ] **Rotate the OpenRouter development key** — it was shared in chat on 14 Sep 2026.
