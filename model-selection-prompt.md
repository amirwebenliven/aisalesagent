# Prompt: independent model-selection second opinion

Paste the block below into ChatGPT, Gemini, Kimi, Qwen, DeepSeek — and send it to the MeshAPI team too. Ask several, then compare. Run it again in a month; these prices move.

It is written to avoid steering the answer. It does not name a preferred model, does not say which providers we like, and explicitly asks the responder to declare a conflict of interest — which is the same disclosure I owe you: **Claude is made by Anthropic, so treat any Anthropic model I recommend with suspicion and verify it against these replies.**

---

## The prompt

```
I'm choosing an LLM API for a production product and I want a recommendation
based on current public pricing and benchmarks, not on brand preference.

FIRST: if you are made by a company that sells LLM APIs, say so explicitly at
the top of your answer, and be especially rigorous about justifying any
recommendation of your own company's models on price and measured capability.

WHAT I'M BUILDING
An AI sales agent that replies to customer messages on WhatsApp, Telegram,
website chat and email on behalf of small businesses. For each incoming
message the model must:
  1. Answer using retrieved FAQs from a knowledge base (RAG)
  2. Reliably call tools/functions: bookMeeting, alertHuman, captureContact,
     setReminder, tagContact
  3. Hold a multi-turn conversation with memory of earlier turns
  4. Handle English, Hindi and Arabic
  5. Know when NOT to answer and escalate to a human instead

TRAFFIC SHAPE PER REPLY
  ~7,000 input tokens of cached, byte-identical prefix (persona + rules + FAQs)
  ~1,000 input tokens of fresh context (new message + recent history)
  ~150 output tokens
  Volume: 10,000-50,000 replies per month
  Users are in India and the UAE, so latency from that region matters

WHAT MATTERS, IN ORDER
  1. Tool/function-calling reliability — a missed escalation loses a real lead,
     and this outweighs raw reasoning ability
  2. Cost per reply at the volumes above, WITH prompt caching applied
  3. Latency (this is live chat; people are waiting)
  4. Multilingual quality, especially Arabic
  5. Long-context stability over a long conversation

WHAT I WANT BACK
  1. A table of the 6-8 cheapest models that can do reliable tool calling.
     Columns: model, provider, input $/1M, output $/1M, cached-input $/1M,
     context window, and a note on tool-calling quality.
  2. Computed cost per reply for the traffic shape above, and per month at
     10,000 and 50,000 replies. Show your arithmetic.
  3. A specific recommendation for TWO tiers:
       - a conversation model that does the tool calling
       - a cheaper utility model for extraction and classification only
  4. Which of these models are served from Chinese providers, and what the
     data-residency implications are for a UAE client with confidentiality
     requirements.
  5. Any model whose tool calling is known to be weak or inconsistent despite
     good general benchmarks — I care more about this than leaderboard scores.
  6. Whether prompt caching works on each one, and the exact discount, since
     90% of my input tokens are a fixed prefix.

CONSTRAINTS
  - I'll access these through an OpenAI-compatible gateway (MeshAPI), so the
    model must work through a standard OpenAI-format tool-calling request.
  - Cite your prices with a source and a date. If you aren't sure a price is
    current, say so rather than guessing.
  - Do not recommend a model on benchmark scores alone. SWE-bench and coding
    leaderboards tell me nothing about whether a model reliably fires an
    escalation function when a customer asks for a human.
```

---

## Also ask the MeshAPI team directly

These decide whether the gateway is usable at all, and no external AI can answer them:

1. **Does prompt caching pass through, per model, and at what discount?** ~90% of our input tokens are a fixed prefix — this saves more than any model choice.
2. Is **tool/function calling** passed through faithfully for each candidate model? Some gateways degrade it.
3. Is **structured output / JSON mode** supported?
4. **Data retention and logging policy** — our clients' customers' conversations pass through you. Needed in writing; GCC clients will ask.
5. **Rate limits** per model, and what failover does mid-conversation.
6. Is pricing **pass-through or marked up** against the providers' list prices?
7. **Latency** from India and the UAE for the candidate models.

## How to judge the answers

Ignore any reply that recommends a model without giving a price and a date. The useful answers will converge on two or three names — those are your candidates for the real test: **replay 20 real conversations from the DM Champ account through each one and score tool-call correctness.** That measurement beats every opinion, including mine.
