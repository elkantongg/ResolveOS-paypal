# Demo video script (target 2:45, hard limit 3:00)

**Before recording:**
- Run `pnpm db:reset --yes` for a clean demo (this clears earlier test timings), then `pnpm dev`.
- Make the browser 1440×900 and zoom in to 110%.
- Sign in as Alex Morgan.
- Have your PayPal **sandbox** buyer login ready.
- Close other tabs; turn notifications off.
- No music, unless it is royalty-free and you have permission to use it (Devpost rule).
- Don't show the PayPal logo larger than the sandbox page itself shows it.

| Time | On screen | Say (roughly) |
| --- | --- | --- |
| 0:00–0:15 | Landing page hero | "A payment is easy to make. When it goes wrong, resolving it is much harder. Alex paid $180 for a jacket. The carrier says delivered. Alex says it never arrived. Both are telling the truth as they see it." |
| 0:15–0:30 | Point at the problem section | "Today the formal route is a PayPal dispute: an inquiry stage that can last up to 20 days, then possibly a claim. ResolveOS offers a step before that: a structured settlement both sides approve." |
| 0:30–0:50 | Sandbox purchase → PayPal sandbox approve → "Payment captured" | "This is a real PayPal sandbox payment: Orders API, buyer approval on PayPal, capture. The capture ID comes straight from PayPal." |
| 0:50–1:05 | Report a problem → case page, highlight "Verified from PayPal" | "Alex reports the problem. ResolveOS reads the capture back from PayPal as verified evidence." Then switch to the merchant: "Northline adds its tracking record and sets a private refund limit Alex never sees." |
| 1:05–1:45 | Go to negotiation → Live AI → Start → Run to a result. Hover the evidence chips; open one turn's reasoning | "First a neutral investigator reads PayPal's own records: it finds the payment, but no tracking on file. Then two AI agents: one for Alex, one for the merchant. They cite evidence by code, flag what's unproven ('no signature, no photo'), and trade offers. Watch the gap close. Every answer is checked by our server: limits, amounts, real evidence. The AI can only propose." |
| 1:45–2:10 | Settlement: approve as the merchant, switch person, approve as Alex, then "Refund completed by PayPal" | "An independent reviewer tells both people whether this fits the evidence. Nothing is final until both people approve these exact terms. One approval isn't enough. Second approval, and the refund runs on PayPal's Payments API, with an idempotency key so it can never be sent twice." |
| 2:10–2:30 | Receipt: refund ID, capture ID, measured times | "A verified receipt: PayPal's refund ID and status. The app also records how long each step took. In this one demo run it was about a minute and a half, with us approving straight away, so it's a single run, not a speed claim." |
| 2:30–2:45 | Briefly show RA-1043 ending in "No agreement" | "And when the evidence can't support a deal, it doesn't force one: no agreement, no money moves, and the formal route stays open. ResolveOS: two sides, one resolution." |

**Tips:**
- Do a dry run first. Groq's free tier can pause for about 10 s between back-to-back negotiations,
  so start the negotiation recording fresh, or cut the wait in editing.
- Groq's free tier also has a daily allowance. Don't run `pnpm eval` on the day you record.
- If live AI is slow on the day, the labelled **Demo engine** gives the same flow. Say "deterministic
  demo engine" on screen if you use it.
- Upload as **Public** on YouTube and paste the link into Devpost.
