# Plan: Arrest Survival Kit v3 — replace agency-incident dump with state procedural data

> User-provided spec, saved here per LARGE_BUILD plan-file requirement.
> Worktree: `.claude/worktrees/asks-v3` on branch `feat/arrest-survival-kit-v3` from `origin/master`.

## Why

Current ASK ($47, Tier 9, live) leads with top-20 state agency use-of-force counts and a wandering-officer aggregate. Both are sociology, not actionable, for a defendant arrested in the last 72 hours. Crisis-buyers need what happens next in their state: bail process, PD-attach timing, first-appearance window, indigency threshold, recording-police law, expungement window, bond types, phone-call rule.

Repositioning: from "First-72-hours checklist tuned to your state" to "What happens to you in $STATE in the next 72 hours."

## Files to CREATE

### Schema + loader
- `src/lib/state-arrest-procedure/types.ts` — `StateArrestProcedure` interface plus `BailType` and `RecordingPoliceConsent` enums
- `src/lib/state-arrest-procedure/load.ts` — `getStateArrestProcedure(code)`, `listStateArrestProcedures()`, `validateStateArrestProcedure(raw, filename)`, `clearStateArrestProcedureCache()`
- `data/state-arrest-procedure/_README.md` — schema doc + research methodology + UPL + no-hallucination rule
- `data/state-arrest-procedure/<lowercase-code>.json` — one file per state (50 total)

### Tests
- `tests/state-arrest-procedure-load.test.ts` — loader validation: rejects missing source_urls when fields populated, accepts a valid file, lookup by code is case-insensitive, _unknown_fields invariant rejects mislabeled fields, recording_police_consent enum validation, bail_types_allowed enum validation

## Files to MODIFY

- `src/lib/defense-intelligence/query.ts` — `queryArrestSurvivalKit`: load state procedure data via loader; keep agency_incidents and officer_external_intel queries (defense-in-depth) but expose them as a smaller "regional context" block on the returned shape
- `src/lib/tier9-reports/render.ts` — `renderArrestSurvivalKit`: lead with procedural facts (first-appearance window, phone-call rule, PD attach, indigency, bail types, recording, expungement); demote agency/officer to bottom; cite every legal claim with source_url visibly
- `src/app/arrest-survival-kit/page.tsx` — hero + value props + sample table + trust copy + FAQ
- `src/lib/products.ts` `STANDALONE_PRODUCTS["arrest-survival-kit"]` — description
- `src/lib/tiers.ts` `TIER_CORE["arrest-survival-kit"]` — deliveryDetail
- `src/lib/drip-emails.ts` — 3 ASK drip emails (delivery, day-3, day-7 upsell) — subject + body
- `ARCHITECTURE.md` — add a Component Map row for state-arrest-procedure subsystem if it materially changes the system map

## Files NOT touched
- Stripe price IDs, `tiers.ts.live`, `products.ts.isActive`
- URL slug `/arrest-survival-kit`
- DB tier_slugs and migrations
- `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*` (sibling-session forbidden zones)

## Numbered tasks

1. Write `types.ts` with `StateArrestProcedure` interface and the two enums.
2. Write `load.ts` with validation, caching, and lookup.
3. Write `tests/state-arrest-procedure-load.test.ts` with positive and negative fixtures.
4. Write `data/state-arrest-procedure/_README.md` documenting schema and research methodology.
5. Dispatch 50 state research agents (Opus, batches of 5) — each WebFetches authoritative sources, writes one JSON file with full source_urls and explicit `_unknown_fields`.
6. Refactor `queryArrestSurvivalKit` to read state procedure data via the loader; keep agency/officer block as `regionalContext`.
7. Refactor `renderArrestSurvivalKit` — procedural-first sections, every claim links to source_url.
8. Update landing page hero, features, FAQ, sample-table copy to procedural framing.
9. Update `STANDALONE_PRODUCTS["arrest-survival-kit"].description` and `TIER_CORE` slot deliveryDetail.
10. Update 3 ASK drip emails to procedural framing.
11. Run `npx tsc --noEmit --skipLibCheck` — green.
12. Run `npx vitest run --reporter=basic` — green.
13. Commit + push from worktree, open PR via `gh pr create`.

## Acceptance

- 50 of 50 state files written and validated by loader.
- Every customer-facing claim in render output links to its source_url.
- Render output contains no UPL phrasing (no "you should" directive language, no "verify with attorney" framing).
- `tsc` clean, `vitest` clean.
- PR open, body includes any state where research came up empty.

## Hard constraints

- Worktree-only. No edits in parent checkout.
- No paid APIs. WebFetch and WebSearch only. Wikipedia is a discovery aid; the upstream URL it cites is the authoritative source.
- `~/.claude/rules/no-hallucinated-legal-data.md`: every populated field needs a verification URL; null + `_unknown_fields` is the answer when source is missing.
- `~/.claude/rules/never-cold-email-from-primary-domain.md`: no email sends from this work.
- UPL: information not advice. Mercer voice. No directive language.
- Brand: amber + navy on black, Playfair + Lato.
