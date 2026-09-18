# Omnichannel AI Sales Agent — build plan

A Next.js platform where a business connects its website, WhatsApp, Telegram and email, and an AI answers its customers' messages: qualifying leads, booking meetings, setting calendar reminders, and handing off to a human when it should.

## Status — 14 Sep 2026

Foundations are in and **verified running**, not just written:

- Bun 1.3.13 · Next.js 15.5 · Prisma 6.19 · PostgreSQL 17 (local) — `bun scripts/smoke.ts` passes
- `prisma/schema.prisma` — full multi-tenant schema, migration `init` applied
- `lib/env.ts`, `lib/db.ts`, `lib/crypto.ts` (AES-256-GCM), `lib/ai/client.ts`, `lib/ai/prompt.ts`
- `bunx tsc --noEmit` clean

**Next:** tool registry → agent loop → Telegram adapter → worker. Phase 1 in §10.

### Two decisions that overrode this plan

1. **Multi-tenant from the first migration** (§1 said single-tenant first). Every tenant-owned row carries `organizationId`. This was the right call to make early — it is the one thing that is genuinely expensive to retrofit.
2. **Tenants may bring their own model key (BYOK).** `Organization.modelApiKeyEnc` overrides the platform key, base URL and model choice. Their key, their bill — `UsageRecord.byok` records which.
3. **Live database access** (`DataSource` / `DataQuery`) is in scope — see §8b. This is the feature DM Champ does not have out of the box.

### Runtime: Bun, with one boundary

`bun install` and `bun worker/…` — Bun runs TypeScript natively, so there is no `tsx` in the chain. **Next.js still runs on Node** (`bun run dev` invokes the Next CLI, which is normal); do not use `bun --bun run dev`, which forces Bun's runtime for Next and is far less well-trodden for no gain.

Prisma was the thing to check, and it works: codegen, migrations and the query engine all run under Bun. Deployment is unaffected — `oven/bun` on a VPS, or Vercel (Bun install, Node functions). No Bun-specific APIs are used, so nothing is locked in.

Note: `prisma.config.ts` replaces the deprecated `package.json#prisma` block, and **disables Prisma's own `.env` loading** — hence the explicit `import "dotenv/config"` in it. Without that, migrations fail with "Environment variable not found: DATABASE_URL".

**Origin:** we spent three weeks evaluating [DM Champ](https://dmchamp.com) — a white-label AI sales agent — on a live account at `foundergrowth.ai`. That research lives in [`research/`](research/) (nine linked pages, `research/site/index.html`). This is the "build our own" branch of that decision. **Read `research/site/06-build-vs-buy.html` before committing to this plan** — the honest conclusion there is that reselling earns sooner and the distribution problem is identical either way.

---

## 1. What we are building, and what we are deliberately not

### In scope for v1

| Capability | Notes |
|---|---|
| Website chat widget | Embeddable script, our own |
| Telegram | Official Bot API |
| WhatsApp (QR) | Via WAHA — see the risk in §9 |
| Email | IMAP / Gmail / Outlook |
| AI agent | Persona, rules, conversation flow, per-business |
| Knowledge base | Crawl a customer's website → Q&A pairs → retrieval |
| Meeting booking | Availability, timezones, confirmation |
| Google Calendar | Create events and reminders on the business's calendar |
| Human handoff | AI pauses, a person takes over in the same thread |
| Shared inbox | All channels in one place |
| Contacts / leads | Basic CRM |

### Explicitly out of scope for v1

- **Instagram and Messenger** — blocked on Meta App Review (§9). Start the application on day one; build everything else while it queues.
- **Official WhatsApp Business API** — needs Meta Tech Provider status. Same queue.
- **Multi-tenant white-label reselling** — per-tenant branding, custom domains, credit ledgers, Stripe billing. This is 6–10 weeks on its own and is worthless until v1 proves itself. **Build single-tenant first.**
- **Voice, SMS, LINE, Viber, iMessage.**

### The one-line test for scope creep

> Does this help one real business answer its customers better this month?

If no, it goes in §10.

---

## 2. Architecture

Deliberately close to the stack already running on this machine (BrandMyTissue is Next.js + Prisma + Postgres), so there is one less thing to learn.

```
Next.js 15 (App Router, TypeScript)
├── app/(dashboard)      inbox, contacts, agent editor, knowledge base, settings
├── app/api/webhooks/    inbound: /telegram, /whatsapp, /email, /widget
├── app/api/agent/       internal: run agent, tool dispatch
├── lib/channels/        one adapter per channel, ONE interface (§4)
├── lib/agent/           prompt assembly, model client, tool registry (§5, §6)
├── lib/knowledge/       crawler, chunker, FAQ generator, retrieval (§7)
└── worker/              BullMQ consumers — the AI never runs in a request

Postgres 17 + Prisma          data, and pgvector for embeddings
Redis + BullMQ                inbound queue, follow-ups, scheduled sends
WAHA (Docker)                 WhatsApp QR bridge
MeshAPI                       LLM gateway (§6)
```

### Two architectural rules that matter more than they look

**1. The AI never runs inside an HTTP request.** A webhook's only job is to validate, persist the message, enqueue, and return 200 in under a second. Meta and Telegram retry on slow responses, and a retried webhook that re-runs the agent means the customer gets the same reply twice and we pay twice. All model calls happen in a worker.

**2. Every channel implements one interface.** Adding a channel must never touch agent code.

```ts
interface ChannelAdapter {
  id: 'widget' | 'telegram' | 'whatsapp' | 'email'
  parseInbound(raw: unknown): InboundMessage | null   // null = ignore (receipts, presence)
  send(to: string, msg: OutboundMessage): Promise<{ providerId: string }>
  verify?(req: Request): boolean                      // signature check
}
```

---

## 3. Data model (Prisma sketch)

```prisma
model Business    { id, name, timezone, createdAt
                    agents Agent[]  channels ChannelConnection[]  contacts Contact[] }

model ChannelConnection {
  id, businessId, kind, displayName
  status        // connecting | active | paused | failed
  credentials   Json   // ENCRYPTED AT REST — never log this
  agentId       String?   // which agent answers here
}

model Agent      { id, businessId, name, persona, goal, companyInfo,
                   rules, conversationFlow, alertHumanWhen, concludeWhen,
                   model, temperature, replyDelayMs, isActive }

model Contact    { id, businessId, name?, email?, phone?, locale?, tags String[] }

model Conversation {
  id, businessId, contactId, channelConnectionId
  state          // ai_active | human_active | closed
  lastMessageAt, assignedUserId?
}

model Message    { id, conversationId, direction, body, mediaUrl?,
                   providerId?    // @@unique — the idempotency key, see below
                   aiGenerated Boolean, toolCalls Json?, costUsd Decimal? }

model KnowledgeSource { id, businessId, url, pageCount, lastCrawledAt, status }
model Faq        { id, businessId, sourceId?, question, answer,
                   embedding Unsupported("vector(1536)")?, useCount Int @default(0) }

model ScheduledJob { id, businessId, conversationId?, kind, runAt, payload Json, status }
```

**`Message.providerId` is unique and is the whole deduplication strategy.** Every provider redelivers. Without this you will send duplicate replies to real customers, and it is the single most likely production bug in this system.

**Log every `costUsd`.** Per message, from day one. Without it you cannot answer "what does a conversation cost?" — the question the whole business model rests on, and the one DM Champ's own dashboard answers in a single number.

---

## 4. Channels — effort and what actually blocks each

| Channel | Method | Approval | Effort | Risk |
|---|---|---|---|---|
| **Website widget** | Our own `<script>`, WebSocket or SSE | none | 1–2 wks | none |
| **Telegram** | Bot API, `setWebhook` | none | ~1 day | none |
| **Email** | IMAP IDLE / Gmail API | none | ~1 wk | threading is fiddly |
| **WhatsApp (QR)** | [WAHA](https://waha.devlike.pro) — Apache 2.0, Docker | none | 1–2 wks | **ban risk, §9** |
| WhatsApp official | Meta Cloud API + Embedded Signup | **Tech Provider** | weeks of waiting | — |
| Instagram / Messenger | Meta Graph API | **App Review, Advanced Access** | weeks, rejections routine | — |

Start with Telegram. It is a day's work, needs nobody's permission, and proves the entire pipeline end to end — webhook → queue → agent → tool call → reply. Once Telegram works, every other channel is just a new adapter.

---

## 5. The agent

### Prompt assembly (order matters — the stable part must come first)

```
[1] System: persona, goal, company info, rules, flow, tools guidance, how-to-write   ← identical every call (first system message + tool list)
[2] Contact: name, tags, prior summary
[3] History: recent turns verbatim (a sent photo replayed as "[sent photo: url]"), older turns summarised   ← append-only
[4] Knowledge: top-k retrieved FAQs, with Link/Image lines — its OWN system message   ← varies per turn
[5] "Answer from the answers above" — one fixed per-turn instruction (prompt.ts ANSWER_FROM_KNOWLEDGE)
[6] The new message
```

**Section 1 is the cache prefix** (narrowed 18 Sep 2026 — it was "1 and 2"). Keep it byte-identical between calls in a conversation or prompt caching silently stops working and costs jump ~10×: never a timestamp, a random ID, or per-turn data in the first system message, and never re-order the tool list (new tools are appended last). **The knowledge block comes LATE, right before the new message** — measured on the first live tenant: with it up front and a history in which the agent had twice promised a colleague, gpt-4o-mini escalated "price I cannot confirm" on every replay while the price sat in the block; moved next to the question, with [5] after the history, the same model quoted the price. Late is also the cache-friendly place: the append-only history stays in the stable part and only the tail varies. Retrieval keeps a stable order (`lib/knowledge/retrieve.ts`) and remembers the conversation's FAQs (`Conversation.contextFaqIds`), so a product named ten turns ago is still in the block.

### Conversation realism — cheap to copy, and most of why DM Champ reads as human

- Reply delay 15–30s before "typing" starts
- Split a reply into 2–3 short bubbles, not one paragraph
- Batch rapid inbound messages into **one** reply — a customer sending four lines in ten seconds gets one answer, and we pay once

### Agent config is data, not code

Persona, rules and flow live in the `Agent` row and are editable in the dashboard. Never hardcode a prompt — the point is that a non-developer can tune the agent without a deploy.

---

## 6. The model layer — MeshAPI

[MeshAPI](https://meshapi.ai) is an OpenAI-compatible gateway to 1000+ models: one key, smart routing, automatic failover, response caching, and **payment in rupees by UPI** — which removes the foreign-card problem entirely. Change `base_url` and the key; any OpenAI SDK works.

**Be clear about what it is:** a model supplier. It provides none of §4, §7, §8 or the inbox. It is the brain, not the body.

### Two tiers, not one

```ts
MODEL_CHAT    // conversation + tool calling — quality matters here
MODEL_UTILITY // name/email extraction, intent + language classification — cheapest available
```

Route through env vars so a model swap is a config change, never a code change. Log the model id on every `Message` so cost and quality can be compared per model after the fact.

### Candidates as of Sep 2026

| Model | In / Out per 1M | Note |
|---|---|---|
| Qwen3.7 Flash | $0.03 / $0.13 | cheapest paid API found |
| DeepSeek V4 Flash | $0.12 / $0.35 | |
| Qwen3.5 Flash | $0.10 / $0.40 | 1M context |
| GLM-5.3 Flash | $0.15 / $0.50 | |
| **MiniMax M3** | **$0.30 / $1.20** | strong at agentic tool-calling, ~1M context |
| **Kimi K2.6** | **$0.60 / $2.50** | strong at multi-step tool use; cache-hit input $0.15 |
| GPT-5.6 Luna | $0.20 / $1.20 | |
| Claude Haiku 4.5 | $1.00 / $5.00 | 3–30× the above |

**Starting point: `MODEL_CHAT` = MiniMax M3 or Kimi K2.6; `MODEL_UTILITY` = Qwen3.7 Flash.** Then measure — see §11. Do not settle this by argument; settle it by running the same 20 real conversations through four models.

### Things to confirm with MeshAPI before building on them

1. **Prompt caching passes through, per model.** The §5 prefix is identical every call, so ~90% of input tokens should be cache reads at ~10% price. **This saves more than any model choice.**
2. Tool/function calling is passed through faithfully (gateways sometimes degrade it).
3. Structured output / JSON mode.
4. **Data retention and logging.** Our clients' customer conversations flow through them — we need this in writing, and clients in the GCC will ask.
5. Rate limits per model; what failover does mid-conversation.
6. Pass-through pricing vs markup.

---

## 7. Knowledge base

Mirror what DM Champ does, because it is the right design and we watched it work:

1. Crawl the business's site (sitemap first, fall back to same-origin BFS, cap depth and page count)
2. Extract main content, strip nav/footer/cookie banners
3. Chunk, then ask the utility model to generate Q&A pairs per chunk
4. Embed each question, store in pgvector
5. At reply time, embed the incoming message, retrieve top-k, put them in prompt section 2
6. Increment `Faq.useCount` — it shows which answers earn their place

**The knowledge base is a snapshot, not a live link.** The AI never fetches the site at reply time. A `Refresh` action re-crawls. Say this to every client, because they will assume otherwise — for reference, the live Al Taher account turned **59 pages into 129 FAQs**.

Hand-written FAQs must outrank generated ones: pricing rules, lead times, "we don't ship there" — the things that were never on the website.

---

## 8. Tools the agent can call

This is where the product stops being a chatbot. Each is a function the model may invoke mid-conversation.

```ts
bookMeeting({ contactId, startsAt, durationMins, notes })
  → check availability, create the Calendar event, return confirmation

setReminder({ contactId, runAt, note })
  → ScheduledJob + a Google Calendar reminder

alertHuman({ conversationId, reason, urgency })
  → conversation.state = 'human_active', notify, AI STOPS

captureContact({ name?, email?, phone? })
  → upsert onto Contact

tagContact({ tags })
scheduleFollowUp({ delayHours, message? })
lookupBusinessData({ query })      // ← calls the client's own API. The differentiator.
```

**`alertHuman` is the most important one.** It is what makes the product safe to sell: the AI knows when to stop. Get the trigger wording right in the agent's `alertHumanWhen` field, and make handover instant and obvious in the inbox.

**Every tool call is a model call.** Budget accordingly — one customer-visible reply that extracts a name and books a meeting is 3–4 billed calls, not one. This is exactly why DM Champ's real cost ran ~2× its headline rate (`research/site/04-our-account.html`).

### Google Calendar

OAuth into the **business's** Google account, refresh tokens encrypted at rest. Requesting `calendar.events` is a sensitive scope, so **Google app verification is required before going live** — a real review process, milder than Meta's but not instant. **Start it in week 1.**

---

## 9. The walls — read before promising anyone a date

### Meta App Review (Instagram, Messenger, official WhatsApp)

Not a coding problem. Advanced Access to `instagram_manage_messages` is granted only through App Review on a verified Business portfolio, and Meta staff test the app by hand. Weeks; rejections are routine; a missing or slow webhook callback is a standard rejection. **File on day one and build everything else while it queues.**

### WhatsApp QR pairing is unofficial

WAHA, Baileys and whatsapp-web.js replicate the WhatsApp Web protocol. It works and needs no approval — but it is **against WhatsApp's terms and numbers get banned.** That is exactly why DM Champ warms a new number over 60 days with a rising daily cap; they are managing ban risk on the customer's behalf.

If we ship this we own that risk for every client, and a banned number kills a client's business line. Mitigations: warm-up caps, no cold outreach from fresh numbers, per-number rate limits, and **written disclosure to the client**. Do not sell it with an SLA.

### Google verification

See §8. Weeks, not days.

---

## 10. Build order

Each phase ends with something demonstrable. Estimates assume one developer with Opus 5 assistance.

| Phase | Weeks | Ships |
|---|---|---|
| **0 · Foundations** | 1 | Next.js + Prisma + Redis + queue. Health check. **File Meta App Review and Google verification.** |
| **1 · Telegram end to end** | 1–2 | Inbound → queue → agent (MeshAPI) → reply. One hardcoded agent. Proves the pipeline. |
| **2 · Knowledge base** | 2 | Crawler → FAQs → pgvector retrieval. Answers from a real site. |
| **3 · Inbox + agent editor** | 2–3 | Conversations UI, human takeover, editable agent config. |
| **4 · Tools** | 2 | `alertHuman`, `captureContact`, `bookMeeting`, Google Calendar, follow-ups. |
| **5 · Website widget** | 1–2 | Embeddable script + the public chat endpoint. |
| **6 · WhatsApp via WAHA** | 1–2 | QR pairing, warm-up caps, ban-risk disclosure. |
| **7 · Email** | 1 | IMAP/Gmail, threading. |
| **8 · Harden** | 2 | Dedup, retries, rate limits, cost dashboard, error log. |

**≈ 13–17 weeks to a single-tenant product** that does everything in §1. Multi-tenant white-label is a separate 6–10 weeks after that, and only worth starting once paying customers exist.

Meta-dependent channels land whenever Meta says so, independent of all of the above.

---

## 11. Decide the model with data, not opinion

Before phase 4, build `scripts/eval-models.ts`:

1. Take **20 real conversations** — export them from the DM Champ account, which is exactly what it is useful for
2. Replay each through 4–5 candidate models via MeshAPI
3. Score: **tool-call correctness** (did it call `alertHuman` when it should?), answer accuracy against the knowledge base, tone, latency, cost per conversation
4. Put the table in this file

Run it again whenever prices move — which, on current evidence, is every few weeks.

**Do not pick a model by reading a benchmark.** SWE-bench and coding leaderboards say nothing about whether a model reliably fires `alertHuman` when a customer asks for a human.

---

## 12. Non-negotiables

- **Encrypt `ChannelConnection.credentials` at rest. Never log it.** These are keys to customers' WhatsApp and email.
- **Dedup is per CONVERSATION, never global** — `@@unique([conversationId, providerId])`.
  A global unique on `providerId` shipped once and caused silent cross-tenant data loss: in a
  Telegram private chat `chat.id` IS the user's own id (identical for every bot they message) and
  `message_id` restarts low per chat, so one person messaging two tenants' bots produced the same
  `tg:<chatId>:<messageId>`. The second insert hit P2002, `persistInbound` reported "deduped", the
  webhook answered 200 — and that tenant's customer message was never stored, queued or answered,
  with no retry, because 200 means "we have it". Never re-narrow this key.
  Regression test: `bun scripts/verify-isolation.ts`.
- **Resolve the organization through `Membership`, never from the session claim alone.**
  `currentOrg()` looking the org up directly meant a deleted membership left that user's session
  fully working for the remaining 30 days — sessions are stateless, so this join IS the
  revocation. `/api/auth/stale` must apply the SAME test, or a revoked member ping-pongs between
  the two forever instead of being logged out.
- **Cap AI spend per conversation and per business per day**, with a hard stop. A prompt-injected loop should cost pennies, not a month's budget.
- **Retention policy from day one.** Conversations contain third parties' personal data; we are a processor, not the controller.
- **Never let a customer wait on a model call.** Webhook returns 200 immediately, always.
- **A human can always take over,** on every channel, at any point.

---

## 13. Running locally (once phase 0 lands)

```bash
bun install
docker compose up -d          # redis, waha (Postgres runs natively on this machine)
bunx prisma migrate dev
bun scripts/smoke.ts          # verifies env, crypto, Prisma-under-Bun, Postgres
bun run dev                   # http://localhost:3000
bun run worker                # separate process — the AI runs here
```

First-time database setup:

```bash
createdb -U postgres aiagent
```

Copy `.env.example` to `.env` and generate the encryption key:

```bash
bun -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

`.env` — `DATABASE_URL`, `REDIS_URL`, `MESHAPI_KEY`, `MESHAPI_BASE_URL`, `MODEL_CHAT`, `MODEL_UTILITY`, `TELEGRAM_BOT_TOKEN`, `WAHA_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`.

Use a tunnel (`cloudflared`, `ngrok`) for webhooks in development — Telegram and WAHA both need a public HTTPS URL.

---

## 14. Open decisions

- [ ] Fork [Chatwoot](https://github.com/chatwoot/chatwoot) (MIT — freely rebrandable and resellable) instead of building the inbox and channel adapters? It removes phases 3, 5, 7 and most of 6 — but it is Ruby on Rails, which nobody here runs. See `research/09-open-source-options.md`.
- [ ] Single-tenant per deployment, or multi-tenant from the start? Plan says single. Revisit only with paying customers.
- [ ] Self-host on the existing VPS, or Vercel + managed Postgres? **Note: the BrandMyTissue VPS is at 99% disk.**
- [ ] Is any client contractually blocked from having conversations routed through Chinese model providers? Ask before standardising on Qwen/Kimi/DeepSeek/GLM/MiniMax.

---

## 15. Competitive position and roadmap (17 Sep 2026)

Context: sales reps from [AiEngage](https://aiengagecrm.com) pitched their AI sales agent in the office around 14 Sep. The brief that followed was "a complete package, better than our competitors", with a homepage of AiEngage's depth. The three-way comparison — capability table, where each competitor is genuinely stronger, the pricing floor maths — is [`research/10-competitors-aiengage-vs-dmchamp.md`](research/10-competitors-aiengage-vs-dmchamp.md). This section holds the decisions, not the table. The rule for both: **nothing planned is described as present.** Where this file and the code disagree, the code wins.

### Position

Between the two. DM Champ is an agent with no CRM, sold to agencies. AiEngage is a CRM — pipeline, quotes, Razorpay, calling, mobile app — with an AI WhatsApp agent as one of nine features, sold to Indian SMBs at ₹1,799–9,999 a month. We are agent-first like DM Champ; we add the CRM basics an SMB actually uses every day (contacts, assignment, a simple pipeline, follow-ups); and we do three things neither does: the agent queries the customer's **own** database or API through named read-only queries; **any AI provider on the customer's key**, with the real per-message cost and cache hit rate on screen; and **risk handled in the open** — warm-up caps, escalation as a tool the inbox enforces, spend caps, "the AI knows when to stop". INR for India, USD for export.

Why this and not "build everything AiEngage has": one developer and no customers. Nine features built badly lose to their nine features with a support team behind them. The three things above are the only ground where a one-developer product wins a room, because they are the three things the competitors cannot copy cheaply — AiEngage's API points inward, DM Champ's margin *is* the opacity, and neither can produce an escalation transcript on demand. So we do not pitch against AiEngage as a CRM. We pitch as the agent that answers from their stock list, and connect to whatever CRM they already have — theirs included.

### The differentiators as engineering commitments

A differentiator is true when the named code exists, not when the deck says so. Two of the three are true today.

**1. Live data — `queryLiveData`. NOT built; schema only.** `DataSource` (encrypted config for a read-only role) and `DataQuery` (`name`, `description`, JSON-Schema `parameters`, `$1`-placeholder `statement`, `maxRows`, `timeoutMs`) exist in `prisma/schema.prisma`. What makes the claim true, in order:
- One tool in `lib/ai/tools.ts`, offered only when the org has active queries — an agent with nothing to look up must not see it (same rule as `bookMeeting` for an org with no calendar).
- Arguments validated against the stored JSON Schema *before* anything reaches a driver. Failures go back to the model as a tool error, never as an exception.
- Parameters **bound**, never interpolated: `pg` / `mysql2` placeholders for SQL, a path template for REST. The model never sees the statement, only the name and description.
- Postgres runs inside `SET TRANSACTION READ ONLY` with `statement_timeout = timeoutMs`, regardless of what the role allows — the read-only role is the customer's promise, this is ours.
- Result truncated at `maxRows`, and the model is told it was truncated.
- Every call logged (`DataQueryCall`: query, args, row count, ms, error) so "what did the AI look up?" is answerable from the inbox thread. This is the same reasoning as `UsageRecord`.
- Live Data screen: connection test, propose-a-query-from-a-description with mandatory human approval, and the call log.
Two weeks. Nothing else in Phase 13 ships before it, because without it "better than both" is a sentence.

**2. Cost transparency — true today.** `UsageRecord` per model call (prompt / cached / output tokens, USD, model, `byok`); `app/settings` shows spend and cache hit rate. Commitments: per-conversation cost in the chat thread header; a monthly export. Never round it into a "credit". The moment cost becomes a credit we are DM Champ, whose real rate ran 2× its headline because every tool call billed separately (`research/07`). We bill the customer per **visible reply** and absorb the tool calls.

**3. Any provider, your key — true today.** `Organization.modelApiKeyEnc` + base URL + model override; any OpenAI-compatible endpoint; `byok` on every usage row. Commitments: per-agent model override (a cheap model for the FAQ agent, a stronger one for sales), and no model becomes the platform default until it passes the §11 eval — the first item on which is "does it call `alertHuman` when it should?"

**4. The AI knows when to stop — true, with one gap.** `alertHuman` sets `HUMAN_ACTIVE` and `runAgentTurn` refuses to run against it; the imperative "calling a function is how anything actually happens" line is in the prompt and verified; `MAX_COST_USD_PER_CONVERSATION` and `dailyCostCapUsd` are enforced in `lib/ai/agent.ts`; WhatsApp sends are blocked at the derived warm-up cap in `lib/channels/whatsapp.ts`. The gap: the ban-risk disclosure at connect time is a paragraph not yet in the UI, and an escalation notifies nobody outside the inbox. Commitments: disclosure copy on the WhatsApp connect screen with an explicit acknowledgement; escalation notification to the assigned teammate (Telegram or email) in Phase 14.

**On the food-contact transcript.** The line quoted in `PRODUCT-PLAN.md` §7 and seeded in `prisma/seed.ts` is real and it is **DM Champ's agent** ("Tia | ATC") speaking on the boss's `foundergrowth.ai` account. Our own verified result is narrower: on 14 Sep our model answered from seeded knowledge in the agent's voice and fired `alertHuman` correctly on a price request. Do not put the DM Champ line on our homepage as ours. Re-run the enquiry through our agent — the seeded agent carries the same rule — and use what it actually says.

### The honest gap list vs AiEngage, sequenced

What they have that we do not, in the order we close it. Weeks are one developer with AI assistance; Meta's and Google's clocks are theirs. Phase numbers continue `PRODUCT-PLAN.md` §8.

**Phase 13 — live data executor (2 weeks).** Above. Ships first.

**Phase 14 — win the demo (3 weeks).** Onboarding wizard: sign-up → URL → agent pre-filled from the crawl → connect → sandbox (1.5; the screens exist, the flow does not — today a new user assembles it by hand from Knowledge, Agents and Channels). Teammate assignment + escalation notifications (0.5). CSV contact import/export; a lead-score tag the agent sets from rules (0.5). Per-conversation cost in the thread; escalation rate and first-response time on the dashboard; ban-risk disclosure on the connect screen (0.5). After 14 we can walk into an office and demo on the prospect's own data.

**Meta track — Meta's clock, ~1 week of code.** File Business Verification and App Review the week Phase 13 starts, if not already filed — nothing in this repo records that it was. On approval: official WhatsApp Cloud API adapter (carrier fees passed through), Instagram and Messenger on the same `ChannelAdapter` interface, and a **Meta Lead Ads webhook → contact + first WhatsApp message**. That last one is AiEngage's headline "automation journey", and it is a webhook. Until approval, QR is the WhatsApp story and it is sold with the disclosure.

**Phase 15 — the agent grows up (4 weeks).** Email adapter with threading (1). Google Calendar OAuth + availability so `bookMeeting` writes an event instead of a `REMINDER` row — file Google verification at Phase 13 start (1.5). AI-composed follow-ups on their own prompt path, capped at two (0.5). Voice notes, images and PDFs via the utility model (0.5). Outbound webhooks — new lead, escalation, booking (0.5). Hand-written FAQs outranking crawled ones in `lib/knowledge/retrieve.ts`.

**Phase 16 — the CRM basics (4 weeks).** A `Deal` with stages and a Kanban view (1.5) — small, and only now, because before 13–15 it is a worse pipeline than AiEngage's with nothing to set it apart. Razorpay payment link as an agent tool, quotes stay human (1). Public REST API and an MCP server over contacts, conversations and queries (1.5).

**Not this year, and say so:** voice/calling (integrate Exotel or Twilio when a client pays for it); a native mobile app (a PWA with push is the honest step); SMS in India (DLT-registered templates, no sales value); white-label reselling (6–10 weeks, only after paying customers).

**Total: 13 + 14 + 15 + 16 ≈ 13 weeks of code** to parity where it matters. The Meta track runs alongside on Meta's calendar. Test the Phase 16 list against the first five prospects' actual questions before building it — see `PRODUCT-PLAN.md` §11.

### Pricing direction

INR first. Meter AI replies — they cost us money — not contacts or seats, which do not. Undercut AiEngage's Solo and Business on the agent while stating we lack their pipeline, payments, calling and app: **₹1,499 / ₹3,999 / ₹7,999** a month for 1,000 / 5,000 / 20,000 visible replies, overage ₹0.50 → ₹0.30, BYOK unmetered on every tier, a **free month** without a card (was 14 days; changed 18 Sep — §16). Export at **$29 / $79 / $149** — a regional price, not a conversion.

The floor: $0.000497 per model call measured with 60% cache; ~2 calls per visible reply → **~$0.001 per reply** on the cheap-model default, **~$0.005** Sonnet-class. At ₹88/USD the Business tier at full allowance is 22% cost on the cheap model and **110%** on Sonnet-class — so the platform default model is cheap-to-mid (the §11 eval decides), and Sonnet-class is BYOK. Official WhatsApp carrier fees pass through at cost from 1 Oct 2026. Full tables in `research/10`; the open decisions are in `PRODUCT-PLAN.md` §11.

## 16. Go-to-market, the offer, and the super admin (decided 18 Sep 2026)

The boss's decisions after reviewing the first homepage. They are the plan; **none of the billing machinery is built** — where a sentence below describes behaviour, it describes what Phase 17 builds, and the marketing copy must not claim it is automatic until it is.

### What the public site says — and does not

- **Promote us, never them.** No competitor names and no comparison table on the homepage or any public page. The three-way analysis stays in `research/10` as an internal sales aid. The `Compare` section, its CSS and every `#compare` link were removed on 18 Sep.
- **The demo is an illustration, and says so.** The homepage conversation is a written example — a fictional furniture studio, a fictional customer — that shows the agent's *real* behaviours: an answer from the knowledge base, `captureContact`, `bookMeeting`, `scheduleFollowUp`, and an `alertHuman` handover. The caption calls it an example. It replaced the Al Taher replay, which was a real transcript but read as a testimonial for a business that is not our customer and named a competitor's client on our homepage. The replay lives on in `scripts/replay-demo.ts` as an eval, which is where a real transcript belongs.
- **No fabricated testimonials or reviews.** An invented customer quote presented as real is deceptive advertising; we do not publish one under any label. A testimonials block goes up when the first paying customers agree to be quoted, with their names.
- **Tone:** commercial, direct, benefit-first. Channel states stay honest (live / built / on the roadmap) — that is accuracy, not the self-deprecating lede the first version had.

### The offer

- **A free month.** Every sign-up gets 30 days with AI credits included, no card. Supersedes the 14-day trial in §15.
- **Credits at sign-up.** Every new organisation receives a credit allowance funded by the platform key (the OpenRouter development key today, the purchased MeshAPI key later). A credit is **one visible reply** — never a fraction of a model call (§15 #2 still holds; the customer still sees the dollar cost of every reply).
- **Monthly renewal.** Plans renew monthly. When the trial or the paid period ends without renewal, the agent **pauses**: channels stay connected, data stays, nothing is deleted; it resumes on renewal.
- **Yearly discount.** Pay yearly, get two months free (yearly = 10 × monthly). Placeholder until the boss sets the number.
- **Referral / affiliate.** Every customer has a referral link (`/signup?ref=<code>`). When a business that signed up through it buys any paid plan, the referrer gets **one month free**. Attribution is stored on the referred organisation at sign-up; the reward is granted on that organisation's first payment, once.
- **Tiers** as §15: ₹1,499 / ₹3,999 / ₹7,999 for 1,000 / 5,000 / 20,000 replies; export $29 / $79 / $149. The homepage shows these from 18 Sep (it showed 1,999 / 5,999 / 14,999 before — a drift, now fixed).

### The super admin

The boss's account. A **platform-level** role, distinct from the per-organisation `OWNER` / `ADMIN` / `MEMBER` in `Membership.role`. It sees every organisation — sign-up date, owner, plan, trial end, credit balance, usage from `UsageRecord`, purchases — and can grant or deduct credits, extend a trial, record a manual payment, and activate or deactivate an organisation.

Implementation sketch, so the first version does not invent its own auth:

- `User.isPlatformAdmin Boolean @default(false)`, set only by seed or SQL — **no route may set it**.
- An `app/(admin)/` route group with its own layout that returns 404 (not 403 — do not confirm the URL exists) unless the session user is a platform admin. `lib/tenant.ts` stays untouched; the admin group reads `prisma` directly, because this is the one legitimate cross-tenant reader in the codebase, and every mutation writes an `AdminAction` audit row (who, what, which org, before/after).
- `Organization.isActive` already gates `currentOrg()`; deactivation is that flag. Until the screen exists, the boss does it with one SQL statement, documented in `scripts/` when first needed.

### Data model for Phase 17

`Plan` (code, name, priceInrMonthly, priceInrYearly, priceUsdMonthly, includedReplies, seats, agents) · `Subscription` (organizationId unique, planId, status `TRIALING | ACTIVE | PAST_DUE | PAUSED | CANCELLED`, interval `MONTHLY | YEARLY`, trialEndsAt, currentPeriodEnd) · `CreditLedger` (organizationId, delta, balanceAfter, reason `SIGNUP_GRANT | PLAN_RENEWAL | ADMIN_GRANT | REFERRAL_REWARD | USAGE`, ref, byUserId) · `Purchase` (organizationId, amountInr, provider `RAZORPAY | MANUAL`, providerRef, status, paidAt) · `Organization.referralCode` unique + `Organization.referredByOrgId` · `ReferralReward` (referrerOrgId, referredOrgId, grantedAt — one per referred org).

**One enforcement point:** `lib/ai/agent.ts`, before the model call — subscription `TRIALING` or `ACTIVE` and credit balance > 0; otherwise no reply, a `PAUSED_BILLING` system note on the conversation, and one notification to the owner. Not in the channel adapters, not in the worker — the same rule as the spend caps, for the same reason.

### Phase 17 — Billing, credits, referral, super admin (2 weeks)

Sequenced after Phase 13 or 14 at the boss's call; nothing here matters before the first customer who is not a friend. Razorpay checkout for INR; "mark paid" for everything else; the super-admin screen first, because it is what makes a manual trial period workable on day one.
