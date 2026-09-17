# 10 — AiEngage vs DM Champ vs us

**Date:** 17 September 2026.
**Trigger:** sales reps from AiEngage (aiengagecrm.com) visited the office around 14 September to sell their AI sales agent. The brief that followed: a complete package, better than both them and DM Champ, with a homepage of AiEngage's depth.

**Sources.** DM Champ: `01`–`08` in this folder, including the logged-in teardown of the live `foundergrowth.ai` account. AiEngage: their public site and pricing page as read this week — every figure of theirs ("2000+ businesses", "30% more conversions", "52 min/day saved") is their claim, unverified. Us: the running app on this machine, checked file by file today, not the plan. Where the plan and the code disagree, the code wins.

---

## The three products in one line each

- **DM Champ** — an AI sales agent that lives in DMs, sold to agencies who rebrand it. Agent-first, CRM-thin. $97 / $297 / $497 a month plus $0.10 credits that run ~2× the headline rate in practice. Three people, ~$330K ARR.
- **AiEngage** — a full CRM (pipeline, quotes, payments, calling, email, mobile app) with an AI WhatsApp agent as one of nine features. CRM-first, agent-thin. ₹1,799 / ₹5,999 / ₹9,999 a month per workspace, seat- and contact-capped. Indian, sells to Indian SMBs, claims 2,000+ customers.
- **Us** — an AI agent that answers on Telegram (live), WhatsApp QR (built) and a web widget, from a crawled knowledge base, with five named tools, human takeover, per-message cost on screen, and any OpenAI-compatible model on the customer's own key. No pipeline, no payments, no voice, no mobile app, no public API. One developer, no customers yet.

---

## Capability table

Legend — **Yes**: in the product today. **Partial**: present but narrower than the label; the note says how. **Schema**: the tables exist, no executor and no UI. **No**: absent. **Not advertised**: we could not find it on their site; do not assume either way. Planned items name the phase in `CLAUDE.md` §15 / `PRODUCT-PLAN.md` §8.

| Capability | DM Champ | AiEngage | Us — today | Us — planned |
|---|---|---|---|---|
| **Channels** | | | | |
| WhatsApp — official Cloud API | Yes | **Yes** — the core channel | No | Meta track — after Business Verification / Tech Provider |
| WhatsApp — QR (unofficial) | Yes; 50 credits/mo; 60-day warm-up | No | **Built** via WAHA. Daily cap derived from `warmupStartedAt` on every send, send blocked and logged at the cap. Awaiting first real pairing | — |
| Instagram DMs | Yes (fragile; "Unknown Unknown" contacts) | No | No | Meta track — App Review, weeks, rejections routine |
| Facebook Messenger | Yes | No | No | Meta track |
| Telegram | Yes | No | **Yes — live**, answering real customers | — |
| SMS | Yes (your own Twilio) | Yes | No | Not planned — Indian SMS is DLT-registered templates, no value for a sales conversation |
| Email | Yes (IMAP / Gmail / Outlook) | Yes, with AI drafting | No | Phase 15, ~1 week; threading is the fiddly part |
| Web chat widget | Yes | Web forms → lead; an AI chat widget is not advertised | **Yes** — public endpoint `app/api/widget/[secret]` | Embed snippet polish, Phase 14 |
| Voice / calls | No | **Yes** — business calling with recording + transcription | No | Not this year; integrate Exotel/Twilio when a client pays for it |
| LINE, Viber, iMessage | Yes / Yes / "soon" | No | No | Not planned |
| **The agent** | | | | |
| Agent configuration | Named sections: persona, goal, company, rules, flow, alert-human-when, conclude-when | One "AI agent" that qualifies, answers, collects details, hands to a human; no published instruction structure | **Yes** — the same seven named sections on `Agent`, edited as prose in the dashboard. One imperative line makes "I'll pass this on" an actual `alertHuman` call (verified 14 Sep) | "Optimise from real chats" rewrite (DM Champ has it) — later |
| Knowledge base | Crawl URL → FAQs at 1 credit/page; hand-written FAQs; resources; extra context | Not described; the agent "answers questions" — source unknown | **Yes** — crawl → Q&A pairs → Postgres full-text retrieval (`to_tsvector`; pgvector deliberately not used), Refresh, `useCount` per FAQ | Hand-written FAQs outranking crawled ones — Phase 15 |
| Media understanding (voice notes, images, PDFs) | Yes, free | Not advertised | No — text only | Phase 15, via the utility model |
| Realism (reply delay, bubble splitting, typing) | Yes — the reason leads don't notice the bot | Not advertised | **Yes** — `replyDelayMinMs/MaxMs` on the agent, `splitReply` + `sendBubbles` with a 1.2 s gap, typing indicator on Telegram and the widget. No character-paced typing speed | — |
| **Live data access** (the customer's own DB / API) | Custom Functions — the customer must build and host an HTTP endpoint | REST API + MCP on Business Pro point **into their CRM**, not out to your ERP | **Schema only** — `DataSource` (encrypted config, read-only role) and `DataQuery` (`name`, `description`, JSON-Schema `parameters`, `$1`-placeholder `statement`, `maxRows`, `timeoutMs`). No executor, no UI | **Phase 13, 2 weeks — the differentiator** |
| Tools / actions | alertHuman, contact fields, tasks, Custom Functions, MCP client | Lead scoring, round-robin assignment, notify team, human books | **Yes** — `alertHuman`, `captureContact`, `tagContact`, `scheduleFollowUp`, `bookMeeting`; Zod-validated, tenant-scoped, sandbox `dryRun` | `queryLiveData` (13), payment link (16) |
| Meeting booking | Yes — calendar-synced, shareable booking pages | Yes, but by a human: "step 8 is your team's first touch" | **Partial** — `bookMeeting` records the slot as a `REMINDER` job plus a contact note. **No calendar write, no availability check** | Google Calendar OAuth + availability — Phase 15; Google app verification is weeks |
| Follow-ups | Yes — sequences, each send billed | Yes — "5× faster follow-ups", sequences, tasks | **Yes** for model-written text — `scheduleFollowUp` → `ScheduledJob`; the worker sends it, re-checking human takeover and opt-out at send time. A follow-up with no text waits for a human | AI-composed follow-ups on their own prompt path, capped at two — Phase 15 |
| Inbox + human handover | Unified inbox; pause on alert; assignment | Shared inbox; assignment; round-robin | **Yes** — one inbox across channels; `alertHuman` sets `HUMAN_ACTIVE` and `runAgentTurn` refuses to run against it; hand back to AI from the thread | Assignment to a named teammate + notification — Phase 14 |
| Contacts / CRM | Custom fields, lists, import/export, tags, bot exclusion | Full CRM; 5k / 20k / 50k contacts by plan; custom fields; import; activity timeline | **Partial** — contacts, tags, notes, `botExcluded`. No custom fields, no import/export | CSV import/export + custom fields — Phase 14 |
| AI lead scoring | Partial — buying-signal detection | **Yes**, a headline feature | No — tags are the only signal | Score as a tag the agent sets from rules — Phase 14, cheap |
| Pipeline / Kanban | Yes, basic | **Yes** — the core of the product | **No** | `Deal` with stages + Kanban — Phase 16 |
| Quotes and payments | No | **Yes** — quotes, Stripe, Razorpay | **No** | Razorpay payment link as an agent tool; quotes stay human — Phase 16 |
| Mobile app | No (responsive web) | **Yes**, iOS + Android | **No** — responsive web | Not this year; PWA with push is the honest step |
| Ads / lead-form sync | Meta lead forms via integration | **Yes** — Meta + Google Ads → auto WhatsApp welcome | **No** | Meta Lead Ads webhook — Meta track, same App Review |
| Analytics | Replies, conversions, credits per chat, daily summaries | Results dashboards, team performance | **Partial** — volume, AI-vs-human split, spend, cache hit rate | Escalation rate, first-response time, per-channel conversion — Phase 14 |
| **Cost transparency** | Credits per action in a ledger; the real rate is ~2× the headline | Per-seat subscription; AI cost invisible | **Yes — nobody else has this.** Every model call is a `UsageRecord` (prompt / cached / output tokens, USD, model, `byok`). Settings shows spend and cache hit rate | Per-conversation cost in the thread — Phase 14 |
| **BYOK** | Anthropic only, Agency tier only; the live account had no key field at all | Not advertised | **Yes — any OpenAI-compatible provider** (`modelApiKeyEnc`, base URL, model), flagged on every usage row | Per-agent model choice |
| Spend safety | Credits run out → the bot goes silent | Not advertised | **Yes** — `MAX_COST_USD_PER_CONVERSATION` (default $0.50) and `dailyCostCapUsd` per org (hard ceiling $25), enforced in `lib/ai/agent.ts` | — |
| Multi-tenancy | Yes (sub-accounts) | Yes (workspaces) | **Yes** — `organizationId` on every row, resolved through `Membership`; isolation attacked adversarially, two real bugs fixed, `scripts/verify-isolation.ts` | — |
| White-label / reselling | **Yes, complete** — domain, logo, emails, per-client credit markup | No | **No** | After paying customers; 6–10 weeks |
| Pricing model | Subscription + $0.10 credits, ~2× headline in practice | Per workspace / month, seat- and contact-limited; 14-day trial; free to 100 contacts | Nothing charged yet | INR tiers below |
| Onboarding time | ~15 min URL-to-agent, the whole playbook pre-filled — their best-reviewed feature | 14-day trial; "Book Demo"; their team onboards | **Partial** — sign up → paste a URL on Knowledge → connect Telegram, about 10 minutes. The screens exist separately; **no wizard**, agent not pre-filled from the crawl | The six-step wizard — Phase 14 |
| Developer surface | REST API (40+ resources), webhooks, Custom Functions, MCP server + client | REST API + MCP on Business Pro; "100+ integrations"; Zapier | **No public API** — internal routes only | Outbound webhooks (15); REST + MCP (16) |
| Company size and risk | 3 people, bootstrapped, ~$330K ARR. A pivot or acquisition breaks every white-labelled client at once | Established Indian vendor, "2000+ businesses". The safe choice for a buyer; the lock-in is the CRM itself | One developer, no customers — the highest platform risk of the three, and the buyer will see it | Data export from day one; a plain-English contract |

---

## Where each competitor is genuinely stronger

**AiEngage — breadth, and the sales motion that goes with it.** An SMB owner gets a pipeline, quotes, Razorpay collection, a calling system with recordings, email with AI drafts, an Android app and a Meta-ads lead sync in one login, with a team that onboards them. Their "automation journey" is honest about what the product is: steps 1–7 are plumbing (ad → form → sync → WhatsApp welcome → reply → AI qualifies → team notified), step 8 is a human booking the call. That is a CRM with an AI receptionist, and for a business running on spreadsheets and a shared phone it is a large step up. They also have the two things a buyer weighs before any feature: references in the same city, and someone to phone when it breaks. Their per-workspace pricing is simple to understand, which ours (metered replies) is not.

**DM Champ — the agent itself, and the agency machinery around it.** Seven channels including Instagram and Messenger, the two that need Meta approval we have not applied for. Realism controls tuned over three years. Media understanding. URL-to-agent in 15 minutes with the whole playbook pre-filled. Custom Functions, webhooks, a REST API and an MCP server. A complete white-label layer with per-client credit markup, which is how it acquires distribution for free. And the quality of their default instruction design is real: the food-contact transcript on the boss's account — the AI declining to guess at cookware chemistry and steering back to what it could help with — was produced by **their** agent, "Tia | ATC", on Max tier. Ours has one client's worth of instruction-design lessons; theirs has a few thousand.

---

## Where we are genuinely ahead today

A short list, and every item is checked against code, not the plan.

1. **Cost is visible per message.** `UsageRecord` stores prompt, cached and output tokens, USD and model for every call; Settings shows spend and cache hit rate. DM Champ shows credits, which hide a ~2× markup on the real cost (`07`). AiEngage shows nothing — the AI is a line inside a seat price. A finance-minded buyer can be shown exactly what a conversation cost, live.
2. **Any model, your key, your bill.** DM Champ's BYOK is Anthropic-only and Agency-tier-only. Ours accepts any OpenAI-compatible base URL and records `byok` on each row. It also answers "can our data go through a Chinese model provider?" per client instead of per platform.
3. **Escalation is a tool that fires, not a sentence.** In testing on 14 Sep our model fired `alertHuman` correctly on a price request with an accurate reason — after we found that models *describe* escalations without calling the function and fixed it with one imperative prompt line (`PRODUCT-PLAN.md` §7). Whether AiEngage's "hands to a human" fires reliably is unknown. Ours we can show, and the inbox refuses to let the AI speak once it has.
4. **Spend cannot run away.** Per-conversation and per-org-per-day hard caps, enforced in the agent loop. DM Champ's failure mode is silence when credits run out.
5. **Tenant isolation was attacked, not assumed.** Two real cross-tenant bugs found and fixed, with a regression script. Table stakes — but done.
6. **WhatsApp warm-up is enforced, not advised.** The cap is derived from `warmupStartedAt` on every send and the send is blocked, logged and surfaced. AiEngage avoids the problem by offering only the official API; DM Champ manages it the same way we do.

**One correction to how we talk about ourselves.** The food-contact transcript in `prisma/seed.ts` and `PRODUCT-PLAN.md` §7 is real, and it is DM Champ's output on the boss's account, seeded into our demo organisation. It shows what the category can do and our seeded agent carries the same "never guess at food-contact chemistry" rule — but until our agent produces its own version on record, it is not our proof and must not appear on our homepage as if it were. Re-run the same enquiry through our agent, capture the real output, and use that.

---

## What makes "better than both" true rather than a slogan

Three things, and only three. Everything else in the roadmap is catching up.

**1. The agent reads the customer's own data, safely.** "Is it in stock", "where is my order", "is Thursday free" — the questions a static FAQ cannot answer and the ones that keep a lead in the chat. DM Champ can do it only if the customer builds and hosts an HTTP endpoint. AiEngage's API points into *their* CRM, not out to the customer's ERP or booking system. Our model: a human names a read-only query; the model may call it by name with arguments validated against a JSON Schema, bound by the driver, capped rows, timeout. **The model never writes SQL and never picks a URL.** The tables exist today; the executor and UI are the next two weeks. It becomes "better than both" the day `queryLiveData` answers a real question from a real database on a call with a prospect — not before.

**2. Price transparency the others cannot copy without hurting themselves.** Showing the real per-message cost is trivially easy for us, structurally impossible for DM Champ (their margin *is* the gap between $0.10 and $0.005), and pointless for AiEngage (their AI is a feature, not a meter). Paired with any-provider BYOK it moves the sales conversation from "how many credits" to "here is what it costs, and you may pay the model vendor directly". This is true today.

**3. The AI knows when to stop, and we sell that.** Warm-up caps, escalation as a first-class tool the inbox enforces, spend caps, ban-risk disclosure at connect time. Neither competitor leads with risk; both bury it. For an owner whose WhatsApp number *is* the business, "here is exactly how we keep it from being banned and from saying something wrong" is the pitch that lands. True today except the disclosure copy on the connect screen, which is a paragraph, not a feature.

---

## Could we win this deal in an Indian SMB's office against AiEngage?

Today, against their full pitch, **usually not.** The owner asks four questions. "Does it work on my WhatsApp business number?" — theirs, yes, officially; ours, via QR, with a ban-risk disclosure. "Can my sales team see the deals?" — theirs has a Kanban; ours has an inbox and tags. "Can I collect payment in the chat?" — theirs, Razorpay; ours, no. "Who do I call when it breaks?" — theirs, a support team; ours, one developer. We lose three and tie one.

Where we win is when the owner's actual pain is *answers*: a chemicals distributor, a tour operator, a spare-parts dealer — anyone whose enquiries are "do you have X, what does it cost, when can you deliver" and whose staff cannot answer at 11pm. There the live-data query, the enforced escalation, the visible per-message cost and a price a third of theirs win the room. So: **do not pitch against AiEngage as a CRM. Pitch as the agent that answers from their stock list, and connect to whatever CRM they already have** — including AiEngage's own API, if they have already bought it. Until Phase 13 and 14 ship, the honest answer to "can we win" is: in about one office in five, and only with a live demo on their own data.

---

## Pricing proposal — INR first, USD for export

Rate assumed: **₹88 per USD**. Re-check before anything is published.

AiEngage anchors: Solo ₹1,799 (1 user, 5k contacts), Business ₹5,999 (5 users, 20k contacts), Business Pro ₹9,999 (10 users, 50k contacts, API + MCP). DM Champ: $97 for 250 credits (≈500 visible replies on Max after tool calls).

Principles. Meter what costs us money — AI replies — not what doesn't (contacts; seats within reason). Undercut AiEngage's Solo and Business on the *agent* — more channels, more replies, live data — while saying plainly we do not have their pipeline, payments, calling or app. Sell BYOK as "platform fee only, pay the model vendor yourself", which nobody in the market offers. Bill per **visible reply**, and eat the tool calls ourselves: DM Champ's decision to bill every call separately is exactly what made its real cost 2× the headline (`07`), and being the one vendor whose bill matches its price list is worth the margin.

| | **Starter** | **Growth** | **Business** |
|---|---|---|---|
| INR / month | **₹1,499** | **₹3,999** | **₹7,999** |
| USD / month — export price, not a conversion | $29 | $79 | $149 |
| Undercuts | AiEngage Solo ₹1,799 | AiEngage Business ₹5,999 | AiEngage Business Pro ₹9,999 |
| Agents | 1 | 3 | unlimited |
| Channels | Telegram, web widget, WhatsApp QR | + email and official WhatsApp when built (carrier fees passed through) | all |
| AI replies included / month | 1,000 | 5,000 | 20,000 |
| Overage per visible reply | ₹0.50 | ₹0.40 | ₹0.30 |
| Seats | 2 | 5 | 15 |
| Contacts | unlimited | unlimited | unlimited |
| Live data | 1 source, 3 queries | 3 sources, unlimited queries | unlimited |
| BYOK | Yes — replies unmetered on your own key | Yes | Yes |
| Trial | 14 days, no card, ₹200 of AI included | | |

**The model-cost floor.** Measured on this machine: **$0.000497 per model call** with 60% of the prompt cached (`PRODUCT-PLAN.md` §9). A visible reply that also fires a tool is two calls, so plan on **~$0.001 per visible reply** on the cheap-model default — and **~$0.005** on a Sonnet-class model, cached, where a client insists (`08`). At ₹88/USD:

| Tier at full allowance | Replies | Floor, cheap model (~$0.001) | Floor, Sonnet-class (~$0.005) | Price | Floor as % of price |
|---|---|---|---|---|---|
| Starter | 1,000 | $1 ≈ ₹88 | $5 ≈ ₹440 | ₹1,499 | 6% / 29% |
| Growth | 5,000 | $5 ≈ ₹440 | $25 ≈ ₹2,200 | ₹3,999 | 11% / 55% |
| Business | 20,000 | $20 ≈ ₹1,760 | $100 ≈ ₹8,800 | ₹7,999 | 22% / **110%** |

Read the last cell. The Business tier only works on the cheap-model floor or on BYOK. So the platform default is a cheap-to-mid model — the `CLAUDE.md` §11 eval decides which — and a client who wants a Sonnet-class model brings their own key. Overage at ₹0.30–0.50 per reply is 3–6× the cheap floor and still 5–20× below DM Champ's effective ₹4.40–8.80 per visible reply (0.25–1 credit at $0.10, doubled for tool calls).

Not in the floor and passed through at cost: **official WhatsApp carrier fees** — Meta charges per message from 1 October 2026, roughly $0.0014 utility / $0.0094 marketing in India and $0.03–0.08 in the UAE (`02`). On QR there is no carrier fee, which is part of why QR is the Indian wedge. Also outside the floor: the crawl (~1 utility call per page, fractions of a rupee) and hosting (a VPS, fixed).

Say both of these on the pricing page: **what we do not charge for that AiEngage does** — contacts, and mostly seats; **what we charge for that AiEngage does not** — AI replies above the allowance.

---

## Inputs for the homepage track

For whoever builds the homepage the brief asked for — AiEngage's structure, our content — three rules:

1. Every screenshot is of the running app, and every feature shown is in the **Us — today** column above. Anything in **Us — planned** goes on a roadmap block labelled as such, or nowhere.
2. The hero demo is a transcript **our** agent produced. The food-contact line is DM Champ's output on the boss's account (see the correction above); re-run that enquiry through our agent and use what it actually says. If it produces the equivalent line — the seeded agent carries the same rule — that is a better story, because it is ours and it is reproducible on stage.
3. We cannot show "2000+ businesses". We can show one real transcript, the real cost per message, the real cache-hit percentage and the spend cap that stops a runaway conversation — which is a more interesting hero than a number nobody can check.
