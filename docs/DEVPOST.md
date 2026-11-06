# ResolveOS — Devpost submission draft

> Copy into the Devpost form. Every number below is either measured in the app (from its audit log)
> or from PayPal's own documentation, linked. Before submitting, replace the bracketed items.

## Tagline

Two sides. One resolution. AI agents for the buyer and the merchant negotiate a fair refund, both
people approve, and PayPal settles it.

## Inspiration — the problem with PayPal today

When a PayPal payment goes wrong, the main path is a formal dispute. Take "item not received":

- The buyer opens a dispute in the Resolution Center.
- The two sides then have an inquiry stage of up to **20 days** to sort it out themselves.
- After that, it can be escalated to a claim that PayPal decides.
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
2. **Evidence:** both sides add evidence. Every item is labelled as verified by PayPal or as a
   party's claim.
3. **Negotiate:** a **buyer agent** and a **merchant agent** negotiate in the Negotiation Room.
   - They cite evidence by code and list what is unproven.
   - Each makes structured offers within its own side's **private** limit (the buyer's floor and
     the merchant's ceiling), which the other side never sees.
   - A neutral orchestrator runs the turns, and the screen shows the two positions closing in.
4. **Approve:** if they agree, the buyer and the merchant each approve the *exact* terms from their
   own session, or ask for a revision.
5. **Settle:** ResolveOS executes the refund through **PayPal's Payments API** against the original
   capture, with a fixed `PayPal-Request-Id` so it can never refund twice.
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
  deduplicated by event ID. Events: `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.REFUND.PENDING`,
  `PAYMENT.REFUND.FAILED`, `PAYMENT.CAPTURE.COMPLETED`.

**AI:**
- Two agents on **Groq (`openai/gpt-oss-120b`)**, behind a provider interface that works with any
  OpenAI-compatible API.
- Each turn is one JSON-mode call returning a structured `AgentTurn`.
- A labelled deterministic "demo engine" exists for offline presentations.
- We also used Claude Code as a coding assistant.

**The guardrails, which are the core of the design:**
- The model only ever **proposes**.
- A deterministic server checks every answer: schema; evidence codes that actually exist; currency;
  full or partial refund maths; the merchant agent never above the merchant's ceiling; the buyer
  agent never below the buyer's floor; "accept" really matching the other side's offer.
- An invalid answer is rejected and retried once. Nothing is ever invented in its place.
- Money moves only in a separate payment service, only after both people approved the same terms
  hash, and only with amounts loaded from the database, never from the model or the browser.
- A timeout is "unknown, needs reconciling", resolved by re-sending the same request ID, never
  treated as "failed".

**Stack:** Vue 3 + TypeScript + Tailwind, Node + Express + Zod, PostgreSQL + Drizzle, and
Server-Sent Events for the live negotiation.

**Tests:** 47 API tests, 10 web unit tests and 4 Playwright end-to-end tests.

## Impact (measured)

| | |
| --- | --- |
| **Measured, in the app** | Complaint to PayPal-confirmed refund in **1 min 31 s** in our demo run (case RA-1102). The agents negotiated in **14 s** over 5 turns, the two approvals took 30 s, and PayPal confirmed the refund in 2 s. These figures come from the case's own audit log and show on every receipt; the dashboard reports the median across resolved cases. |
| **Compared with** | PayPal's dispute inquiry stage of up to **20 days** ([source](https://developer.paypal.com/disputes/disputes-lifecycle)). |
| **What it changes** | A fair compromise reached and paid in minutes, instead of an adversarial claim. Both sides keep the relationship, and no one gives up their right to PayPal's formal process. |
| **Who it's for** | Small online sellers and their customers on PayPal, who can't afford a chargeback-management service and lose disputes they could have settled. |

*(If you interview sellers before submitting, add their quotes here.)*

## What makes it different (USP)

- **Two-sided.** Chargeback tools work for the merchant *after* a dispute. ResolveOS gives
  **both** people an advocate *before* one.
- **AI negotiates, people decide, code guards the money.** The agents have no access to payments;
  every amount is enforced by the server; a refund needs two explicit approvals of the same terms.
- **It actually settles.** It is not a recommendation engine: it ends in a real, idempotent PayPal
  refund with a verifiable refund ID.
- **Honest by design.** Evidence is labelled verified or claimed, uncertainty is stated, seeded data
  can never be refunded, and success is shown only when PayPal confirms it.

## Challenges we ran into

- Making "the AI agreed" safe: we moved every money rule out of the prompt and into server code.
- Payment safety: unknown outcomes, duplicate clicks and webhook spoofing.
- Free-tier AI rate limits (8,000 tokens a minute): the provider waits and retries automatically.

## What's next

- Real carrier tracking lookups as verified evidence.
- File and photo evidence.
- PayPal Disputes API integration, so an unresolved case can hand its evidence package straight to
  a formal dispute.
- Merchant policies as reusable templates.

## Try it

- **Repo:** [https://github.com/elkantongg/resolve-ai] (MIT licensed). The setup steps are in the
  README.
- **Video:** [YouTube link]

> Independent hackathon project. Not affiliated with or endorsed by PayPal. Sandbox only. ResolveOS
> does not replace PayPal's Resolution Center.
