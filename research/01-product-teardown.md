# 01 — Product teardown

## What it actually is

An **AI sales agent that lives in messaging inboxes**. A prospect DMs a business on Instagram or WhatsApp; DM Champ's AI reads the message, replies like a trained salesperson, answers questions from a knowledge base, handles objections, detects buying signals, and books a call into a connected calendar — with no human involved.

Their headline proof points: an AI-closed **$40,000 hair transplant deposit**, and a claimed range of $27 products up to $50,000+ services.

Positioning is deliberately **agency-first**: the buyer they want is not the end business, it's the agency that will resell it to twenty end businesses.

---

## Channels

| Channel | Notes |
|---|---|
| WhatsApp | Both the official Business API and an unofficial "WhatsApp Web" bridge |
| Instagram DMs | Via Meta API; also personal-account mode |
| Facebook Messenger | Via Meta API |
| SMS | Bring your own Twilio account |
| Telegram | Native |
| Email | IMAP, Gmail, Outlook |
| Web chat widget | Embeddable on a site; also a WhatsApp click-to-chat widget |
| LINE, Viber, Android SMS gateway | Supported |
| iMessage | Advertised as coming soon |

The AI reads **voice notes, images, videos and PDFs**, not just text. Media understanding is free; only video-audio transcription costs a credit.

---

## How the AI agent is configured

This is the part worth understanding properly, because it's the core of the product and the thing we'd have to reproduce.

### Setup is "paste a URL"

During onboarding you give it the client's **website URL**. Their AI crawls the site and auto-generates the whole agent: tone, goals, conversation flow, plus an FAQ knowledge base built from the site content. Reviewers consistently report a new client goes live in **~15 minutes**. This is their single biggest UX advantage and the thing agencies rave about.

### The instruction structure

Rather than one free-text prompt box, instructions are split into named sections — effectively a guided prompt template:

**Persona & Goal**
- *Persona* — bot's name, role, personality
- *Goal* — what success looks like in a conversation

**Business Context**
- *Company Info* — business, products, target customer

**Conversation Behavior**
- *Rules* — guardrails; what the bot must never do or say
- *Conversation Flow* — a numbered sequence of steps

**Escalation & Wrap-up**
- *Alert Human When* — triggers a handoff; the chat **pauses** and the bot sends nothing further until a human resumes it
- *Conclude When* — when to end the conversation on its own

Separately: **FAQs** (precise answers to common questions), **Resources** (shareable links), and **Extra context** (temporary info like a running promotion, kept out of the core instructions).

Their own guidance is that good playbooks land at **10,000–30,000 characters**, not the 80,000+ ceiling.

### Making it not feel like a bot

A set of realism controls that are genuinely well thought through:

- **Reply delay** — min 15s / max 30s before "typing" starts
- **Message splitting** — several short bubbles instead of one wall of text
- **Typing speed simulation** — character-by-character, paced to the quality tier
- **Speed setting** — Quick / Fast / Thoughtful / Human Like (default)

This is why reviewers keep saying leads don't realise they're talking to a bot. It's not a better model — it's better *pacing*.

### Memory

Full recent conversation history is retained; older messages are auto-summarised. Marketing claims up to a **100k-token history per contact**. Instruction length is capped by a "Context Budget" of **20K–100K characters depending on plan**; the knowledge base is counted separately.

---

## Feature surface (full)

**Sales mechanics**
- AI appointment booking inside the chat, calendar-synced, plus shareable booking pages
- Instagram comment-to-DM automation (auto-DM anyone who comments)
- Outbound DM campaigns with the AI handling every reply
- Automatic follow-up sequences; cart recovery
- Sales pipeline, task management, daily summaries

**Inbox & ops**
- Unified inbox across all channels, with assignment routing
- Test environment for trying the bot before it goes live
- Contacts: custom fields, lists, import/export, tagging, bot-exclusion rules
- Spam filtering, availability/compliance hours, lead discovery, web search mid-conversation

**Optimisation**
- "One-click optimisation" — analyses top-performing conversations and rewrites the agent's instructions
- Thumbs-down feedback loop for refining from real chats

**Developer surface**
- REST API across 40+ resources
- Webhooks (new message, new contact, booking)
- **Custom Functions** — the AI calls *our* APIs mid-conversation (see below)
- **MCP server** at `mcp.dmchamp.com` so Claude/ChatGPT/Cursor can drive the platform; MCP client support so the bot can call external MCP servers
- Integrations: GoHighLevel, ManyChat, Zapier, Intercom, Tidio, Zendesk, Formitable, Zenchef, Meta lead forms

**Other**
- Social Scheduler (beta) — post scheduling and analytics
- Claimed EU AI Act transparency compliance

### Custom Functions — worth a closer look

This is how the bot becomes more than a FAQ machine. You register an HTTP endpoint with typed input parameters (string / number / boolean / array / query_param), auth via headers (bearer token or API key), and a description that tells the AI *when* to use it. Mid-conversation the bot collects the missing arguments from the customer, calls the endpoint, reads the response, and replies naturally.

Their documented examples: order-status lookup, Shopify order queries, newsletter signup into a CRM, and appointment creation in an external booking system. The platform also passes through system context (contact ID, campaign ID, channel, full contact record) unless you toggle it off.

**Relevance to us:** this is the hook that would let a DM Champ bot talk to a real backend — the same way our ZAFS Nuxt API exposes tours and availability. A bot could quote live safari pricing rather than reciting a static FAQ.

---

## AI models offered

| Tier | What it is | Credit cost per action |
|---|---|---|
| **Pro** | Anthropic **Claude Sonnet** | 1 credit |
| **Max** | Their own in-house model | 0.25 credits |
| **Mini** | Lighter in-house model, more errors, shorter memory | 0.15 credits |
| Economy | Deprecated | 0.5 credits |

They claim to have benchmarked against "14 leading AI models" and to be most accurate at a quarter of the price — graded, per their own copy, by Claude Opus. Treat that as marketing; it is their own benchmark of their own model.

**BYOK (Bring Your Own Key)** — Anthropic only, key must be a real `sk-ant-` key from your own console.anthropic.com account (no resellers or proxies). With BYOK connected, **Pro-tier AI replies cost 0 credits** and Anthropic bills you directly. Max and Mini still cost credits because they run on DM Champ's own infrastructure. There's a fallback toggle so the bot doesn't go down if your key fails.

This BYOK detail matters more than anything else in the pricing analysis — see `02-pricing-and-unit-economics.md`.

---

## Known weaknesses (from verified AppSumo reviews, 4.8★ / 142 reviews)

Worth knowing before we stake a client relationship on it:

- **Instagram contacts show as "Unknown Unknown"** — a Meta API limitation, but it looks unprofessional in the inbox.
- **Instagram connection is fragile** — one reviewer spent three days trying to connect via Meta's API and never got it working.
- **Documentation is outdated in places**, and support has redirected people to those docs instead of helping.
- **Support response times** have been criticised as slow by some (though others praise the team shipping bug fixes within days).
- **No TikTok** support.
- **Native booking integrations** (Booksy, OpenTable) still on the roadmap.
- **Instruction character limit** was raised as a concern by an agency planning 100+ clients; the founder clarified the limit is **per AI agent**, not global.

The ratings are genuinely strong (133 of 142 are five-star), and the recurring theme in complaints is *onboarding friction and Meta integration*, not the AI quality.
