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

Three conversations the agent can hold once connected. (Illustrative wording; the product data is what the agent would actually fetch.)

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
> **Agent:** Your last order (#1102, March) was a Mogoo Classic 14" in Yellow. The same model is available in Blue, Red and Green right now at Dhs. 229.03. Shall I check a 16" for the older one?

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

- **✔ The store's policies/FAQ tool is empty.** The second Shopify endpoint, `https://choosemyride.ae/api/mcp`, exposes `search_shop_policies_and_faqs`; our test question about returns and delivery returned `[]`. Most likely the store's policy pages aren't filled in Shopify admin (**Settings → Policies**). Cheap fix for the client, and until then the agent answers policy questions from the knowledge base we build from his website instead.

- **✔ Two more public, no-token endpoints exist**, useful as a fallback custom function if ever needed:
  `https://choosemyride.ae/search/suggest.json?q=<words>&resources[type]=product&resources[limit]=5` (title, price, sale price, in stock, link, image) and `https://choosemyride.ae/products.json` (the whole catalogue).

- **✔ The boss's DM Champ login is the agency account.** `huzefa@webenliven.com` on app.dmchamp.com: AppSumo **Tier 4**, **20 sub-accounts** on the plan, **1 used** (Al Taher Chemicals, owner `huzefaraja53@gmail.com` — that is the foundergrowth.ai workspace), **912 credits in the agency pool, 877 unallocated**. White-labeling is included (Settings → Advanced → White Labeling: custom domain, logo, colours, branded email). ChooseMyRide becomes **sub-account #2** with its own credit allowance and spending limit.

- **✔ DM Champ's own support bot already confirmed the approach** to the boss in-app: white-label yes; Shopify yes, "using Custom Functions… an Admin API access token with read_orders permission… attach that function to your agent". One correction to what it said — see the token note in Part B.

---

## 5. The setup, click by click

### Part A — live catalogue, prices and stock (≈ 15 minutes, no credentials)

Do this in the **ChooseMyRide sub-account** (create it first: *Sub Accounts → Add account → Account: owner first name / last name / email → Business → Features*).

1. Left menu **AI Studio → MCP Servers → Add server**.
2. **Name:** `ChooseMyRide Shopify catalogue`
3. **Server URL:** `https://choosemyride.ae/api/ucp/mcp`
4. **Auth method:** leave *API key / header*. **Header name / value:** leave empty (Shopify needs none).
5. **Test connection** → expect *Connected to universal-commerce · 13 tools*.
6. Untick the tools the agent should not have. Recommended for launch: keep `search_catalog`, `lookup_catalog`, `get_product`, `create_cart`, `update_cart`, `get_cart`; **turn off** `complete_checkout` and the other checkout/cancel tools — the agent should send a checkout *link*, never take payment inside the chat.
7. **Add server.**
8. **AI Studio → AI Agents →** the ChooseMyRide agent **→ AI Abilities → MCP servers →** tick the server and its tools **→ Save changes**. (Up to 5 servers and 40 tools per agent.)
9. Agent editor **→ Try Out →** type *"do you have a 16 inch kids bike, how much"* and watch it fetch. Then **Publish to live**.

Optional second server, once the client fills his Shopify policies: **Server URL** `https://choosemyride.ae/api/mcp` (tool `search_shop_policies_and_faqs`).

### Part B — order status, tracking and purchase history (1–2 days, needs one Shopify permission)

**The Shopify side — what we need from the client.** Read-only access to orders. In Shopify that is an app with the `read_orders` scope (`read_all_orders` if he wants history older than 60 days — which he will, for "what did I buy last time"). The client's store owner has to approve it; a staff member needs *App development → Develop* permission.

**Token note — this is the part DM Champ's bot got slightly wrong.** Their docs and their support bot describe pasting a permanent `shpat_…` token into the function's header. Shopify **stopped issuing those to new apps** (the "Develop apps" screen in admin no longer creates them; existing tokens still work). A new app in Shopify's **Dev Dashboard** gives a Client ID and secret, and the quick token from those **expires every 24 hours** — useless as a static header. The permanent, non-expiring token is still obtainable, but only through a **one-time OAuth authorisation** that needs a developer with a redirect URL. Shopify staff on the developer forum: it *"gives you a non-expiring offline token that works exactly like the old legacy tokens — it stays valid until the app is uninstalled."* That is a 30–60 minute job for us, once.

**Recommended architecture: a small read-only lookup service we host, in front of Shopify.** Rather than pasting the Shopify token into DM Champ, we run a tiny endpoint (a Cloudflare Worker or a route on our own server) that:

- holds the Shopify token (DM Champ never sees it — if the DM Champ account is ever compromised, the client's Shopify is not);
- takes `order_number` + `phone_or_email`, fetches the order, and **only returns it if the contact matches** — identity checking in code, not in a prompt;
- returns a **trimmed, human-readable** JSON (status, carrier, tracking number, tracking link, items, ETA) instead of Shopify's several-hundred-line order object — cheaper tokens, fewer AI mistakes;
- answers in under 10 seconds (DM Champ's limit) and returns clear error text ("No order 1187 for that phone number") that the AI can relay.

A no-code alternative if we don't want to host anything: **Make.com** (Shopify connector, handles Shopify login for you) with *Custom webhook → Shopify: Search orders → Webhook response*. DM Champ's own docs recommend Make/n8n for exactly this because they can return data to the AI (plain Zapier cannot).

**The DM Champ side — the custom function, field by field.** *AI Studio → Custom Functions → New function*:

| Field | Value |
|---|---|
| **Name** | `lookup_order` |
| **Description** | `Looks up a ChooseMyRide order by order number and verifies it belongs to the customer. Returns status, courier, tracking number and link, items and expected delivery.` |
| **AI action** | `Call this when a customer asks about an order, delivery, tracking, or what they bought. Ask for the order number AND the phone number or email used at checkout before calling. If the result says no match, tell the customer politely and offer to connect a human. Never reveal an order to someone whose phone/email does not match.` |
| **Method** | `GET` |
| **URL** | `https://<our-lookup-service>/choosemyride/orders` |
| **Skip system data** | leave **off** (DM Champ then also sends `system.contact` — the WhatsApp number the customer is writing from, which the service can use as a second check) |
| **Headers** | `Authorization` = `Bearer <a key we issue for this client>` |
| **Input parameter 1** | name `order_number` · type `query_param` · **Required** on · description `The order number the customer gives, digits only, e.g. 1187` |
| **Input parameter 2** | name `contact` · type `query_param` · **Required** on · description `The phone number or email address the customer used when ordering` |
| **Response mapping** | leave empty (the service already returns only what's needed) |
| **Execution limits** | **Read-only function** on · **Serve cached result on repeat calls** on · **Max runs per conversation** `5` · **Max runs per time window** `10` within `60` minutes |
| **Test** | fill a real order number + contact → **Run test** → check the JSON → **Create function** |

Then **AI Agents → the agent → AI Abilities → Custom functions →** tick `lookup_order` **→ Save changes**, and test in **Try Out** before **Publish to live**.

If someone insists on calling Shopify directly from DM Champ (not recommended — token in a third party, no identity check, giant responses), the shape is: **GET** `https://xnk706-rr.myshopify.com/admin/api/2026-07/orders.json?status=any` · header `X-Shopify-Access-Token: <token>` · parameter `name` as `query_param`, required (Shopify's `name` is the order number with `#`) · response mapping to `orders` only. Fields the AI needs are `fulfillment_status`, `financial_status`, `fulfillments[].tracking_company / tracking_number / tracking_url / shipment_status`, `line_items[].title`.

### Part C — putting the agent where his customers are

- **Website chat bubble on the Shopify store.** DM Champ: **Settings → Channels → Website chat widget → Manage → Channels & Embed** → under *Route these chats to* pick the agent → copy the snippet (`<script src="https://api.dmchamp.com/v1/chat-widget/CONFIG_ID?agent=AGENT_ID"></script>`; on the white-label domain the host differs). Shopify admin: **Online Store → Themes → ⋯ → Edit code → `theme.liquid`** → paste just above `</body>` → **Save**. Live on every page in a minute.
- **WhatsApp.** Two options: **WhatsApp Web pairing** — his existing number, scan a QR the way you pair WhatsApp on a laptop, live in five minutes, unofficial; or **WhatsApp Business API** — rent a number through the platform or bring his own; Meta-official, supports message templates, takes longer. Group chats are never answered on either. **Note for pricing:** Meta's WhatsApp pricing change on **1 October 2026** makes replies inside the 24-hour window chargeable per message — any quote needs a clause for it.
- **Instagram DMs / Facebook Messenger** — connected under Settings → Channels with his Meta Business login.
- **Human handover.** In the agent's *AI Instructions → Escalation & Wrap-up → Alert Human When*, write the rules: refunds, damaged goods, angry customer, anything the agent can't find. His team replies from the same inbox; the AI stays quiet on that thread until handed back.

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

---

## 9. Internal notes (not for the client)

- **This is the "bridge" deal.** He gets our brand on DM Champ now; we move him onto our own product when it can do the same. The live-data executor is our Phase 13 in `../CLAUDE.md` §15 — this engagement is the first real specification for it (order lookup with identity verification, trimmed responses, per-tenant secret storage).
- **The lookup service we build for him is not throwaway.** Write it as a generic "Shopify orders connector" behind a per-client key — it becomes the first connector in our own product.
- **Credit maths for the boss.** MAX tier: 0.25/reply + 0.25/tool call. 877 unallocated credits ≈ 3,500 AI replies or ≈ 875 order-tracking chats. Allocate ChooseMyRide a monthly limit on the sub-account so a bot storm cannot drain the agency pool.
- **BYOK does not zero MAX-tier costs** — only Pro (Claude Sonnet) replies become free with an Anthropic key. Don't promise "free AI replies" on this account.
- **Nothing was changed in the boss's DM Champ account today.** The MCP *Test connection* and the custom-function form were explored and cancelled; the tab was left on the EVA agent's AI Abilities page.

---

## Sources

- DM Champ help: [Custom Functions](https://help.dmchamp.com/ai-automation/custom-functions/) · [Connect MCP servers](https://help.dmchamp.com/ai-automation/mcp-servers/) · [Connecting other tools](https://help.dmchamp.com/integrations/connecting-other-tools/) · [Chat widget](https://help.dmchamp.com/get-started/chat-widget/) · [Supported channels](https://help.dmchamp.com/messaging-channels/supported-channels/) · [AI bot setup](https://help.dmchamp.com/ai-automation/ai-bot-setup/)
- Shopify: [Storefront MCP server](https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront) · [Orders REST resource](https://shopify.dev/docs/api/admin-rest/latest/resources/order) · [Admin-created custom apps (deprecated for new apps)](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin) · [Client credentials grant — 24 h tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant) · [Dev Dashboard app creation](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) · Forum: [single-store custom app in 2026](https://community.shopify.dev/t/is-it-still-possible-to-create-a-custom-app-for-a-single-store-admin-storefront-access-without-partner-dashboard-cli/28387), [Admin API tokens from Dev Dashboard apps](https://community.shopify.dev/t/how-to-get-admin-api-tokens-using-apps-in-dev-dashboard/29472)
- Live probes 18 Sep 2026: `choosemyride.ae/meta.json`, `/api/ucp/mcp` (tools/list), `/api/mcp` (tools/list + call), `/search/suggest.json`, `/products.json`; app.dmchamp.com: `/custom-functions` (New function form), `/mcp-servers` (Add server + Test connection), `/sub-accounts`, `/agents/…/edit?tab=ai-abilities`
