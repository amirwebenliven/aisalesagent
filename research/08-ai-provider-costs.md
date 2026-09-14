# 08 — Would ChatGPT or another AI API make building cheaper?

**Short answer: yes, the model bill would be tiny — and no, it doesn't change the build-vs-buy decision at all.** The AI API is a rounding error next to what actually makes building expensive.

Also, and importantly: **you cannot use ChatGPT inside DM Champ.** Their bring-your-own-key feature is **Anthropic-only** — the key must start with `sk-ant-` and come from your own console.anthropic.com account; resellers and proxies are explicitly rejected. So the ChatGPT question only applies to the "build our own" scenario.

---

## Cost per AI reply, across providers

Modelling one reply the way a DM bot actually works: ~7,000 cached input tokens (the playbook and FAQ prefix, identical on every reply), ~1,000 fresh input tokens (the new message plus recent history), ~150 output tokens. All three providers price a cache read at ~10% of the input rate.

| Model | Input $/1M | Output $/1M | **Cost per reply** |
|---|---|---|---|
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | **$0.00023** |
| GPT-5.6-luna | $0.20 | $1.20 | **$0.00052** |
| Gemini 2.5 Flash | $0.30 | $2.50 | **$0.00089** |
| Gemini 3.7 Flash | $0.75 | $3.75 | **$0.0018** |
| Claude Haiku 4.5 | $1.00 | $5.00 | **$0.00245** |
| GPT-5.6-terra | $2.00 | $12.00 | **$0.0052** |
| Claude Sonnet 5 | $3.00 | $15.00 | **$0.0074** |
| GPT-5.6-sol | $5.00 | $30.00 | **$0.013** |
| — | | | |
| **DM Champ, Max tier** | | | **~$0.05** *(0.25 credits × ~2 billed actions per visible reply)* |

The cheapest option is roughly **200× cheaper per reply than DM Champ's Max tier**. That gap is real — but look at what it amounts to in absolute terms.

## What it costs per month at real scale

100 clients × 500 replies each = 50,000 replies/month:

| Option | Monthly | Yearly |
|---|---|---|
| Gemini 2.5 Flash-Lite | $12 | $140 |
| GPT-5.6-luna | $26 | $310 |
| Gemini 2.5 Flash | $45 | $535 |
| Claude Haiku 4.5 | $123 | $1,470 |
| GPT-5.6-terra | $260 | $3,120 |
| Claude Sonnet 5 | $370 | $4,440 |
| GPT-5.6-sol | $650 | $7,800 |
| **DM Champ, Max tier** | **$2,500** | **$30,000** |

## Why this doesn't change the decision

**The spread between the cheapest and most expensive AI API is about $7,700/year. The build itself is $30,000–$150,000 plus 12–24 months of two developers' time.**

Choosing Gemini Flash-Lite over Claude Sonnet saves ~$4,300/year. It does not move a six-figure, two-year decision. The expensive parts of building — none of which change based on which AI API you pick — are:

| Work | Effort | Affected by AI provider? |
|---|---|---|
| Omnichannel messaging infrastructure | 3–6 months | No |
| Multi-tenant white-label platform | 3–5 months | No |
| The application (inbox, CRM, campaigns, booking) | 3–6 months | No |
| **Meta App Review / Advanced Access** | Weeks of calendar time, rejection-prone | **No** |
| The AI agent layer | 4–8 weeks | Marginally |

Swapping the AI provider optimises the one line item that was already cheap.

## The trap in picking the cheapest model

This product's entire value is the AI **not embarrassing you in front of a paying client's prospects**. DM Champ's own marketing leads with a $40,000 deposit closed by the bot. That is not a job for a Flash-Lite-class model.

Three specific reasons cheap models underperform here:

1. **Tool calling has to be reliable.** The live ledger shows the bot firing `setContactEmail`, `alertHuman`, `createTask`, plus name and email extraction — that's the actual mechanism of the product. Weak models fail at consistent structured tool use, and a missed `alertHuman` means a hot lead goes unanswered.
2. **Long-context memory matters.** DM Champ's own UI warns that its cheap Mini tier has "a higher chance of small mistakes or hallucinations, and a lighter memory in long conversations." That's the vendor describing their own budget tier's failure mode.
3. **One bad reply costs more than a year of token savings.** At these prices the entire annual model bill for 100 clients on a good model is ~$1,500–$4,500. A single hallucinated price quote to a real customer can cost more than that.

Note what DM Champ themselves chose: **Claude Sonnet for their Pro tier**, and a purpose-tuned model for Max. They did not pick the cheapest available API — and they're the ones with the margin pressure.

## The practical conclusion

- **If we resell:** the ChatGPT question is moot — BYOK is Anthropic-only. The lever that matters is tier selection, not provider.
- **If we build:** pick the model on quality, not price. Even the expensive options cost a few thousand a year at 100 clients. Use aggressive prompt caching (the playbook prefix is identical on every call, so ~90% of input tokens should be cache reads) and reserve a cheap model for genuinely trivial sub-tasks like name extraction — which is, tellingly, exactly what DM Champ bills as a separate action.

**The build-vs-buy answer in `04` is unchanged.**
