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
[1] System: persona, goal, company info, rules, conversation flow   ← identical every call
[2] Knowledge: top-k retrieved FAQs for this message                ← varies
[3] Contact: name, tags, prior summary
[4] History: recent turns verbatim, older turns summarised
[5] The new message
```

**Sections 1 and 2 are the cache prefix.** Keep them byte-identical between calls in a conversation or prompt caching silently stops working and costs jump ~10×. Never put a timestamp, a random ID, or a re-ordered FAQ list in the prefix.

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
