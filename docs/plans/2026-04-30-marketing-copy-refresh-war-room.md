# Plan: Marketing copy refresh — War Room + X-Ray product-tiers.md

Date: 2026-04-30
Source: docs/handoffs/2026-04-30-data-orphans-merged-cron-shipped.md Step 3
Triage: trivial copy refresh (auto-upgraded to FEATURE by 3-file scope counter; actual scope = 1 file, 2 lines)

## Scope

PR #26 (commit d774cd02) shipped:
- War Room ($4,997) defendant-portal judge×prosecutor pairing matrix + Mon 13:00 UTC weekly Resend digest
- X-Ray ($2,497) officer cross-case reliability section

`product-tiers.md` headline blurbs do not name these. Tier 9 additive lines (16-19) already mention the capabilities but as Tier 9 standalone, not as base-tier shipped features. Update the two headline lines to call out shipped features so future copy work surfaces them.

## Files to Modify

- `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\product-tiers.md`

## Files to Create

None.

## Tasks

1. Edit X-Ray headline (line 5) — append "+ officer cross-case reliability section (shipped 2026-04-30)".
2. Edit War Room headline (line 6) — append "+ defendant-portal judge×prosecutor pairing matrix + Mon 13:00 UTC weekly Resend digest (shipped 2026-04-30)".

## Out of Scope

- `STANDALONE_PRODUCTS` constants — separate SKUs.
- Tier 9 additive lines — already correct.
- Mirror to monorepo `apps/web/.claude/rules/product-tiers.md` if it exists — separate concern.
