# PR #166 review-finding fixes (2026-04-26)

## Context
PR #166 (D1 — Judge Question Brief rename) review returned 5 SUGGESTIONs, all valid. Per Pristine-or-Nothing, fix all before merge.

## Files to modify
1. `content/blog/595k-federal-sentences-exposed.mdx` — em-dash kill (DONE)
2. `content/blog/sentencing-gap-nobody-talks-about.mdx` — em-dash kill (DONE)
3. `src/app/judge-report-card/page.tsx` — H1 + subhead + final-CTA H2 reframe
4. `src/app/api/webhooks/stripe/route.ts` — comment annotation for grep-discovery

## Files to create
None.

## Numbered tasks
1. Sales page H1: "Know Your Judge Before Your First Hearing" → "Questions To Ask About Your Judge Before Your First Hearing"
2. Sales page subhead: "Every judge has patterns. The prosecutor knows them. Now you will too." → "Every judge has patterns in the public record. The prosecutor reads them. Now you can ask about them too."
3. Sales page final CTA H2: "Stop Walking Into Court Blind" → "Walk In Prepared, Not Predicting"
4. Webhook route comment: add `(display name: "Judge Question Brief" since 2026-04-26)` annotation
5. tsc verify
6. Commit + push to update PR #166

## Out of scope
- Other PRs (deferred items D2-D9 separate work)
- Stripe price ID changes (holds at $197)
- DB tier_slug changes (URL slug stable)

## Cascade
- us: PR #166 review findings closed → merge unblocked
- direct counterparty (defendants): less predictive framing, more preparatory tone matches the data state
- ecosystem (blog humanizer): em-dash count drops back to floor; reduces detector penalty risk on next regen
- future-us: webhook grep-discovery now consistent with tier9-reports annotations
- All 4 nodes win.
