# ChooseMyRide × DM Champ — how the AI agent answers from live Shopify data

**For:** the client meeting on 19 September 2026 (ChooseMyRide, https://choosemyride.ae/)
**Prepared:** 18 September 2026, from a logged-in walkthrough of the boss's DM Champ agency account, DM Champ's own help centre, and live probes of the client's store
**Purpose:** explain — and be able to demonstrate — how the client's Shopify store connects to the AI agent so his customers get live answers (stock, price, order status, tracking) on WhatsApp / Instagram / his website, **until our own product is ready**. What we sell him today is DM Champ under our white-label brand; he never sees the DM Champ name.

Everything marked **✔ verified** was tested today, not read about.

---

## 1. The 60-second version (what to say first)

> Your customers already ask the same questions all day: *is this bike in stock, how much is it, where is my order, when will it arrive, what did I buy last time.* Today a person answers those — slowly, and not at 11 pm.
>
> We put an AI agent on your WhatsApp, Instagram and website. It is trained on your store. When a customer asks something that needs **live** information, the AI doesn't guess — it looks it up in your Shopify **at that moment**, the same way your staff would open the admin, and answers in one reply. When it is unsure, or the customer is upset, it hands the chat to your team with a summary.
>
> Your store is on Shopify, which makes this easy: Shopify already publishes a live "tools" endpoint for your catalogue that the AI can connect to **with no passwords at all** — we tested it on your store this morning and it connected first time. Order tracking needs one extra read-only permission from your Shopify admin, which takes us about a day to wire up properly.

---

## 2. What the customer will experience

Three conversations the agent can hold once connected. (Illustrative wording; the product data is what the agent would actually fetch. **The order-tracking exchanges are mock-ups — order lookup is not connected yet.** If shown, label them "example of what it will say", or the client will ask to see it live.)

**Stock and price — live from the catalogue**

> **Customer:** do you have the mogoo 16 inch kids bike in blue?
> **Agent:** Yes — the Mogoo Classic 16" Kids Bike is in stock in Blue at **Dhs. 285.03** (down from Dhs. 399). Want the link, or shall I check the 14" and 20" sizes too?

**Order status and tracking — live from orders (Part B, below)**

> **Customer:** where is my order?
> **Agent:** I can check that. What's your order number, and the phone number or email you ordered with?
> **Customer:** #1187, 050 123 4567
> **Agent:** Thanks. Order #1187 (Mogoo Athena 20", Dark Pink) was shipped yesterday with Aramex, tracking **41230987654** — expected delivery tomorrow. Here's the tracking link: …

**Past purchases**

> **Customer:** what did I buy last time? need the same size for my other kid
> **Agent:** Your last order (#1102, March) was a Mogoo Classic 14" in Yellow. The same model is available in Blue, Red and Green right now — from Dhs. 229.03, prices vary by colour. Shall I check a 16" for the older one?

And the guardrail every client wants to hear:

> **Customer:** can you tell me what order 1190 was? it's my brother's
> **Agent:** I can only share order details with the phone number or email that placed the order — please ask him to message us, or I can connect you to our team.

---

## 3. How it works — in plain words

The AI has **tools**. A tool is a live request to another system that the AI can decide to make in the middle of a conversation. It notices the customer needs live data, collects whatever is missing (an order number, a phone number), makes the request, reads the answer, and replies naturally. The customer never sees the machinery.

DM Champ offers two ways to give the AI tools:

| | **MCP server** | **Custom function** |
|---|---|---|
| What it is | A ready-made bundle of tools another system publishes | One HTTP request you define yourself |
| Setup effort | Paste one URL, press *Test connection* | Fill a form: URL, method, headers, parameters |
| Credentials | Whatever the server needs — **Shopify's needs none** | Whatever the API needs — Shopify orders need a token |
| For ChooseMyRide | **Catalogue: products, prices, stock, cart** | **Orders: status, tracking, history** |

Both are switched on **per agent**, in the agent editor → **AI Abilities** tab. Only what you tick there is available to that agent's bot.

**Cost.** Every tool call is billed like one AI reply at the agent's quality tier. The boss's agents run on **MAX**: 0.25 credit per reply and 0.25 per tool call. A typical "where's my order" chat — three replies and one lookup — is **one credit**, i.e. **$0.10** at DM Champ's retail credit price. (On the Pro tier it is 1 credit each, or 0 with a bring-your-own Anthropic key.)

---

## 4. What we verified on the client's store today

- **✔ The store is Shopify.** `https://choosemyride.ae/meta.json` → `myshopify_domain: xnk706-rr.myshopify.com`, Dubai, currency AED, 512 published products, 54 collections, ships to AE only.

- **✔ Shopify's built-in catalogue tools connect to DM Champ with zero credentials.**
  In DM Champ → *MCP Servers* → *Add server* → Server URL `https://choosemyride.ae/api/ucp/mcp` → **Test connection** returned:
  **"Connected to universal-commerce · 13 tools"** — `search_catalog`, `lookup_catalog`, `get_product`, `create_cart`, `update_cart`, `get_cart`, `cancel_cart`, `create_checkout`, `update_checkout`, `get_checkout`, `complete_checkout`, `cancel_checkout`, `get_order`.
  So the agent can search the live catalogue in natural language, quote exact prices and real-time availability, build a cart and hand the customer a checkout link. (`get_order` here only reads orders/checkouts *that this channel created* — it is **not** a customer-history lookup. That is Part B.) *Nothing was saved to the account — the dialog was cancelled after the test.*

- **✔ The store's policies/FAQ tool works** (corrected after an independent re-test on 18 Sep — my first question had returned `[]`). The second Shopify endpoint, `https://choosemyride.ae/api/mcp`, exposes `search_shop_policies_and_faqs`; asked about returns it answered from the store's own Refund policy: returns within 14 days of delivery, no restocking or return fee, return labels provided, customers can self-manage returns (`/policies/refund-policy` is filled, ~1,000 chars). **Two gaps to raise with the client:** the **Shipping policy** page is empty (`/policies/shipping-policy` → 404 — fix in *Settings → Policies → Shipping*), and the tool currently answers *"International shipping available"* although `meta.json` says the store ships to **AE only** — so the agent's instructions must state the UAE-only rule until that Shopify setting is corrected, or a live demo could surface the contradiction.
- **⚠ Per-colour pricing.** This store prices variants by colour (Classic 14": Green Dhs 229.03, Blue 259.05, Red 299.08). Demo replies should say "from Dhs …" rather than one price for all colours; the Classic 16" Blue at Dhs 285.03 quoted in §2 is correct.
- **⚠ BIGGEST DEMO RISK — `meta.ucp-agent.profile`.** Every one of the 13 catalogue tools **requires** a `meta.ucp-agent.profile` URL; Shopify fetches and validates that profile and returns an error if it cannot load it. *Test connection* only ran `tools/list` ("Connected") — no real search has been made through DM Champ yet. DM Champ has no field for this, so the **model must fill it**: add to the agent's AI Instructions *"When calling the Shopify catalogue tools, always set `meta.ucp-agent.profile` to `https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json`"* (Shopify's own example profile), then run a real *"16 inch kids bike"* search in **Try Out** before the room. If it fails anyway, the fallback demo is a **custom function on `/search/suggest.json`** (public, no credentials, returns title / price / sale price / in-stock / link). Also: `get_order` on this endpoint needs a Dev Dashboard token DM Champ will never hold — one more reason it is not a customer-history lookup.
- **✔ Identity check is feasible.** Order `email` and `phone` are "always available" to a Dev Dashboard custom app (no protected-customer-data review needed), so our lookup service can verify the contact against the order.

- **✔ Two more public, no-token endpoints exist**, useful as a fallback custom function if ever needed:
  `https://choosemyride.ae/search/suggest.json?q=<words>&resources[type]=product&resources[limit]=5` (title, price, sale price, in stock, link, image) and `https://choosemyride.ae/products.json` (the whole catalogue).

- **✔ The boss's DM Champ login is the agency account.** `huzefa@webenliven.com` on app.dmchamp.com: AppSumo **Tier 4**, **20 sub-accounts** on the plan, **1 used** (Al Taher Chemicals, owner `huzefaraja53@gmail.com` — that is the foundergrowth.ai workspace), **912 credits in the agency pool, 877 unallocated**. White-labeling is included (Settings → Advanced → White Labeling: custom domain, logo, colours, branded email). ChooseMyRide becomes **sub-account #2** with its own credit allowance and spending limit.

- **✔ DM Champ's own support bot already confirmed the approach** to the boss in-app: white-label yes; Shopify yes, "using Custom Functions… an Admin API access token with read_orders permission… attach that function to your agent". One correction to what it said — see the token note in Part B.

---

## 5. The setup, click by click

### Part A — live catalogue, prices and stock (≈ 15 minutes, no credentials)

Do this in the **ChooseMyRide sub-account** (create it first: *Sub Accounts → Add account → Account: owner first name / last name / email → Business: name, country, language, timezone → Features*). **In the Features step:** raise the **Channel limit** above its default of **1** (Part C needs widget + WhatsApp + Instagram/Messenger), and switch the **developer** toggles on (custom functions, MCP servers) — otherwise *AI Studio → MCP Servers / Custom Functions* will be missing in his sub-account. Confirm they appear before the meeting. **Demo with `/api/ucp/mcp`, not `/api/mcp`** — the address DM Champ's docs use as their Shopify example exposes only the policies tool on this store (1 tool, not 13).

1. Left menu **AI Studio → MCP Servers → Add server**.
2. **Name:** `ChooseMyRide Shopify catalogue`
3. **Server URL:** `https://choosemyride.ae/api/ucp/mcp`
4. **Auth method:** leave *API key / header*. **Header name / value:** leave empty (Shopify needs none).
5. **Test connection** → expect *Connected to universal-commerce · 13 tools*.
6. Untick the tools the agent should not have. Recommended for launch: keep `search_catalog`, `lookup_catalog`, `get_product`, `create_cart`, `update_cart`, `get_cart`; **turn off** `complete_checkout` and the other checkout/cancel tools — the agent should send a checkout *link*, never take payment inside the chat.
7. **Add server.**
8. **AI Studio → AI Agents →** the ChooseMyRide agent **→ AI Abilities → MCP servers →** tick the server and its tools **→ Save changes**. (Up to 5 servers and 40 tools per agent.)
9. Agent editor **→ Try Out →** type *"do you have a 16 inch kids bike, how much"* and watch it fetch. Then **Publish to live**.

Second server, same day: **Server URL** `https://choosemyride.ae/api/mcp` (tool `search_shop_policies_and_faqs`) — already answering from his Refund policy; ask the client to fill the Shipping policy so delivery questions are covered too.

### Part B — order status, tracking and purchase history (1–2 days, needs one Shopify permission)

**The Shopify side — what we need from the client.** Read-only access to orders. In Shopify that is an app with the `read_orders` scope (`read_all_orders` if he wants history older than 60 days — which he will, for "what did I buy last time"). The client's store owner has to approve it; a staff member needs *App development → Develop* permission.

**Token note (corrected 18 Sep after an independent check of DM Champ's docs).** Shopify **stopped issuing ready-made `shpat_…` tokens to new apps** in 2026 (the admin "Develop apps" screen no longer creates them; existing tokens keep working). A new app in Shopify's **Dev Dashboard** gives a Client ID and secret; the quick *client-credentials* token from those **expires every 24 hours** (`expires_in: 86399`) — useless as a static header — and it only works when app and store are in the **same Shopify organisation**, i.e. never for an app we create against his store. The permanent, non-expiring token comes from a **one-time authorisation**: open Shopify's approve URL for the app (`read_orders` scope, redirect = the store's own homepage), the owner clicks *Install*, copy the `code` from the redirected URL, exchange it once for a permanent `access_token`. DM Champ's own custom-functions page documents exactly this for Shopify and budgets **about ten minutes per store** — the exchange can even be run from the function builder's Test panel, so no developer server is needed. (The in-app support bot skipped that step; the docs did not.) Shopify staff on the developer forum confirm the result: *"a non-expiring offline token that works exactly like the old legacy tokens — it stays valid until the app is uninstalled."* Allow 30 minutes for our first time.

**Scope caveat:** `read_orders` sees the **last 60 days** only. `read_all_orders` (full history — "what did I buy last time?") **has to be requested from Shopify and approved**, not just ticked. Promise "recent orders" at launch and "full history once Shopify approves".

**Recommended architecture: a small read-only lookup service we host, in front of Shopify.** Pasting the permanent token straight into DM Champ works (their docs do exactly that) — we choose not to, for the reasons below. We run a tiny endpoint (a Cloudflare Worker or a route on our own server) that:

- holds the Shopify token (DM Champ never sees it — if the DM Champ account is ever compromised, the client's Shopify is not);
- takes `order_number` + `phone_or_email`, fetches the order, and **only returns it if the contact matches** — identity checking in code, not in a prompt;
- returns a **trimmed, human-readable** JSON (status, carrier, tracking number, tracking link, items, ETA) instead of Shopify's several-hundred-line order object — cheaper tokens, fewer AI mistakes;
- answers in a few seconds (DM Champ's guidance is under 10 s) and returns clear error text ("No order 1187 for that phone number") that the AI can relay.

No-code alternatives if we don't want to host anything: **Make.com** (Shopify connector, handles Shopify login for you) with *Custom webhook → Shopify: Search orders → Webhook response*, or **n8n** — both can send a reply back to the calling request, which a custom function needs (Zapier's standard catch-hook cannot return step results). DM Champ also has its own built-in no-code route: an **Automation** with an *AI Agent Function* trigger and a *Return response* step (the agent waits up to 25 seconds). *(Corrected 18 Sep: an earlier version claimed DM Champ's docs recommend Make/n8n for this — they don't say that.)*

**The DM Champ side — the custom function, field by field.** *AI Studio → Custom Functions → New function*:

| Field | Value |
|---|---|
| **Name** | `lookup_order` |
| **Description** | `Looks up a ChooseMyRide order by order number and verifies it belongs to the customer. Returns status, courier, tracking number and link, items and expected delivery.` |
| **AI action** | `Call this when a customer asks about an order, delivery, tracking, or what they bought. Ask for the order number AND the phone number or email used at checkout before calling. If the result says no match, tell the customer politely and offer to connect a human. Never reveal an order to someone whose phone/email does not match.` |
| **Method** | `GET` |
| **URL** | `https://<our-lookup-service>/choosemyride/orders` |
| **Skip system data** | leave **off** (DM Champ then also sends a `system` block — `system.contact` is the full contact record incl. the WhatsApp number the customer is writing from, plus `system.channel` and a `system.test` flag — which the service uses as a second identity check and to ignore Try Out tests) |
| **Headers** | `Authorization` = `Bearer <a key we issue for this client>` |
| **Input parameter 1** | name `order_number` · type `query_param` · **Required** on · description `The order number the customer gives, digits only, e.g. 1187` |
| **Input parameter 2** | name `contact` · type `query_param` · **Required** on · description `The phone number or email address the customer used when ordering` |
| **Response mapping** | leave empty (the service already returns only what's needed) |
| **Execution limits** | **Read-only function** on · **Serve cached result on repeat calls** **OFF** (the cache lives up to 24 h — a repeat "where's my order" would get yesterday's status) · **Max runs per conversation** `5` · **Max runs per time window** `10` within `60` minutes |
| **Test** | fill a real order number + contact → **Run test** → check the JSON → **Create function** |

Then **AI Agents → the agent → AI Abilities → Custom functions →** tick `lookup_order` **→ Save changes**, and test in **Try Out** before **Publish to live**.

If someone insists on calling Shopify directly from DM Champ (not recommended — token in a third party, no identity check, giant responses), the shape is: **GET** `https://xnk706-rr.myshopify.com/admin/api/2026-07/orders.json?status=any` (the technical `.myshopify.com` domain, not the custom domain; `2026-01` per DM Champ's docs works too) · header `X-Shopify-Access-Token: <token>` · parameter `name` as `query_param`, required — **digits only** (`1187`; a raw `#` makes Shopify ignore the filter) · response mapping to `orders` only. Fields the AI needs are `fulfillment_status`, `financial_status`, `fulfillments[].tracking_company / tracking_number / tracking_url / shipment_status`, `line_items[].title`. **Caveat:** the REST `name` (and `email`) filter is **undocumented and unsupported** by Shopify — it works today by convention; the documented equivalent is GraphQL `orders(query: "name:1187")`. One more reason to keep the lookup in our own service, where we can switch to GraphQL without touching the client's agent.

### Part C — putting the agent where his customers are

- **Website chat bubble on the Shopify store.** DM Champ: **Settings → Channels → Website chat widget → Manage → Channels & Embed** → under *Route these chats to* pick the agent → copy the snippet (`<script src="https://api.dmchamp.com/v1/chat-widget/CONFIG_ID?agent=AGENT_ID"></script>`; on the white-label domain the host differs). Shopify admin: **Online Store → Themes → ⋯ → Edit code → `theme.liquid`** → paste just above `</body>` → **Save**. Live on every page in a minute.
- **WhatsApp.** Two options: **WhatsApp Web pairing** — his existing number, scan a QR the way you pair WhatsApp on a laptop, live in minutes, unofficial (Meta could break it; spammy volumes risk a ban); costs the agency **50 credits a month per connected number** (≈ $5) with no per-message fee, and **his phone must come online at least once every 14 days** or the link drops. Or **WhatsApp Business API** — rent a number through the platform or bring his own; Meta-official, supports message templates, takes longer. Group chats are never answered on either. **Note for pricing:** Meta's change on **1 October 2026** makes replies inside the 24-hour window chargeable per message **on the Business API route only**, billed by Meta to his WhatsApp Business Account — quote whichever route he picks as its own line.
- **Instagram DMs / Facebook Messenger** — connected under Settings → Channels with his Meta Business login.
- **Human handover.** In the agent's *AI Instructions → Escalation & Wrap-up → Alert Human When*, write the rules: refunds, damaged goods, angry customer, anything the agent can't find. His team gets a **notification** (not a summary — say "the whole conversation is waiting in the inbox") and replies from the same inbox; the AI stays paused on that thread until someone turns it back on. **Internal:** for a managed sub-account the alert follows the *agency's* notification settings — check them, or his team may never receive the alert emails.

---

## 6. Guardrails to promise (and actually set)

1. **Read-only.** Nothing the agent can call changes an order. Shopify permission is read-only; the function is marked *Read-only function*.
2. **Identity before information.** Order details are released only when order number **and** the contact used at checkout match — enforced in code (our service), repeated in the prompt.
3. **No payments in chat.** Checkout tools off; the agent sends a Shopify checkout link and the customer pays on the store.
4. **Rate limits.** Max 5 lookups per conversation, 10 per hour — a bot cannot use the agent to enumerate orders.
5. **Hand-off, not bluffing.** If the lookup fails or the customer is unhappy, a human is alerted with the transcript.
6. **Data stays in Shopify.** The agent reads at the moment of the question; it does not copy his order database anywhere.

---

## 7. Timeline and effort

| | What | Who | Time |
|---|---|---|---|
| Day 0 (meeting) | Show Part A live in *Try Out* — no credentials needed | us | done in the room |
| Day 1 | Sub-account, white-label brand, knowledge base from his site, chat widget in his theme | us | half a day |
| Day 1 | Client approves the read-only Shopify app (one click in his admin, we drive) | client + us | 1 hour |
| Day 2 | Lookup service + `lookup_order` function + tests with real orders | us | one day |
| Day 3 | WhatsApp pairing, Instagram, escalation rules, his team trained on the inbox | us + his team | half a day |

---

## 8. Likely questions

- **"Is my customer data safe?"** — Read-only; identity check before any order is shown; the Shopify token never sits inside the chat platform; rate-limited.
- **"What if the AI is wrong?"** — It does not guess about orders: it either finds the order or says it can't and offers a human. Every conversation is in your inbox; you can take over any chat, any time.
- **"Can it take orders?"** — It can find the product, build the cart and send a checkout link. Payment stays on your Shopify checkout.
- **"How long to set up?"** — Catalogue answers today; order tracking within two working days.
- **"What does it cost me per chat?"** — A typical order-tracking chat is about one credit. Your subscription includes a monthly allowance; we top up if you grow.
- **"What if the customer writes in Arabic?"** — The agent replies in the customer's language automatically; the store's data comes back in English and it translates.
- **"Why not just use Shopify Inbox?"** — Shopify Inbox is one channel (the website) and its automation is canned replies. This is one brain across WhatsApp, Instagram and the site, with live lookups and a human handover.
- **"Can it give a discount?"** — No. It quotes the live Shopify price including sale prices; promo rules you give it, it repeats; it never invents an offer.
- **"Can it do returns / refunds / cancellations?"** — It explains the policy and reports order status; it cannot change anything. Those go to your team with a summary — read-only is deliberate.
- **"Orders placed by phone or in the showroom?"** — Lookup covers Shopify orders only. Ask what share is off-Shopify before promising anything; draft orders in Shopify would bring them into reach.
- **"Customer doesn't know the order number?"** — v1 needs order number + phone/email, both matching. Lookup by phone alone is a possible follow-up; don't promise a date.
- **"Is this your own software?"** — *Agree the wording with the boss before the room.* A truthful line that names no vendor: "The messaging platform is licensed and runs under our brand; the Shopify connection, the order-lookup service, the knowledge base and the setup are ours." Do not claim we built all of it.
- **"What does it cost me per month?"** — Do **not** quote the credit cost basis (that is our margin). Say: monthly fee with an allowance of conversations + one-time setup; Meta's WhatsApp fees passed through at cost; proposal follows tomorrow. The boss fixes the figure before the room.

---

## 9. Internal notes (not for the client)

- **This is the "bridge" deal.** He gets our brand on DM Champ now; we move him onto our own product when it can do the same. The live-data executor is our Phase 13 in `../CLAUDE.md` §15 — this engagement is the first real specification for it (order lookup with identity verification, trimmed responses, per-tenant secret storage).
- **The lookup service we build for him is not throwaway.** Write it as a generic "Shopify orders connector" behind a per-client key — it becomes the first connector in our own product.
- **Credit maths for the boss.** MAX tier: 0.25/reply + 0.25/tool call. 877 unallocated credits ≈ 3,500 AI replies or ≈ 875 order-tracking chats **in total — the AppSumo pool is a one-time allocation and does not refill monthly**; after it, every credit is bought at $0.10 (or BYOK on Pro). The sub-account **spending limit is a cap on how much of the agency pool he may draw, not a separate allowance and not monthly** — set it so a bot storm cannot drain the pool, raise it as he uses it, and price his monthly allowance on the $0.10 replacement cost, not on the free pool. WhatsApp Web pairing adds 50 credits/month per number.
- **BYOK does not zero MAX-tier costs** — only Pro (Claude Sonnet) replies become free with an Anthropic key. Don't promise "free AI replies" on this account.
- **Nothing was changed in the boss's DM Champ account today.** The MCP *Test connection* and the custom-function form were explored and cancelled; the tab was left on the EVA agent's AI Abilities page.

### Presenter's checklist (added after the independent review, 18 Sep)

**The night before**
- **White-label first.** Today's walkthrough was on `app.dmchamp.com` with vendor branding. If the boss screen-shares that, the client sees the vendor's name in the URL bar, logo and the "Connected to universal-commerce" message. Set the custom domain, logo and colours (*Settings → Advanced → White Labeling*) and create the ChooseMyRide sub-account **before** any screen is shown. Demo from the white-label domain only.
- **Pre-stage Part A** in the ChooseMyRide sub-account: MCP server added (`/api/ucp/mcp`), tools ticked on the agent, the `meta.ucp-agent.profile` instruction added to the agent (§4), and **one real search run in *Try Out*** — "Connected · 13 tools" proves the address, not the calls. Leave the agent **unpublished**; it stays in *Try Out* until the client agrees. If the search fails, build the `/search/suggest.json` custom function as the demo fallback.
- **Fallback if the live demo fails** (login, 2FA, internet, vendor down): a screen recording of *Test connection → Connected · 13 tools* and of one *Try Out* exchange, URL bar cropped; plus a no-login proof anyone can open in a browser: `https://choosemyride.ae/search/suggest.json?q=mogoo%2016&resources[type]=product&resources[limit]=5` — "this is the live data your store already publishes; the agent reads exactly this."
- **Get from the boss, in writing:** the monthly fee in AED, included conversations, setup fee, overage, pilot/notice terms, and the agreed wording for *"is this your software?"* (§8). None of these are in this brief, and the presenter must not improvise them — and must **never** read out the credit cost basis in §3.

**Thirty minutes before**
- Re-check the demo product: Mogoo Classic 16" Kids Bike, Blue, Dhs 285.03 (18 Sep price) — still in stock, same price? Pick a backup product.
- Sub-account, agent and MCP server exist and are ticked; agent not live.

**In the room**
- Open with the strongest line: *"Your store is on Shopify — this morning we connected an AI to your live catalogue with no password, first time, and it found all 512 products."*
- Say "MCP" only if asked: *"a standard way for Shopify to publish a menu of live lookups; we paste one address and the AI can search your catalogue with no password."*
- **Sizing questions to ask** (needed to price the proposal): chats per month across WhatsApp / Instagram / site; orders per month; share of orders not placed on Shopify; team hours currently covered; how many people will use the inbox.
- **Promise:** live catalogue, price and stock answers on the three channels; order status/tracking within ~two working days of his approval click; read-only; no payments in chat; identity check before any order; human handover; automatic translation. **Do not promise:** a price without the boss's sign-off; a date for Instagram/Messenger beyond "after Meta review"; voice notes or images; transcript export or a hosting region ("I'll confirm in writing"); order lookup by phone alone.
- **Close with a next step:** agreement to start; a 30-minute slot with the store owner this week for the Shopify approval click; the Shipping policy filled in *Settings → Policies*. Without a stated next step the two-day timeline cannot start.
- The client-facing page for the meeting is the published artifact "ChooseMyRide Agent Guide" (brand-neutral; no vendor name, no credentials, no costs) — this markdown file is **not** for the client.

---

## Sources

- DM Champ help: [Custom Functions](https://help.dmchamp.com/ai-automation/custom-functions/) · [Connect MCP servers](https://help.dmchamp.com/ai-automation/mcp-servers/) · [Connecting other tools](https://help.dmchamp.com/integrations/connecting-other-tools/) · [Chat widget](https://help.dmchamp.com/get-started/chat-widget/) · [Supported channels](https://help.dmchamp.com/messaging-channels/supported-channels/) · [AI bot setup](https://help.dmchamp.com/ai-automation/ai-bot-setup/)
- Shopify: [Storefront MCP server](https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront) · [Orders REST resource](https://shopify.dev/docs/api/admin-rest/latest/resources/order) · [Admin-created custom apps (deprecated for new apps)](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin) · [Client credentials grant — 24 h tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant) · [Dev Dashboard app creation](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) · Forum: [single-store custom app in 2026](https://community.shopify.dev/t/is-it-still-possible-to-create-a-custom-app-for-a-single-store-admin-storefront-access-without-partner-dashboard-cli/28387), [Admin API tokens from Dev Dashboard apps](https://community.shopify.dev/t/how-to-get-admin-api-tokens-using-apps-in-dev-dashboard/29472)
- Live probes 18 Sep 2026: `choosemyride.ae/meta.json`, `/api/ucp/mcp` (tools/list), `/api/mcp` (tools/list + call), `/search/suggest.json`, `/products.json`; app.dmchamp.com: `/custom-functions` (New function form), `/mcp-servers` (Add server + Test connection), `/sub-accounts`, `/agents/…/edit?tab=ai-abilities`
