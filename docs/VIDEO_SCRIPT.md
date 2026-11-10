# ResolveOS — hosted hackathon demo script

**Target:** 2:45–2:55 (under three minutes). Record the **deployed** PayPal Sandbox experience at https://resolveos-paypal.onrender.com. Use one transaction and case throughout the recorded journey.

## Before recording

- **Do not run `pnpm db:reset --yes` or wipe Neon.** Keep the verified completed cases and audit trails. Create a fresh PayPal Sandbox transaction and case for the video.
- Open the deployed site beforehand so the Render Free instance has woken up.
- Confirm PayPal Sandbox connectivity and that Live AI has available API quota. Avoid a full evaluation run immediately before filming.
- Have the **PayPal Sandbox personal test account** ready for the buyer checkout; never enter a real PayPal password into the Sandbox purchase flow.
- Record at a readable browser resolution; close unrelated tabs, hide credentials, disable notifications and avoid displaying secrets.
- Film separate clips if needed. **Do not combine a new case with a different case's refund or webhook event while implying they are the same transaction.**
- Music, if used, must be licensed for the submission.

## Timed screen-by-screen script

| Time | On screen | Narration |
| --- | --- | --- |
| **0:00–0:15** | ResolveOS intro and dashboard. | "A payment takes seconds, but a dispute can turn into days of back-and-forth. ResolveOS helps buyers and merchants find an agreed resolution before opening a formal PayPal dispute." |
| **0:15–0:35** | As Alex Morgan, create a new Sandbox purchase; show PayPal approval and captured payment. | "We start with a real PayPal Sandbox order. The buyer approves it through PayPal, and the payment capture comes directly from PayPal's API. This uses test money." |
| **0:35–0:55** | Report a problem on this purchase; show PayPal-verified capture evidence and private buyer minimum. | "The buyer reports a missing item. ResolveOS verifies the capture independently, distinguishes evidence from unverified claims, and keeps the buyer's acceptable minimum private." |
| **0:55–1:15** | Switch to Jordan Ellis. Show case evidence, save merchant maximum. | "The merchant reviews the same case, may provide supporting evidence, and sets a private refund ceiling. The other side never sees that number." |
| **1:15–1:50** | Negotiation Room → Live AI → run turns. Show cited evidence, actual offers and outcome. | "An investigator checks available PayPal records. Two AI agents then exchange structured, evidence-based proposals. A deterministic server validates every turn and enforces the financial limits. The models can propose, but cannot refund anyone." |
| **1:50–2:18** | If an agreement is reached, show independent review and both separate approvals as Jordan and Alex. | "A separate reviewer explains the trade-offs. Even when the agents agree, nothing is paid until both people approve the exact same settlement terms." |
| **2:18–2:42** | Receipt for that same case showing PayPal refund ID, capture ID, COMPLETED status and audit log. | "After both approvals, the payment service requests the PayPal Sandbox refund and records the PayPal-confirmed result with an auditable receipt. These measured timings describe this test case, not an average." |
| **2:42–2:55** | PayPal Developer → Sandbox → Resolve AI → Webhook Events: successful matching capture/refund notifications; then brand closing. | "Capture and refund events also return through PayPal webhooks. AI negotiates, people decide, PayPal settles. ResolveOS: two sides, one resolution." |

## Important accuracy and contingency notes

- **Do not guarantee a deal.** Live agents may reach no agreement; if that happens, show that outcome truthfully, or record a fresh case from start to finish.
- A buyer minimum of $15 and merchant maximum of $20 permit an agreement but do not guarantee one. Check the merchant's **saved** limit before starting. The negotiated result and refund amount must match the case shown.
- In a **previously completed hosted test, case RA-1100**, the refund was $30 of $30, negotiation took 9 seconds over 2 turns, human approvals took 2 minutes 40 seconds, PayPal confirmation took 2 seconds, and overall complaint-to-resolution time was 8 minutes 2 seconds. Quote these only if you clearly show and identify this earlier case.
- PayPal Developer webhook logs have shown **Success** for capture and refund events for RA-1100. To claim matching notifications for a **new** recorded case, first check its events.
- If a newly deployed frontend fails to load a dynamic module after submitting a case, check whether the case already exists before attempting to create it again, then hard-refresh the page.
- A deterministic **Demo engine** is available as a separately labelled fallback, but don't present it as Live AI.
- Don't include cold starts, long checkout pauses or waiting for AI inference in the final edited narration. Keep the true sequence and actual result intact.
