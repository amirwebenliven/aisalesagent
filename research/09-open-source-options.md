# 09 — Open-source foundations: what exists, and what the licences allow

**Question:** is there an open-source project we could fork and turn into our own white-label AI sales agent product?

**Answer:** there are excellent open-source *components*, but **no open-source project that is our product** — and there's a structural reason for that, not an accident.

---

## The licence map

Checked directly against each project's licence file on 24 August 2026. GitHub's "NOASSERTION" label means it couldn't auto-classify — which is itself a signal to read the file.

| Project | Stars | Licence | Can we resell it as a white-label SaaS? |
|---|---|---|---|
| **Chatwoot** | 36,100 | MIT Expat (core); `enterprise/` separate | **Yes** — MIT explicitly grants sell + sublicense |
| **Flowise** | 55,400 | Apache 2.0 (core); `enterprise/` separate | **Yes** |
| **WAHA** | 7,300 | Apache 2.0 | **Yes** |
| **Rasa** | 21,300 | Apache 2.0 | **Yes** |
| **Botpress** | 14,900 | MIT | **Yes** |
| **Dify** | 153,400 | Apache 2.0 **+ restrictions** | **No** — prohibits multi-tenant SaaS; forbids removing their logo |
| **n8n** | 202,200 | Sustainable Use License | **No** — restricts hosting for third parties as a service |
| **Typebot** | 10,300 | FSL-1.1-Apache-2.0 | **No** — Functional Source License blocks competing use for 2 years per release, then converts to Apache 2.0 |
| **Chaskiq** | 3,600 | AGPL-3.0 **+ Commons Clause** | **No** — the clause removes the right to Sell, incl. hosting fees |
| Evolution API | 9,400 | Unclassified — **verify before use** | Unknown |

### The pattern

Look at which projects restrict us: **Dify, n8n, Typebot, Chaskiq.** These are exactly the projects that have built a multi-tenant, white-labelable platform layer.

That layer *is* their commercial product. Dify's licence spells it out — you may use it as a backend or internal tool, but not run it as multi-tenant SaaS, and you may not remove their branding from the console. **Nobody open-sources the thing they sell.**

The permissively licensed projects (Chatwoot, Flowise, WAHA, Rasa, Botpress) are components — inboxes, channel gateways, agent frameworks. Genuinely useful, but none of them is a resellable product on its own.

**So the absence isn't a gap in the ecosystem. It's the ecosystem telling us where the value is.** The part we'd have to build ourselves is the same part DM Champ charges for.

---

## What we can legally assemble

| Layer | Source | Licence | Effort with AI assistance |
|---|---|---|---|
| **1. Channels + inbox** — WhatsApp, Instagram, Messenger, Telegram, email, web chat; contacts, conversations, agent routing, automations | **Chatwoot** core | MIT | Integration + customisation, **weeks** instead of months |
| **2. AI agent** — playbook prompting, knowledge retrieval, tool calling, memory, human handoff, reply pacing | Write it ourselves, or **Flowise** core for a visual builder | Apache 2.0 | **1–3 weeks** |
| **3. WhatsApp transport** (if not going direct to Meta Cloud API) | **WAHA** | Apache 2.0 | Days |
| **4. Multi-tenant white-label + credit ledger + reseller billing** | **Nothing exists. We build it.** | — | **6–10 weeks** |

### Important caveat on Chatwoot

Chatwoot's MIT core gives us channels, inbox, contacts and multiple accounts. But **its own branding/white-label features live in the `enterprise/` directory under commercial terms**, not MIT.

So we would delete `enterprise/` and **build our own branding and tenancy layer on the MIT core**. That's the normal, legitimate pattern for this licensing model — but it means layer 4 above is genuinely ours to write, not something we inherit.

---

## What this does to the estimate

Forking Chatwoot removes most of build-system 2 and much of system 4 from `04-build-vs-buy.md`:

| | Original | With AI assistance | With AI + Chatwoot base |
|---|---|---|---|
| AI agent layer | 4–8 weeks | 1–3 weeks | 1–3 weeks |
| Omnichannel messaging | 3–6 months | 6–10 weeks | **mostly free** |
| Multi-tenant white-label | 3–5 months | 6–10 weeks | 6–10 weeks — unchanged |
| The application | 3–6 months | 4–8 weeks | **mostly free** |
| **Meta App Review** | weeks, rejection-prone | unchanged | **unchanged** |

**Realistic: 3–5 months of build to a resellable product**, with Meta approval (1–3 months) running partly in parallel.

That's meaningfully better than the 6–9 months in `04`, and much better than my original 12–24. The open-source base is a real accelerator — it just doesn't touch the two things that were always the hard parts: **the tenancy/billing layer, and Meta.**

---

## "Can't we just remove their branding and call it ours?"

Worth writing down, because it's a common and reasonable-sounding assumption — and it's wrong in a way that carries real business risk.

**Removing a licence notice does not remove the licence.** Copyright attaches automatically when code is written. The licence is the *only* thing granting permission to use it. Delete the notice and you haven't freed the code — you've removed your own legal basis for using it.

**Changing the UI doesn't create a new project.** Modified code is a *derivative work*, explicitly covered by the original copyright. No amount of refactoring converts someone else's project into ours. The only clean escape is a clean-room rewrite by people who have never seen the original — at which point we're building from scratch anyway.

**It gets found, and the finding is automated:**
- Schema names, migration filenames and timestamps, route shapes, variable naming and even comment typos survive heavy refactoring. Rails apps are especially identifiable via `schema.rb` and migration timestamps.
- Licence scanners (FOSSA, Black Duck, Snyk) are standard in acquisitions, funding rounds and enterprise security reviews. They exist to catch exactly this.
- AGPL enforcement is actively pursued and has been litigated successfully.

**Why it's especially dangerous for this business:** we would be selling a white-label platform to agency clients. A successful claim means forced publication of our source, damages, and an injunction — and an injunction stops **every client's AI agent simultaneously**. Those clients believe the product is ours, so we'd face their claims too. That is an extinction-level risk taken on to save a few weeks.

**And it's unnecessary, because MIT already permits everything we want.** Under Chatwoot's MIT core we may legally: strip all Chatwoot branding, apply our own, modify anything, keep our changes closed-source, sell at any price, and never ask permission. The sole obligation is retaining the MIT copyright notice somewhere in the distribution — a `LICENSES` file or a credits page entry. Not on the login screen; not visible to clients.

**So the decision is not "comply with a restrictive licence or strip it." It is "use the MIT project rather than the AGPL one"** — and get the same outcome with none of the exposure. Where a restricted project is genuinely needed (Dify, Chaskiq, n8n), each sells a commercial licence; paying is cheap next to the alternative.

## Two lessons worth keeping

1. **"Open source" is not one thing.** MIT and Apache 2.0 let you sell. AGPL, Commons Clause, FSL, Sustainable Use and "Apache + restrictions" do not — at least not without a paid commercial licence. Always read the licence file before designing around a project.
2. **Check for `enterprise/` and `.ee.` directories.** Chatwoot, Flowise and n8n all use the same trick: permissive core, commercial layer in a carved-out directory. That directory is usually the exact feature you wanted.

---

## Verdict

The open-source route is **viable and worth taking if we decide to build** — fork Chatwoot, add our own AI agent and tenancy layer.

It does not change the recommendation in `04`. Reselling still gets us earning in weeks rather than months, the distribution problem is identical either way, and Meta approval remains the gate that no amount of forking or AI assistance removes.

What it does change: **if we do decide to build, the project is now a 3–5 month one, not a two-year one.** That's a materially different bet, and worth re-examining if the account question in `07-verified-in-app.md` resolves badly and reselling turns out not to be available to us.
