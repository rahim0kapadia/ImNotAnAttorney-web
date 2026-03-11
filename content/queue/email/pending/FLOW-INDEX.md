# Email Flow Index

## How These Templates Work

These email templates provide **inner HTML only**. The `sendEmail()` function in
`src/lib/email.ts` wraps each template in the branded dark-theme outer container
(`<div style="background: #0C0A09; color: #D4D4D8; ...">`) and appends the
CAN-SPAM footer (business name, disclaimer, physical address, unsubscribe link).

**Do NOT add outer wrapper divs or unsubscribe footers to these templates.**

### Template Variables

Variables use `{{DOUBLE_BRACE}}` syntax. The ESP or sending function should
replace these before sending.

---

## Flow 1: Abandoned Cart (`flow-1-abandoned-cart.html`)

| # | Subject | Delay | Variables |
|---|---------|-------|-----------|
| 1 | Your case isn't going to wait | 1 hour | `{{TIER_NAME}}`, `{{TIER_PRICE}}`, `{{TIER_SLUG}}` |
| 2 | The question your attorney hopes you never ask | 24 hours | `{{TIER_NAME}}`, `{{TIER_PRICE}}`, `{{TIER_SLUG}}` |
| 3 | Your cart expires at midnight | 48 hours | `{{TIER_NAME}}`, `{{TIER_PRICE}}`, `{{TIER_SLUG}}`, `{{TIER_DELIVERY}}` |

**Trigger:** User enters email on /checkout page but doesn't complete Stripe payment.
**Exit:** Purchase completed.
**Source data:** Stripe checkout sessions with `status != complete`, email from checkout form.

---

## Flow 2: Win-Back Cold Subscribers (`flow-2-winback-cold-subscribers.html`)

| # | Subject | Delay | Variables |
|---|---------|-------|-----------|
| 1 | Did something happen with your case? | Day 0 | (none) |
| 2 | Is your attorney actually working your case? | Day 3 | (none) |
| 3 | We built something new since you've been gone | Day 7 | (none) |
| 4 | The defendants who stay quiet lose | Day 14 | (none) |
| 5 | We're removing you from our list | Day 21 | `{{EMAIL_BASE64}}` |

**Trigger:** Subscriber `last_opened_at` > 30 days ago, `unsubscribed = false`.
**Exit:** Opens any email in the sequence (re-engaged).
**Cleanup:** If Email 5 is not opened within 48 hours, mark subscriber inactive.

---

## Flow 3: Score Quiz Re-engagement (`flow-3-score-quiz-reengagement.html`)

| # | Subject | Delay | Variables |
|---|---------|-------|-----------|
| 1 | Your case scored {{SCORE}}/100 — here's what that means | Immediate | `{{SCORE}}`, `{{BAND}}`, `{{BAND_COLOR}}`, `{{OBSERVATIONS}}` |
| 2 | The 3 things dragging your score down | 24 hours | `{{SCORE}}` |
| 3 | How {{CHARGE_LABEL}} cases with your score usually play out | 3 days | `{{SCORE}}`, `{{CHARGE_LABEL}}`, charge-specific variant |
| 4 | One question that could change everything | 7 days | `{{SCORE}}`, `{{CHARGE_LABEL}}` |

**Trigger:** User completes /score quiz AND provides email, does not purchase.
**Exit:** Purchase completed (any tier).
**Source data:** `/api/subscribe` with `source="score-page"`, score result stored in session or passed to email system.
**Email 3 variants:** DUI, Drug, White Collar, Other Felony, Other Misdemeanor (5 charge-type variants).

---

## Implementation Notes

1. **Tier variables** (`{{TIER_NAME}}`, `{{TIER_PRICE}}`, etc.) should be resolved
   from `TIER_CORE` in `src/lib/tiers.ts` at send time.

2. **Score variables** should be computed by the `/api/score` endpoint and stored
   alongside the subscriber record (or in a session/cookie for the email trigger).

3. **Exit conditions** must be checked before each send. If the subscriber has
   purchased or re-engaged, suppress the remaining emails in the flow.

4. **CAN-SPAM compliance** is handled by `sendEmail()` — these templates should
   NOT include their own unsubscribe links or physical addresses.

5. **A/B testing**: Each email includes a Subject Line B variant. Test with 20%
   of the segment, send the winner to the remaining 80%.
