# ResolveOS — Devpost submission draft

> Copy into the Devpost form. Every number below is either measured in the app (from its audit log)
> or from PayPal's own documentation, linked. Before submitting, add the video link at the bottom.

## Tagline

Two sides. One resolution. AI agents for the buyer and the merchant negotiate a fair refund, both
people approve, and PayPal settles it.

## Inspiration — the problem with PayPal today

When a PayPal payment goes wrong, one formal route is a dispute in PayPal's Resolution Center. Take "item not received":

- The buyer opens a dispute in the Resolution Center.
- Eligible disputes have an inquiry window of up to **20 days** unless escalated earlier.
- If unresolved, either party may escalate to a claim within that window, after which PayPal may decide the outcome.
  ([PayPal: dispute lifecycle](https://developer.paypal.com/disputes/disputes-lifecycle))

The hardest cases are the ones where **both sides are acting in good faith**. The carrier says
"delivered", the buyer says it never arrived, and there is no signature or photo. Neither side can
prove it, so it turns into days of messages and an adversarial claim, and the relationship is lost
either way.

To be clear about what already exists: once a dispute is open, PayPal's Resolution Center lets
buyer and seller message each other and make offers during that inquiry stage. What we did not find
is help *before* a dispute is opened. That is the step where an AI advocate for each side, working
within private limits, could reach a compromise both approve and settle it straight away.

## What it does — the solution

ResolveOS is a pre-dispute settlement layer on top of PayPal:

1. **Report:** the buyer opens a case on a real PayPal (sandbox) payment. ResolveOS reads the
   capture from PayPal's API and labels it *Verified from PayPal*.
2. **Evidence:** both sides add evidence, and the merchant confirms its private limit. Every item
   is labelled as verified by PayPal or as a party's claim.
3. **Negotiate:** a **buyer agent** and a **merchant agent** negotiate in the Negotiation Room.
   - They cite evidence by code and list what is unproven.
   - Each makes structured offers within its own side's **private** limit (the buyer's floor and
     the merchant's ceiling), which the other side never sees.
   - A neutral orchestrator runs the turns, and the screen shows the two positions closing in.
4. **Approve:** if they agree, the buyer and the merchant each approve the *exact* terms from their
   own session, or ask for a revision.
5. **Settle:** ResolveOS executes the refund through **PayPal's Payments API** against the original
   capture, with a fixed `PayPal-Request-Id` to guard against duplicate refund execution.
6. **Receipt:** a verified receipt shows PayPal's refund ID, the capture ID and the full audit trail.

If the evidence cannot support a fair deal, the agents **do not force one**: the case ends with no
agreement or with escalation, and no money moves.

## How we built it

**PayPal (sandbox):**
- OAuth client credentials.
- **Orders v2**: create an order, buyer approval on PayPal, capture.
- **Payments v2**: show capture (verified evidence), **refund a captured payment** (full refunds
  with an empty body, partial refunds with an amount), and show refund for reconciliation.
- **Webhooks**: signature verification against the raw body with PayPal's certificate,
  deduplicated by event ID. A signed event only prompts a fresh PayPal lookup, and PayPal's answer
  updates the case and every open screen. A new PayPal dispute escalates an unfinished case and
  cancels any unpaid settlement. Pending refunds are also checked every minute in case an event
  never arrives.

**AI:**
- Two agents on **Groq (`openai/gpt-oss-120b`)**, behind a provider interface that works with any
  OpenAI-compatible API.
- Each turn is one JSON-mode call returning a structured `AgentTurn`: reasoning, evidence codes,
  open questions, the options it weighed, and an offer.
- A labelled deterministic "demo engine" exists for offline presentations.
- We also used Claude Code as a coding assistant.

**A team of AI roles, not a chatbot:**
- An **injection screen** flags party text written to manipulate an AI.
- A neutral **case investigator** uses the **PayPal Agent Toolkit** to choose and read PayPal's own
  records: payment and seller protection, shipment tracking, and dispute history.
- A **buyer agent** and a **merchant agent** negotiate, each with limits the other never sees.
- An **independent reviewer**, which knows neither limit, tells both people whether the terms fit
  the evidence and what each side gives up.
- Only two people can approve. Server code alone moves money.

**The guardrails, which are the core of the design:**
- The model only ever **proposes**.
- A deterministic server checks every answer: schema; evidence codes that actually exist, with at
  least one behind every position; no private limit written in any text; currency;
  full or partial refund maths; the merchant agent never above the merchant's ceiling; the buyer
  agent never below the buyer's floor; "accept" really matching the other side's offer.
- An invalid answer is rejected and retried once. If it still fails validation, an error is surfaced rather than inventing an answer.
- Money moves only in a separate payment service, only after both people approved the same terms
  hash, and only with amounts loaded from the database, never from the model or the browser.
- A timeout is "unknown, needs reconciling", resolved by re-sending the same request ID, never
  treated as "failed". Only a definite PayPal refusal counts as failed.

**Stack:** Vue 3 + TypeScript + Tailwind, Node + Express + Zod, PostgreSQL + Drizzle, and
Server-Sent Events for the live negotiation.

**Tests:** Repository includes API, frontend unit and Playwright end-to-end test suites, plus a Postman collection. Verify current passing counts using fresh test results before quoting totals.

## Impact (what we measured, and what we did not)

| | |
| --- | --- |
| **One observed demo run** | In one verified hosted Sandbox run (case RA-1100), time from complaint to PayPal-confirmed refund was **8 min 2 s**: live AI agents negotiated for **9 s over 2 turns**, the two approvals took **2 min 40 s**, and PayPal confirmed the **$30.00** refund in **2 s**. Both "people" were operated by us during the test. It is **not** evidence of typical speed. Real buyers and merchants take longer to respond. The app records these timings from every case's audit log, so they can be measured on real use. |
| **PayPal's process, for context only** | PayPal's dispute inquiry stage can last **up to 20 days** before a dispute can be escalated to a claim ([source](https://developer.paypal.com/disputes/disputes-lifecycle)). That is a **maximum window, not an average resolution time**, and we have no data on how long PayPal disputes take on average. We do not claim ResolveOS is faster than PayPal's process. |
| **Negotiation evaluation** | We compared the AI agents with a simple rules-based negotiator on 7 scripted scenarios. See `docs/EVALUATION.md` for the method, the raw results and the limits. It is a small, scripted set, not a statistical result. |
| **What it could change (hypothesis)** | Before a dispute is opened, both sides get an advocate and a structured, approved settlement, which may avoid an adversarial claim. We have not validated this with real users yet. |
| **Who it's for** | Small online sellers and their customers on PayPal. |

*(If you interview sellers before submitting, add their quotes here.)*

## What makes it different (USP)

- **Two-sided.** Chargeback tools work for the merchant *after* a dispute. ResolveOS gives
  **both** people an advocate *before* one.
- **AI that checks before it argues.** An investigator reads PayPal's own records first, so the agents negotiate from verified facts, and only a PayPal record can mark a claim as proven.
- **AI negotiates, people decide, code guards the money.** The agents have no access to payments;
  every amount is enforced by the server; a refund needs two explicit approvals of the same terms.
- **It actually settles.** It is not a recommendation engine: it ends in a real, idempotent PayPal
  refund with a verifiable refund ID.
- **Honest by design.** Evidence is labelled verified or claimed, uncertainty is stated, seeded data
  can never be refunded, and success is shown only when PayPal confirms it.

## Challenges we ran into

- Making "the AI agreed" safe: we moved every money rule out of the prompt and into server code.
- Payment safety: unknown outcomes, duplicate clicks and webhook spoofing.
- Free-tier AI rate limits can slow or interrupt live negotiations; model quotas and fallback behavior depend on the deployment configuration.
- The PayPal Agent Toolkit's tool filter hides tools from a model but does not stop a direct call, so our agents never hold it: they get three fixed, read-only checks.

## What's next

- Real carrier tracking lookups as verified evidence.
- File and photo evidence.
- PayPal Disputes API integration, so an unresolved case can hand its evidence package straight to
  a formal dispute.
- Merchant policies as reusable templates.

## Try it

- **Hosted Sandbox demo:** https://resolveos-paypal.onrender.com (demo access code required; Render Free may take time to wake).
- **Repo:** https://github.com/elkantongg/ResolveOS-paypal (MIT licensed). Setup steps are in the README.
- **Video:** ADD PUBLIC YOUTUBE LINK BEFORE SUBMISSION.

> Independent hackathon project. Not affiliated with or endorsed by PayPal. Sandbox only. ResolveOS
> does not replace PayPal's Resolution Center.
