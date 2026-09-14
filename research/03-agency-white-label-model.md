# 03 — The agency / white-label model

This is the machinery that makes `foundergrowth.ai` possible, and it is the part of the product that is genuinely hard to rebuild.

## What "white-label" covers

When configured, **zero DM Champ branding is visible to clients**. Their own docs put it as: clients "have no idea they are using the platform under the hood."

**Rebrandable:**
- App name and company legal name
- Logo (with a separate dark-mode version), favicon, square app icon
- Primary / accent / success / danger colours
- Heading and body fonts
- Six pre-made themes (Nebula, Bloom, Ember, Tidal, Mono, Original)
- Page backgrounds, card styles, corner radius, decorative icons, layout density
- Login page tagline and background (gradient or uploaded image)
- Outbound emails: logo, primary colour, footer tagline, up to four custom links, default language
- SEO metadata, custom Terms/Privacy URLs, support email

**Hideable:** help menu, API reference, changelog. A white-label domain can also be narrowed to expose only certain modules (e.g. Lead Finder or Social Scheduler only).

**Requires:** Agency or Agency Unlimited tier, or AppSumo tiers 3–6. **Not available on the Business plan.**

## Custom domain setup

1. Enter the subdomain (`app.youragency.com`) in the Custom domain card
2. Add a **CNAME** at the registrar pointing to `tenants.youraiconnector.com`
3. Platform detects DNS and auto-provisions SSL (Let's Encrypt) within minutes to hours

Separate branded domains are available for docs, API and MCP endpoints, each with its own certificate.

**Cloudflare gotcha:** SSL/TLS must be set to **Full (strict)** or you get redirect errors.

> The CNAME target `tenants.youraiconnector.com` is an interesting tell — it suggests the multi-tenant white-label layer may be shared with, or spun out of, a separate product ("YourAIConnector"). Worth noting but not decision-relevant.

**Email sending** can stay on their infrastructure (with our branding) or route through our own Mailgun / SMTP (Postmark, SES, SendGrid, Resend). Different client groups can use different sender identities.

---

## Sub-accounts — how clients are managed

Creating a client is a three-step modal: account details (name + email = their login) → business info (name, address, country, language, timezone) → features (channels, AI capabilities, contact limits, seats, optional setup wizard). You choose whether to email the client their credentials or hold them yourself.

**Agency dashboard gives us:**
- Sub-accounts table with credit usage and campaign status
- **"Sign in as user"** — support a client without knowing their password
- Read-only inbox view per sub-account
- Bulk-copy campaigns and agents into client accounts
- **Snapshots** — package an entire setup (campaigns, agents, knowledge bases) as a reusable template and deploy it to many sub-accounts at once
- Credit allocation, notification routing (client vs. agency), access controls
- Soft/hard block a client without deleting their data

**Client sees:** their own contacts, campaigns and AI agents; a billing page (reselling mode only); team management; and nothing we've hidden via Menu Visibility.

---

## The credit-markup mechanism (this is the clever bit)

A sub-account's "spending limit" is **a cap on how much of our credit pool that client may spend — not a separate pot handed to them.** Every client action deducts from both their limit and our agency balance at once.

On top of that, we set a **per-action rate per sub-account**. Their own worked example: a client burns **0.5 credits per action while our pool pays 0.2**. That 2.5× spread is our margin, applied automatically, without us having to price clients at a loss or reconcile anything manually.

## Two billing modes

| | **Managed** (default) | **Reselling** (Stripe) |
|---|---|---|
| Payment | We invoice however we already do — bank transfer, existing accounting tool | Client pays through our connected Stripe, our markup applied automatically |
| Client sees | No plan selector, no payment page at all | Full billing portal on our domain: plans, prices, invoices, cards |
| Trials | Hand-managed | Built-in, 1–90 days per plan |
| Signup | We create the account | Client self-serves via a payment link, then an auto-provisioned guided wizard |
| Credit top-ups | We allocate | Client buys their own; webhook auto-recharge prevents cutoff |

**Managed mode is likely the right starting point for us** — it works in regions where Stripe is awkward, fits existing invoicing, and keeps full control while we're learning the product. Reselling mode is the scale play once the offer is proven.

---

## Stated restrictions

- A single sub-account cannot be shared across multiple brands
- Client pricing must stay above platform minimums (the minimums aren't published)
- When a client's credits run out, the AI stops until they buy more

---

## Why this matters for build-vs-buy

If we build our own, **this entire layer is on us** and it is not small:

- Multi-tenant data isolation
- Per-tenant theming (colours, fonts, logos, themes, login pages, email templates)
- Custom domain onboarding with automated ACME/Let's Encrypt certificate issuance and renewal
- "Sign in as user" impersonation with a proper audit trail
- A credit ledger with per-tenant markup rates, spending caps, and atomic double-deduction
- Stripe Connect billing, plans, trials, invoices, auto-recharge webhooks
- Snapshot/template export-import across tenants
- Per-tenant notification routing and granular menu/feature visibility

Realistically this is **several months of work on its own**, entirely separate from the AI agent and the messaging integrations. It is unglamorous, security-sensitive plumbing — and it is exactly what we would be renting for $248.50/month.
