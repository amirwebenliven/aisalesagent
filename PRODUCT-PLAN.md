# Product plan — complete working product

What a customer signs up for, what they connect, and what the AI does with it.

`CLAUDE.md` is the engineering reference — architecture, schema, conventions, gotchas. **This document is the product**: the user journey, the screens, the phases, and what is already proven to work.

---

## 1. The product in one paragraph

A business signs up, connects the places its customers already message it — WhatsApp, Telegram, Instagram, its website — and points us at what it knows: its website, and optionally its live database or API. From then on an AI answers every incoming message: it qualifies the lead, answers product questions from the business's own material, handles objections, looks up live data when the answer changes (stock, orders, availability), books a meeting when the lead is ready, and pulls in a human the moment it should stop guessing. The business watches it all in one inbox and can take over any conversation with one click.

**The job to be done:** a lead messages at 11pm and gets a real answer in thirty seconds instead of a reply on Monday.

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

The single thing that makes this safe to sell is that the AI **knows when to stop**. From the real transcript we captured:

> *"The cookware side is a little different, since it's food-contact and I don't want to point you to the wrong chemistry there."*

It recognised a question it should not answer, said so, and kept the lead. That is worth more than any amount of sales polish.

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
| **3 · Agent loop** | 1–2 | Queue + worker, tool registry, `alertHuman` / `captureContact`, Try-out tab live | Next |
| **4 · Telegram** | 1 | First real channel end to end — no approval needed | |
| **5 · Auth + onboarding** | 2 | Signup, sessions, the six-step wizard | |
| **6 · Knowledge crawler** | 2 | Crawl → FAQs → pgvector retrieval, Refresh | |
| **7 · Website widget** | 1–2 | Embeddable script + public chat endpoint | |
| **8 · WhatsApp QR** | 1–2 | WAHA, pairing, warm-up caps, risk disclosure | |
| **9 · Live data** | 2 | Read-only connectors, named queries, guided SQL | |
| **10 · Meetings** | 1–2 | Availability, Google Calendar, `bookMeeting` | |
| **11 · Follow-ups** | 1 | Scheduled jobs, caps | |
| **12 · Harden** | 2 | Dedup, retries, rate limits, spend caps, error log | |

**≈ 16–20 weeks to the complete product described above**, single-tenant-per-org but multi-org from day one.

**Meta channels (Instagram, Messenger, official WhatsApp) land whenever Meta approves** — file the App Review in week 1, because it is calendar time nobody can compress.

**Deliberately after launch:** white-label reselling (per-tenant branding, custom domains, credit ledgers, Stripe) — another 6–10 weeks, and worthless until paying customers exist.

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
- [ ] Pricing model for our own customers — flat monthly, per-conversation, or credits like DM Champ?
- [ ] Are any target clients contractually blocked from routing conversations through Chinese model providers (Qwen, Kimi, DeepSeek, GLM, MiniMax)? Ask before standardising.
- [ ] **Rotate the OpenRouter development key** — it was shared in chat on 14 Sep 2026.
