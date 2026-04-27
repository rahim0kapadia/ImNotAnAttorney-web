# Apex Fix #4 — Tier 9 Post-Purchase Drip

**Branch:** `fix/apex-tier9-postpurchase-drip-final`
**Diagnosis:** F-L6-1 from `docs/plans/2026-04-26-apex-catalog-health-pass.md` (apex catalog health pass)
**Cited expert:** Andre Chaperon, *Sphere of Influence* — "The post-purchase moment is the highest-trust point in the customer relationship."

## Worry verbatim (F-L6-1)

`src/lib/drip-emails.ts` POST_PURCHASE_EMAILS covers playbooks + CD + IB + X-Ray + WR + SR + WitnessPack + ExtraWitness. NONE of the 7 live Tier 9 SKUs have a single post-purchase email. Tier 9 cross-sell architecture lives entirely in `upsellTier` metadata — never in actual outbound email. Every Tier 9 buyer is one-and-done.

## Cascade

- **Us:** rescue Tier 9 cohort from one-and-done; IB upsell at the highest-trust window converts cleanly priced upgrades.
- **Tier 9 buyer:** gets a read-the-report walkthrough, meeting-prep, and an honest synthesis-vs-single-signal explainer. No ambush sales.
- **Their attorney:** receives a defendant who shows up with structured questions specific to the report's data shape, not "what should I ask?"
- **Future-us:** drip pattern extends cleanly when `charge-authority-pack` and `precedent-watchlist` flip live (currently dark per PR #188 revert — out of scope here).
- **Industry floor:** post-purchase trust window honored, not extracted.

## Scope

In: 7 live Tier 9 SKUs × 3 emails = **21 new drip emails** appended to `POST_PURCHASE_EMAILS`.

| SKU slug | Display name | Price | Data hook |
|----------|--------------|-------|-----------|
| `judge-report-card` | Judge Question Brief | $197 | judge sentencing patterns + ruling tendencies |
| `officer-background-check` | Officer Background Check | $97 | officer reliability records + complaint history |
| `similar-cases-analyzer` | Similar Cases Analyzer | $297 | cases that look like yours and what happened |
| `district-court-intelligence` | Courthouse Intelligence Pack | $147 | judges, prosecutors, motion patterns at your courthouse |
| `motion-success-report` | Motion Success Report | $197 | grant rates by motion type for your charge |
| `arrest-survival-kit` | Arrest Survival Kit | $47 | first-72-hours checklist tuned to your state |
| `federal-jury-instruction-brief` | Federal Jury Instruction Brief | $97 | circuit pattern jury instructions for your charge |

Out of scope:
- `charge-authority-pack` ($47) and `precedent-watchlist` ($47): currently dark per PR #188 revert. They get drip when re-flipped.
- Cron driver changes: `drip-post-purchase.ts` filters by `tier` field via `getPostPurchaseEmails(order.tier)` — no whitelist exists. Tier 9 emails are picked up automatically.
- Stripe price changes, intake flow changes, deliverable copy changes.

## Sequence shape per SKU (3 emails, T+0h to T+168h)

Tier 9 SKUs are `delivery: "Instant"` — report generates on purchase. Day-0 email is sent by webhook (matching pattern of existing `delayDays: 0` rows like `post_case_decoder_delivery`). Days 3 and 7 fire from cron via `paid_at`-relative timing (Tier 9 has no `delivered_at` separate from purchase, no Phase 2 intake).

| Email | delayDays | Purpose |
|-------|-----------|---------|
| 1 | 0 | Delivery confirmation + how to read the report for your attorney meeting |
| 2 | 3 | Meeting-prep — 3-5 sample questions specific to this report's data shape |
| 3 | 7 | IB upsell using moat copy from Fix #3 (synthesis + calibration + operator review) |

Crisis-buyer 7-day window honored. T+168h = Day 7 = LAST email. No drip past day 7.

## Email 3 IB upsell math

`upgradeCostBetween("<tier9-slug>", "intelligence-brief")` works on any pair via `tiers.ts:531`. Price diff per SKU:

| SKU | Price | IB diff |
|-----|-------|---------|
| arrest-survival-kit | $47 | $950 |
| officer-background-check | $97 | $900 |
| federal-jury-instruction-brief | $97 | $900 |
| district-court-intelligence | $147 | $850 |
| judge-report-card | $197 | $800 |
| motion-success-report | $197 | $800 |
| similar-cases-analyzer | $297 | $700 |

100%-rolls-forward, 12-month expiry per INAA standing policy — same pattern as existing CD→IB upsell.

## UPL constraints (mirrored from existing drip)

Banned phrases: "you should", "we recommend", "we advise", "your best option", "publicly available", "consult your attorney", "ask your attorney to verify". Use the existing approved methodology disclaimer phrasing (synthesis + operator review). Do NOT introduce new attorney names in customer-facing copy — pre-purchase rule.

## Tests

Append to `src/lib/drip-emails.test.ts`:

```ts
describe("Tier 9 post-purchase drip coverage", () => {
  const TIER9_SLUGS = [
    "judge-report-card",
    "officer-background-check",
    "similar-cases-analyzer",
    "district-court-intelligence",
    "motion-success-report",
    "arrest-survival-kit",
    "federal-jury-instruction-brief",
  ];
  it.each(TIER9_SLUGS)("has 3 post-purchase emails for %s", (slug) => {
    const emails = POST_PURCHASE_EMAILS.filter((e) => e.tier === slug);
    expect(emails).toHaveLength(3);
    expect(emails.map((e) => e.delayDays).sort((a, b) => a - b)).toEqual([0, 3, 7]);
  });
  it.each(TIER9_SLUGS)("Day-7 upsell points at intelligence-brief for %s", (slug) => {
    const day7 = POST_PURCHASE_EMAILS.find((e) => e.tier === slug && e.delayDays === 7);
    expect(day7?.html).toContain("/checkout?tier=intelligence-brief");
  });
});
```

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` after `rm -rf .next/types` — 0 errors
- `npx vitest run src/lib/drip-emails.test.ts` — green
- Grep verify no banned UPL phrases introduced in new drip blocks
- Grep verify no `imnotanattorney.com` FROM address in new code (Resend FROM is env-driven)

## Hard constraints

- Do not touch content/blog/, blog-pipeline/, scripts/blog-pipeline/, scripts/qa-existing-post* — sibling session active.
- Do not change Stripe price IDs.
- Do not extend drip past day 7 for Tier 9 (crisis-buyer window).
- Operator-tone mirrors existing post-purchase emails (CD/IB voice).
