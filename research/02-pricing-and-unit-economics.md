# 02 — Pricing, credits, and the real unit economics

## Published plans

| Plan | Monthly | Annual (50% off) | Credits/mo | Sub-accounts | Team seats | White-label |
|---|---|---|---|---|---|---|
| **Business** | $97 | $582/yr = $48.50/mo | 250 | — | 3 | No |
| **Agency** | $297 | $1,782/yr = $148.50/mo | 1,000 | 10, then $29/mo each | 10 | Yes |
| **Agency Unlimited** | $497 | $2,982/yr = $248.50/mo | 2,500 | Unlimited, no per-account fee | Unlimited | Yes |

- All channels are included on every plan — channel access is not the upsell.
- 90-day money-back guarantee **on yearly billing only**. Monthly billing has no guarantee.
- Business tier gets: unified inbox, unlimited agents and contacts, knowledge base, booking, API, automation.
- Agency adds: white-label, client pricing control, 4× credits, BYOK, agency dashboard.
- Agency Unlimited adds: priority support, and removes the per-sub-account fee.

### AppSumo lifetime deal (currently SOLD OUT)

| Tier | One-time | Credits | Sub-accounts | White-label |
|---|---|---|---|---|
| 1 | $59 | 100 | 0 | No |
| 2 | $159 | 300 | 3 | No |
| 3 | $259 | 500 | 10 | **Yes** |
| 4 | $359 | 750 | 20 | Yes |
| 5 | $679 | — | 100 | Yes |
| 6 | $999 | 3,000 | Unlimited | Yes |

Refundable up to 60 days. The credits shown are **one-time**, not monthly — the LTD buys the platform, not ongoing usage. **If this deal returns, Tier 6 at $999 one-time is the single cheapest route to unlimited white-label reselling that exists**, and is worth setting a notification for.

*Note:* a third-party review site lists slightly different tier prices ($59/$139/$229/$319/$599). The AppSumo table above is the authoritative one.

---

## The credit system

**1 credit = $0.10.** Top-ups sold in blocks of 100–10,000 at that rate. There is no separate overage rate — when you run out, **the AI simply stops replying** until credits are added (manually or via auto-recharge against a threshold).

### What burns credits

| Action | Cost |
|---|---|
| AI reply — Pro (Claude Sonnet) | 1 credit ($0.10) → **0 with BYOK** |
| AI reply — Max (their model) | 0.25 credits ($0.025) — unchanged by BYOK |
| AI reply — Mini | 0.15 credits ($0.015) — unchanged by BYOK |
| Rented phone number | min 50 credits/month |
| WhatsApp Web connection | 50 credits/month |
| Managed WhatsApp Business API message | 0.05 credits (BYOK accounts only) |
| WhatsApp utility template → US | ~0.1 credits |
| WhatsApp marketing template → US | ~0.25 credits |
| SMS | Billed direct through your own Twilio — no credits |
| Instagram / Messenger | **Free** |
| Voice / image / document understanding | Free |
| Video audio transcription | 1 credit (free on BYOK) |
| Launching an outbound campaign | **0 credits** — you only pay when someone replies and the AI answers |

**One AI response = one charge**, regardless of how many messages the customer fired off — rapid incoming messages are batched into a single reply. That's a fair design and worth noting if we build.

New accounts get 100 welcome credits plus up to 700 more for completing the onboarding checklist.

---

## What a reply actually costs them (the margin analysis)

This is the crux. Using current Anthropic list pricing:

| Model | Input $/1M | Output $/1M |
|---|---|---|
| Claude Sonnet 5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

Cached input reads cost ~10% of the input rate — and a DM bot is the *ideal* caching workload, because the playbook + FAQ prefix is identical on every single reply.

**Modelling one reply:** ~8,000 input tokens (playbook + FAQ + conversation history), ~150 output tokens.

| Scenario | Cost per reply |
|---|---|
| Sonnet 5, no caching | ~$0.026 |
| **Sonnet 5, cached prefix** | **~$0.005** |
| Haiku 4.5, no caching | ~$0.009 |
| **Haiku 4.5, cached prefix** | **~$0.0015** |

Against that:

| DM Champ charges | Per reply | Multiple over a cached Sonnet call |
|---|---|---|
| Pro tier | $0.10 | **~20×** |
| Max tier | $0.025 | ~5× |
| Mini tier | $0.015 | ~3× |

**That spread is the entire business.** The subscription covers the platform; the credits are where the profit lives.

Look at Agency Unlimited annual: **$248.50/mo, which includes 2,500 credits — a face value of $250.** The plan is, on paper, "free" if you value credits at list. That tells you plainly that list credit price is far above their cost.

**Why BYOK exists:** it's the pressure valve for sophisticated buyers who can do this maths. Rather than lose them, DM Champ lets them pay Anthropic directly and keeps the platform subscription. Smart, and very much in our favour.

---

## What this means for us

### Our cost at realistic volumes

Assume an average client's bot handles ~500 AI replies a month.

| Clients | Replies/mo | On Max tier | On Pro + BYOK |
|---|---|---|---|
| 5 | 2,500 | 625 credits — covered by plan | Plan only |
| 10 | 5,000 | 1,250 credits — covered | Plan only |
| 20 | 10,000 | 2,500 credits — **exactly the included allowance** | Plan only |
| 50 | 25,000 | 6,250 cr = 3,750 extra = **+$375/mo** | ~$125/mo to Anthropic (cached Sonnet) |
| 100 | 50,000 | 12,500 cr = 10,000 extra = **+$1,000/mo** | ~$250/mo to Anthropic |

**Read that last column carefully.** With BYOK, our cost at 100 clients is roughly **$248.50 platform + $250 Anthropic ≈ $500/mo** — about $6K/year to run an unlimited-client white-label AI agency. That is the number that makes building our own hard to justify financially.

Without BYOK, at 100 clients we'd be paying ~$15K/year in credits, which is where a build starts to look interesting — but BYOK is available on our tier, so we simply wouldn't do that.

### Pricing clients

If we charge a modest **$150/month per client**:

| Clients | Revenue/mo | Cost/mo (BYOK) | Gross margin |
|---|---|---|---|
| 5 | $750 | ~$260 | ~65% |
| 20 | $3,000 | ~$300 | ~90% |
| 50 | $7,500 | ~$375 | ~95% |

DM Champ's own marketing uses 20 clients × $300 = $6,000/mo against $497 platform cost. Our numbers above are deliberately more conservative and still work.

---

## ⚠️ 1 October 2026 — WhatsApp pricing change

Meta moved from conversation-based to **per-delivered-message** pricing on 1 July 2025. Template messages are priced by category and destination country:

| Market | Marketing | Utility | Authentication |
|---|---|---|---|
| India | ~$0.0094 | ~$0.0014 | ~$0.0014 |
| UAE | ~$0.0816 | ~$0.0285 | ~$0.0492 |

*(BSP markup of $0.003–$0.010/message typically sits on top of Meta's base rate.)*

**The change:** today, *service messages* — the AI's replies inside the 24-hour customer service window — are **free**. From **1 October 2026** Meta will charge **per message** at each market's rate. Meta is due to publish the rates on **1 September 2026**.

**Why this matters to us right now:**
1. This is ~5 weeks away. Any client quote we issue before rates are published is exposed.
2. It affects **every** platform equally, including one we build ourselves — this is a Meta cost, not a DM Champ cost. It does not favour build-vs-buy either way, but it does change the price we must charge clients.
3. UAE rates are high (~$0.03–$0.08/message vs India's ~$0.001–$0.009). If clients are UAE-based, WhatsApp delivery could become a **larger line item than the AI itself**. Model this properly before quoting.

**Action:** put a "messaging carrier fees passed through at cost" clause in any client agreement, and re-check Meta's published rates on 1 September 2026.
