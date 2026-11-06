# Demo video script (target 2:45, hard limit 3:00)

**Before recording:**
- Run `pnpm dev`, then `pnpm db:seed` for a clean demo.
- Make the browser 1440×900 and zoom in to 110%.
- Sign in as Alex Morgan.
- Have your PayPal **sandbox** buyer login ready.
- Close other tabs; turn notifications off.
- No music, unless it is royalty-free and you have permission to use it (Devpost rule).
- Don't show the PayPal logo larger than the sandbox page itself shows it.

| Time | On screen | Say (roughly) |
| --- | --- | --- |
| 0:00–0:15 | Landing page hero | "A payment is easy to make. When it goes wrong, resolving it is much harder. Alex paid $180 for a jacket. The carrier says delivered. Alex says it never arrived. Both are telling the truth as they see it." |
| 0:15–0:30 | Point at the problem section | "Today that becomes a PayPal dispute: up to 20 days of back-and-forth, then a claim. ResolveOS settles it before that, fairly, in minutes." |
| 0:30–0:50 | Sandbox purchase → PayPal sandbox approve → "Payment captured" | "This is a real PayPal sandbox payment: Orders API, buyer approval on PayPal, capture. The capture ID comes straight from PayPal." |
| 0:50–1:05 | Report a problem → case page, highlight "Verified from PayPal" | "Alex reports the problem. ResolveOS reads the capture back from PayPal as verified evidence." Then switch to the merchant: "Northline adds its tracking record and sets a private refund limit Alex never sees." |
| 1:05–1:45 | Negotiation Room → Live AI → Start → Run to a result. Hover the evidence chips; open one turn's reasoning | "Two AI agents: one for Alex, one for the merchant. They cite evidence by code, flag what's unproven ('no signature, no photo'), and trade offers. Watch the gap close. Every answer is checked by our server: limits, amounts, real evidence. The AI can only propose." |
| 1:45–2:10 | Settlement: approve as the merchant, switch person, approve as Alex, then "Refund completed by PayPal" | "Nothing is final until both people approve these exact terms. One approval isn't enough. Second approval, and the refund runs on PayPal's Payments API, with an idempotency key so it can never be sent twice." |
| 2:10–2:30 | Receipt: refund ID, capture ID, measured times | "A verified receipt: PayPal's refund ID and status, and measured from the audit log, complaint to refund in about a minute and a half, against a 20-day inquiry window." |
| 2:30–2:45 | Briefly show RA-1043 ending in "No agreement" | "And when the evidence can't support a deal, it doesn't force one: no agreement, no money moves, and the formal route stays open. ResolveOS: two sides, one resolution." |

**Tips:**
- Do a dry run first. Groq's free tier can pause for about 10 s between back-to-back negotiations,
  so start the negotiation recording fresh, or cut the wait in editing.
- If live AI is slow on the day, the labelled **Demo engine** gives the same flow. Say "deterministic
  demo engine" on screen if you use it.
- Upload as **Public** on YouTube and paste the link into Devpost.
