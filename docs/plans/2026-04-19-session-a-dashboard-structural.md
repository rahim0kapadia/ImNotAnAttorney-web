# Session A — Dashboard Structural Fixes (2026-04-19)

Items #2, #10, #13, #14 from master plan `2026-04-19-bondsman-referral-audit-master.md`. All marked "agent-safe? NO — needs data pipeline / UI layout". Master plan explicitly deferred these to a separate plan.

## Scope

| # | Item | Files | Data |
|---|------|-------|------|
| 2 | Forfeiture-dollars-saved hero + activation checklist + reorder | `partner/dashboard/page.tsx`, `api/partner/dashboard/route.ts`, `lib/bond-exposure.ts` (new) | Estimate from charge_type; count active clients; count sms_log reminders this month |
| 10 | Carbon-copy reminders feed on dashboard | `partner/dashboard/page.tsx`, `api/partner/dashboard/route.ts` | `sms_log` WHERE `partner_id` AND created_at > 7d |
| 13 | Card + checklist bondsman-value-stack side panel | `partner/card/page.tsx`, `partner/checklist/page.tsx` | Static copy; no data |
| 14 | Peer benchmark block | `partner/dashboard/page.tsx`, `api/partner/dashboard/route.ts`, new RPC `partner_peer_benchmark(p_partner_id)` | Aggregate across all bondsman partners |

## Execution order + commit boundaries

### Step 1 — #2 (forfeiture hero + wire-in)

**Data model — bond exposure estimator.** `court_reminders.bond_amount_cents` does not exist. New lib `src/lib/bond-exposure.ts`:

- `estimateBondCentsForChargeType(chargeType: string | null): number` — lookup table matching charge slugs used in `court_reminders.charge_type`. Source: FTA calc defaults ($10k avg) + industry tiers:
  - misdemeanor → $250,000 cents ($2,500)
  - DUI / drug-possession → $500,000 cents ($5,000)
  - assault / theft / other non-violent felony → $1,500,000 cents ($15,000)
  - violent felony → $5,000,000 cents ($50,000)
  - unknown/null → $1,000,000 cents ($10,000) — matches FtaCalculator default
- `sumProtectedExposureCents(clients: {charge_type, status}[]): number` — sum for status='active' only.

**API changes** (`src/app/api/partner/dashboard/route.ts`):
- Add fields: `protectedExposureCents`, `clientsActive`, `remindersSentThisMonth`, `monthLabel`.
- `clientsActive` = count court_clients with status='active'.
- `remindersSentThisMonth` = `sms_log` count WHERE partner_id=X AND category='court_reminder' AND created_at >= start-of-current-month.
- `monthLabel` = current-month short label (e.g. "Apr").

**Dashboard wire-in** (`src/app/partner/dashboard/page.tsx`):
- Mount `ForfeitureSavedHero` at top of main content (BEFORE ClientTracker).
- Only show for bondsman partners: `partner.source === 'bondsman'`.
- Pass `exposureIsEstimated={true}` (no real bond column yet).

**Activation checklist** (part of #2, shown when `clientsActive === 0`):
- New minor component or inline: "Get started in 3 steps — text your partner link to next client / print bail-packet collateral / watch first reminder fire within 48h."
- Inline, not a separate file — keeps scope tight.

**Reorder**: move `ForfeitureSavedHero` first. Keep `ClientTracker` second (current top). Push `ComplianceReportButton` down into Earnings area. Move `FtaCalculator` below earnings (educational, not primary).

**Acceptance:** dashboard loads for bondsman partner; hero shows estimated $ exposure; tsc clean; no new CSS tokens.

**Commit message:** `feat(dashboard): forfeiture-saved hero + bondsman-native reorder (#2)`

### Step 2 — #10 (reminders-on-your-behalf feed)

**API changes:** extend dashboard route.ts:
- New field: `reminderFeedItems: ReminderFeedItem[]`.
- Query: `sms_log` join `court_reminders` for first_name; WHERE partner_id=X AND category='court_reminder' AND created_at > now()-7d; ORDER BY created_at DESC LIMIT 10.
- Privacy: first name + last initial only. Use `first_name` from court_reminders; last initial from `last_name[0]` if present.

**Dashboard wire-in:** Mount `<RemindersOnYourBehalf />` immediately under `ForfeitureSavedHero`.

**Acceptance:** feed shows last 7 days of sent SMS for this partner with privacy-safe labels. Empty state when none.

**Commit message:** `feat(dashboard): carbon-copy reminders feed (#10)`

### Step 3 — #14 (peer benchmark block)

**RPC** (new SQL migration `20260419b_partner_peer_benchmark.sql`):
- `partner_peer_benchmark(p_partner_id uuid) RETURNS jsonb` with { my_reminders_30d, peer_median_reminders_30d, my_retention_rate, peer_median_retention_rate, my_rank_percentile }.
- Aggregates over all `partners.source='bondsman'` with ≥ 3 active clients.

**New component** `src/components/partner/PeerBenchmark.tsx`:
- Shows 3 lines comparing vs peer median. Firestone retention-style. No negative framing when partner is below median — frame as "room to capture".

**API + wire-in:** extend dashboard route + mount component between EarningsSection and PartnerAnalytics.

**Commit message:** `feat(dashboard): peer benchmark block (#14)`

### Step 4 — #13 (card + checklist side panel)

**`partner/card/page.tsx`** + **`partner/checklist/page.tsx`:**
- Add right-side panel (print-hidden: `print:hidden`) with bondsman value-stack:
  - "$10,000 forfeiture prevented per client retained"
  - "15-20% industry FTA rate cut to 8%"
  - "This costs you nothing"
  - "Every bail packet = another funnel entry"
- Adjust grid to 2-column on desktop (content left, value-stack right). Preserve print layout exactly.

**Acceptance:** Print preview unchanged. Desktop shows value panel. tsc clean.

**Commit message:** `feat(partner-collateral): bondsman value-stack side panels (#13)`

## Invariants (every step)

- `npx tsc --noEmit --skipLibCheck` green before every commit.
- No new `&mdash;` HTML entities in new copy (components may still have legacy ones — leave those).
- 44×44px touch targets.
- No `text-zinc-500` on `text-xs` in new code — use `text-zinc-400`.
- UPL: all new copy passes crisis-buyer lens. No outcome predictions. No legal advice.
- Atti voice: bondsman-native on forfeiture + value-stack. Not SaaS-generic.

## Expert lens (cited)

- **Chris Dreyer** — niche domination via vernacular ("bond exposure", "forfeiture shield" not "engagement metrics"). Cache: `C:\Users\email\.claude\experts\chris-dreyer.md`.
- **Ezra Firestone** — peer benchmark as retention driver (Default Alive + Layered Growth Stack).
- **BJ Fogg** — activation checklist anchored to existing bondsman workflow (jail-desk moment).

## Out of scope for this plan

- Real `court_reminders.bond_amount_cents` column. Future migration; estimator is the v1.
- Peer benchmark UI polish beyond 3 numeric comparisons.
- Mobile responsiveness regression testing on card/checklist (print layout validated; desktop is bonus view).
