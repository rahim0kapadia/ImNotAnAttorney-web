# Worry: Skeleton-table ingester pre-population gate enforcement (deferred)

Date created: 2026-05-01
Source: schema-cleanup-vestigials R1 swarm — security-auditor `pre-population-gate-prose-only-no-producer-enforcement` (A04:2021).
Status: DEFERRED — awaits ingester implementation.

## Worry

Marker file `apps/web/docs/intentionally-unused-tables.md` defines a `Pre-population gate:`
field with 4 conditions per skeleton table:
1. RLS policy still present.
2. Rahim approval recorded.
3. Source-data licensing review complete.
4. Bulk-load via pg-copy-streams (cl-bulk-data-defensive #18).

Today these are PROSE-ONLY. There is no producer-side runtime enforcement that checks
the gate before an actual INSERT runs. A future session writing the ingester
(`canonicalize-officers.mjs` for entities_officers, T48 dispatcher for
pji_field_validation) could INSERT without verifying. Per Hook-Or-Harder meta-rule,
gates that exist only in markdown decay.

## Why deferred from schema-cleanup-vestigials

The producer (ingester script) does NOT EXIST yet. Cannot enforce a gate against
non-existent producers. Three options surfaced:

1. **Pre-INSERT runtime check helper** (`scripts/lib/skeleton-table-gate.mjs`) — writes
   the helper now; future ingester MUST import + call. Risk: helper rots without consumer.
2. **Hook on Edit/Write of new ingester scripts** (`enforce-skeleton-gate.js` PreToolUse)
   — fires when a session writes `canonicalize-officers.mjs` or T48 dispatcher AND
   detects INSERT INTO entities_officers/pji_field_validation pattern. Requires
   articulation marker (`SKELETON-GATE-CHECKED <table> "evidence"`).
3. **CI lint** rejecting PRs that wire skeleton tables without gate evidence.

Path 2 is most aligned with Atlas Hook-Or-Harder; Path 1 is simpler. Both wait for
the ingester to be planned.

## Trigger to re-open

Trigger one or more of these → re-open worry, ship the gate:
- A PR appears touching `canonicalize-officers.mjs` or any script with
  `INSERT INTO entities_officers` / `INSERT INTO pji_field_validation`.
- T48 Shankar framework spec reaches plan stage.
- 2026-07-29 marker re-evaluation finds either skeleton ready to ingest.

## Re-evaluation date

2026-07-29 (alongside skeleton tables' marker re-eval).

## Owner

ImNotAnAttorney monorepo / shared-DB hygiene + canonical entities project.

## Cascade

- Us: producer-side gate prevents PII-on-skeleton-table without security review.
- Direct counterparty (skeleton ingester author): friendly nudge at action moment.
- Future-us: gate generalizes to other skeleton tables.
- Ecosystem: pattern publishable.
- No node loses.
