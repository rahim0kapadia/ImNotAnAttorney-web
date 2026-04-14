# Partner Growth Upgrades — Spec Errata (Code Review Fixes)

**Companion to:** `2026-04-14-partner-growth-upgrades-design.md`
**Source:** Code review by superpowers:code-reviewer agent
**Status:** All items verified against codebase. Implementation plan MUST incorporate these.

---

## CRITICAL Fixes

### C2. Webhook partner detail SELECT must expand

The spec says "the webhook already queries the partner record for notification details." True, but the SELECT at line 566 of `src/app/api/webhooks/stripe/route.ts` only fetches:

```
"id, name, email, total_commission, phone, notification_prefs"
```

`buildCommissionSMS()` requires `total_referrals`, `commission_tier`, and `promo_code`. The metadata fallback path at line 662 has an identical SELECT with the same gap.

**Fix:** Both webhook partner detail queries must expand to:

```
"id, name, email, total_commission, phone, notification_prefs, total_referrals, commission_tier, promo_code"
```

### C3. `track_referral` RPC does not return `total_referrals`

The spec says `total_referrals` comes from the RPC. Wrong. The RPC returns:

```sql
jsonb_build_object('tier_changed', bool, 'new_tier', text, 'new_rate', int)
```

It computes `v_new_total` internally but never exposes it.

**Fix:** The `total_referrals` value comes from the partner detail query that runs AFTER the RPC (the same query fixed in C2). The RPC atomically increments `total_referrals`, so the subsequent SELECT reads the post-increment value. There is a theoretical race if two webhooks fire simultaneously for the same partner, but this is acceptable — milestone/first-sale detection off by one referral is not harmful.

Implementation should NOT modify the RPC. Read `total_referrals` from the partner query instead.

---

## WARNING Fixes

### W3. PartnerApplicationForm lacks Company and Phone fields

The spec says "add optional city text input between Company and Phone fields." But `src/components/partner/PartnerApplicationForm.tsx` only collects name, email, and compliance checkbox. There are no Company or Phone inputs in the form (though the API route at `src/app/api/partners/apply/route.ts` does accept those fields in its body destructuring).

**Fix:** Add city input after the email field (the last text input in the current form). Do NOT add company/phone fields as part of this change — that is separate scope. The city field should also be added to:
- The form's submit body JSON
- The apply route's INSERT statement (both new partner insert at ~line 273 and pending partner update at ~line 166)

### W4. Index needed for monthly summary cron date queries

The monthly summary cron queries `referrals` by `partner_id` + `created_at` date range. No composite index exists — only `idx_referrals_partner_order` on `(order_id, partner_id)`.

**Fix:** Add to the migration file:

```sql
CREATE INDEX IF NOT EXISTS idx_referrals_partner_date
  ON referrals(partner_id, created_at);
```

### W5. Both webhook paths must switch pref key

The spec introduces `commission_earned` pref but does not explicitly state that BOTH webhook referral-tracking paths must change from `partnerPrefs.payout` to `partnerPrefs.commission_earned`.

**Fix:** In `src/app/api/webhooks/stripe/route.ts`:
- Primary promo code path (~line 575): change `shouldSendEmail(partnerPrefs.payout)` to `shouldSendEmail(partnerPrefs.commission_earned)` and same for `shouldSendSMS`
- Metadata fallback path (~line 671): identical change

The `payout` pref key remains for commission-locking and payout-processing notifications in `src/app/api/cron/lock-commissions/route.ts` (no change there).

### W6. Partner interface missing total_referrals

The `Partner` interface in `src/lib/partner-data.ts` (lines 41-56) does not include `total_referrals` or `commission_tier` as typed fields. The dashboard API accesses these directly from the Supabase query result (no type enforcement at runtime).

**Fix:** Non-blocking for implementation since `buildCommissionSMS()` uses its own `opts` parameter interface. However, if any component needs these fields typed, add to the `Partner` interface:

```typescript
total_referrals?: number;
total_commission?: number;
total_paid_out?: number;
```

Low priority — only implement if TypeScript errors surface during development.

---

## INFO Fixes

### I3. ConversionFunnel must handle link_clicks === 0 in bar widths

The spec handles division-by-zero for the conversion rate callout ("Shows '--' if link_clicks is zero") but the bar width calculation `(quiz_starts / link_clicks) * 100%` would produce `Infinity%` or `NaN%` when `link_clicks === 0` but `purchase` events exist (from direct promo code entry at checkout, bypassing the referral link).

**Fix:** In `ConversionFunnel.tsx`, when `link_clicks === 0`:
- Use `purchases` as the max denominator if any events exist
- Or show a different layout: "X purchases from direct code entry (no link clicks tracked)"
- At minimum: `Math.max(link_clicks, 1)` as denominator to prevent NaN

### I7. Partner signup route file path

The spec references `src/app/api/partner/magic-link/route.ts` as the signup API. The actual partner application/signup route is `src/app/api/partners/apply/route.ts` (note: `partners` plural, not `partner`).

**Fix:** Implementation should modify `src/app/api/partners/apply/route.ts` to accept and store the `city` field.

---

## Already Fixed in Spec (via prior edits)

- **C1:** `generateMetadata()` signature fix — documented in spec Section 1.1 step 1
- **W1:** `after()` API for server component events — documented in spec Section 1.2 fire-and-forget pattern
- **W2:** `city` added to partner SELECT — documented in spec Section 1.1 step 3
- **I1:** `React.cache()` for shared query — documented in spec Section 1.1 step 2
