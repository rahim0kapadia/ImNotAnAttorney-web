# Bondsman Check-In Toggle — Implementation Plan

**Date:** 2026-04-17 (revised same day for URL-per-mode architecture)
**Source handoff:** `docs/handoffs/2026-04-17-bondsman-checkin-toggle-triage.md`
**Status:** plan — Phase 0 (elite design) blocks Phase 1+ implementation
**Expert lenses used:** [Cached expert: April Dunford] (positioning), [Cached expert: Peep Laja] (messaging hierarchy), [Cached expert: Sabri Suby] (offer clarity)

---

## TL;DR Recommendation

**URL-per-mode referral link + per-client check-in link + untouched bondsman-recruitment preview. Three distinct OG surfaces.**

**Preview surface map (who sends what to whom):**

| # | Surface | URL | Sender → Receiver | Purpose | Changes? |
|---|---------|-----|-------------------|---------|----------|
| 1 | Bondsman recruitment | `/partners/bondsman` | **us → bondsman** | recruit bondsmen into program | **UNCHANGED** — existing OG at [src/app/partners/bondsman/opengraph-image.tsx](src/app/partners/bondsman/opengraph-image.tsx) stays put |
| 2 | Per-client check-in | `/prep/{token}` | **bondsman → his client** | daily check-in workflow, court date prep | **NEW OG needed** + dashboard copy button, only when `check_in_enabled = true` |
| 3 | Per-bondsman referral | `/checkin/{CODE}` or `/{reminders-path}/{CODE}` or legacy `/r/{CODE}` | **bondsman → his client** | product/case-analysis funnel | **NEW routes + OGs, mode-aware** |

**Per-bondsman referral link architecture:**

- **Check-in mode:** `imnotanattorney.com/checkin/{CODE}` — `/checkin/` prefix reads as a service, not a referral. Official feel lives in the path.
- **Reminders-only mode:** **TBD — Phase 0 elite design session.** Constraint: `/prep/{token}` already owns "prep."
- **Legacy `/r/{CODE}`:** stays alive forever. Server-branches on `partners.check_in_enabled`. Old QR codes, SMS templates, and printed flyers keep working even after a mode flip.
- **Dashboard surfaces only the URL matching the partner's current mode.** Bondsman never sees the other variant, can never hand out the wrong one.

**Per-client check-in link architecture:**

- URL: `/prep/{token}` — already renders ([src/app/prep/[token]/page.tsx](src/app/prep/[token]/page.tsx)), token generated on client add ([src/app/api/partner/add-client/route.ts](src/app/api/partner/add-client/route.ts)).
- Missing today: dedicated OG image route. The page has `generateMetadata` openGraph block but no `opengraph-image.tsx` sibling — unfurl falls back to generic Next.js default. For "official" preview, add `src/app/prep/[token]/opengraph-image.tsx`.
- Only shown to bondsman as a copy-able preview link when `partner.check_in_enabled = true`.
- Does NOT exist for reminders-only bondsmen (they only send the referral link).

**Per-partner boolean:** `partners.check_in_enabled boolean DEFAULT true NOT NULL`.

CASCADE:
- us: 3 routes and 3 OG files to maintain, no ambiguity about which URL goes with which mode, legacy alias prevents customer-support fires when old collateral pings in.
- bondsman (direct counterparty): one URL per mode, matching their posture; dashboard never asks them to pick a variant; flip is rare and deliberate; legacy link preserves existing collateral investment.
- defendant (downstream): URL path + OG preview + bridge copy all reinforce the bondsman's stated mode, no cognitive dissonance at 3AM between what the bondsman said and what the page shows.
- ecosystem (bail-bond industry): mode-aware referral pattern matches the real operational split (Captira-integrated shops vs reminders-only shops); raises category floor for any future legal-tech bondsman integrations.
- future-us: "weekly check-in," "county-specific rules," attorney-partner variants all slot into the same URL-per-mode scaffold without a rearchitecture.
- adjacent players (other legal-tech vendors): see a cleaner referral-URL convention, free to adopt it — zero-sum extraction avoided.

Full expert rationale at the bottom. Phase 0 blocks everything else.

---

## Phase 0 — Elite Design Session (BLOCKING)

Before any schema or code changes, spawn a dedicated design session for the reminders-only variant. Block Phase 1 on its deliverables landing at `docs/plans/2026-04-17-reminders-only-variant-design.md` (or equivalent).

### Experts to triangulate
- **[Cached expert: April Dunford]** — category/URL positioning. One product, two modes, URL path must reinforce mode without diluting category.
- **[Cached expert: Peep Laja]** — B2B Message Layers applied to defendant-facing: Clarity > Relevance > Value > Differentiation. URL must pass the Clarity layer for a 3AM crisis buyer.
- **[Cached expert: Sabri Suby]** — offer clarity. Godfather Offer for the reminders-only bondsman's client must survive on its own merit — no implicit comparison to the check-in variant.
- **Atticus (INAA voice)** — brand fit, crisis-buyer filter per `feedback-crisis-buyer-lens-mandatory.md`, UPL-safe, pro-defendant not anti-bondsman.

### Deliverables the design session must produce

1. **URL shape for reminders-only mode.** Candidates to triage (not exhaustive):
   - `/court-reminders/{CODE}`
   - `/my-court-date/{CODE}`
   - `/ready/{CODE}`
   - `/court-prep/{CODE}` (collision-adjacent to `/prep/{token}` — check clarity risk)
   - `/reminders/{CODE}`
   - Must pass: reads official to a 3AM crisis buyer; does not promise check-in compliance; short enough to speak aloud at jail-desk.

2. **OG preview copy for reminders-only REFERRAL route** (`/{reminders-path}/[code]/opengraph-image.tsx`). Fields needed:
   - `title` (1-2 lines)
   - `subtitle` (one line, ≤ 90 chars)
   - `category` (small tag, current uses "Partner Network")
   - Alt text
   - Must NOT use check-in language, must NOT promise specific legal outcomes (UPL).

3. **OG preview copy for per-client CHECK-IN preview** (`/prep/[token]/opengraph-image.tsx`, NEW FILE). Surface #2 in the preview map. Fields needed:
   - `title` (1-2 lines; can interpolate court date and/or partner company from `court_reminders`)
   - `subtitle` (one line, ≤ 90 chars)
   - `category` (e.g. "Court Check-In" — consistency with referral check-in OG aids recognition)
   - Alt text
   - UPL-safe. Token-scoped data (court date, first name, charge type) OK to render; no legal claims.

4. **Bridge page copy** (body + CTA) for reminders-only referral route:
   - Headline parallel to `Referred by {partner}. Here's why.`
   - 2-3 body paragraphs
   - CTA label
   - CTA destination — quiz? reminders signup? product recommendation?

5. **Dashboard copy swaps** for reminders-only bondsmen:
   - `CreativeAssets.tsx` template #6 replacement (currently "Verbal One-Liner (for bondsmen)" opens with "After you tell them about check-ins…")
   - `MessageTemplates.tsx` replacement for the "Add to your check-in text" template
   - Empty-state copy for `ClientTracker.tsx` when check-in columns are hidden
   - Dashboard toggle label + helper text for the Client Workflow settings section
   - Also: per-client "Copy check-in link" vs "Copy referral link" button labels + microcopy for the two-link UI (check-in mode only surfaces both; reminders-only surfaces just referral)

6. **Signup form copy** for `PartnerApplicationForm.tsx`:
   - Radio block question + option labels
   - Reminders-only mode selection must feel like a legitimate product choice, not a lesser alternative

7. **Post-signup welcome copy** — if partner-emails templates differ by mode, specify. Otherwise note "same welcome email, mode-neutral."

### Phase 0 sign-off bar
- All 7 deliverables written into the design doc
- At least one Dunford cascade-check: does the reminders-only variant create wins-for-everyone, or a half-version of the check-in variant? If the latter, the whole toggle is wrong.
- Atticus UPL pass: no "we'll make sure you don't miss court" promises, no anti-attorney framing.
- Crisis-buyer filter: would a 3AM arrestee's spouse scroll past the preview as "junk"? If yes, rework.

**Until Phase 0 deliverable is signed off, do not touch schema, routes, or copy.** Hard gate.

---

## Triage — 8 zoom-out questions (file-path evidence)

### Audit: where does check-in copy actually live?

Searched every client-facing `/r/{code}/*` surface plus the bondsman landing pages for check-in language.

| Surface | Mentions check-in? | Evidence |
|---|---|---|
| [src/app/r/[code]/page.tsx](src/app/r/[code]/page.tsx) (bridge) | **NO** | metadata + page copy talks about "questions for your attorney," never check-in |
| [src/components/BridgePage.tsx](src/components/BridgePage.tsx) | **NO** | grep for `check.?in` returned zero |
| [src/app/r/[code]/opengraph-image.tsx](src/app/r/[code]/opengraph-image.tsx) | **NO** | subtitle "Court prep for your case. Know your charges, know your rights." |
| [src/app/r/[code]/reminders/page.tsx](src/app/r/[code]/reminders/page.tsx) | **NO** | "Don't miss your court date. Free reminders + what to expect." |
| [src/app/r/[code]/quiz/page.tsx](src/app/r/[code]/quiz/page.tsx) | **NO** | Defense Milestone Score quiz |
| [src/app/r/[code]/[product]/page.tsx](src/app/r/[code]/[product]/page.tsx) | **NO** | discount landing for a product tier |
| [src/app/prep/[token]/page.tsx:154-156](src/app/prep/[token]/page.tsx:154) | **YES** | `<CheckInButton />` rendered when `!courtPassed` |
| [src/components/partner/CheckInButton.tsx](src/components/partner/CheckInButton.tsx) | **YES** | the whole component |
| [src/app/api/cron/check-in-prompt/route.ts](src/app/api/cron/check-in-prompt/route.ts) | **YES** | Phase 1 email/SMS, Phase 2 partner missed alerts |
| [src/components/partner/CreativeAssets.tsx:44](src/components/partner/CreativeAssets.tsx:44) | **YES** | "Verbal One-Liner (for bondsmen)" opens with check-in framing |
| [src/components/MessageTemplates.tsx:17,69](src/components/MessageTemplates.tsx:17) | **YES** | "Add to your check-in text" template |
| [src/components/partner/ClientTracker.tsx:92-95,115-175](src/components/partner/ClientTracker.tsx:92) | **YES** | Check-Ins summary stat + Schedule/Check-In columns |
| [src/app/partner/checklist/page.tsx](src/app/partner/checklist/page.tsx) | **NO** | grep zero — but embeds bondsman URL, affected by URL-per-mode |
| [src/app/partner/card/page.tsx](src/app/partner/card/page.tsx) | N/A | bail-packet insert, embeds URL, affected by URL-per-mode |

Public client-facing URLs `/r/{code}/*` are check-in-agnostic today. URL-per-mode adds a new official-feeling check-in URL AND a new reminders-only URL, while keeping `/r/{code}` alive as a legacy fallback.

### Q1 — Granularity (per-partner vs per-client vs per-product)

**Answer: per-partner.**

- Per-client already exists via `court_reminders.check_in_days` ([src/app/api/partner/clients/[id]/schedule/route.ts:60-70](src/app/api/partner/clients/[id]/schedule/route.ts:60)) — execution control.
- Per-partner is the right level for operational posture: which URL variant is surfaced, which templates appear, whether missed-alert cron fires.
- Per-product is wrong: product ladder is orthogonal to bondsman workflow.

**Data model:** `partners.check_in_enabled boolean DEFAULT true NOT NULL`.

### Q2 — Page split vs conditional render — REVISED

**Answer: URL-per-mode, with a legacy alias at `/r/{CODE}` that server-branches.**

Revised after Rahim's call: URL itself should carry the mode signal because "official feel" starts before the defendant lands on the page. Path in SMS/iMessage reinforces legitimacy; preview alone isn't enough.

| Factor | Split URLs (chosen) | Conditional render only |
|---|---|---|
| OG preview distinctness | two previews, each mode-native | one preview, server-branched — weaker signal |
| URL memorability | `/checkin/{CODE}` reads as a product | `/r/{CODE}` reads as an affiliate URL |
| "Official" perception | higher — path is the signal | lower — relies on copy alone |
| Bondsman confusion | dashboard surfaces only the matching URL | same |
| Flip cost (printed collateral) | real — bondsman reprints inserts, QR codes | zero — URL never changes |
| Legacy safety | `/r/{CODE}` alias catches old collateral | N/A |
| Maintenance cost | 3 routes (2 new + 1 legacy), 3 OG files | 1 route, 1 OG |
| Cascade for bondsman | mode flip = reprint, a real operational change | flip is free |
| Cascade for defendant | URL + OG + copy all consistent in mode | copy-only consistency |

Flip cost is the honest tradeoff. Legacy alias absorbs most of the damage. Dashboard banner on flip closes the gap.

### Q3 — OG preview implication — REVISED

**Answer: three OG previews.**

- `/checkin/{CODE}/opengraph-image.tsx` — check-in-flavored
- `/{reminders-path}/{CODE}/opengraph-image.tsx` — reminders-only (Phase 0)
- `/r/{CODE}/opengraph-image.tsx` — legacy, server-branches

All three call `renderOgImage()` from [src/lib/og-template.tsx](src/lib/og-template.tsx) — template stays locked. Only copy varies between callers.

### Q4 — Bondsman-to-client messaging consistency

Onboarding asks during signup; dashboard copy adapts; URL shown matches mode.

Radio on [src/components/partner/PartnerApplicationForm.tsx](src/components/partner/PartnerApplicationForm.tsx), bondsman-only, required. Copy from Phase 0.

Dashboard ([src/app/partner/dashboard/page.tsx](src/app/partner/dashboard/page.tsx)) shows exactly one URL everywhere — the one matching `partner.check_in_enabled`:
- Toolkit section
- Bail-packet insert ([src/app/partner/card/page.tsx](src/app/partner/card/page.tsx))
- Compliance checklist ([src/app/partner/checklist/page.tsx](src/app/partner/checklist/page.tsx))
- Creative assets templates
- Message templates

Non-bondsman partners (`source ≠ "bondsman"`) get the legacy `/r/{CODE}` URL.

### Q5 — Compliance report impact

Report still exists for opt-out partners, shows reminders-only posture. `checkInMode: "disabled"` flag on API response. Client component renders without geolocation section.

### Q6 — Default

Existing bondsmen default to check-in ON (no behavior change). New bondsmen must pick during signup (required). Non-bondsmen default to OFF.

### Q7 — Data model

One column on `partners`:

```sql
ALTER TABLE partners
  ADD COLUMN check_in_enabled boolean NOT NULL DEFAULT true;

UPDATE partners
  SET check_in_enabled = false
  WHERE source IS NULL OR source != 'bondsman';
```

### Q8 — What breaks if partner flips OFF for a client already checking in?

Freeze prompts, preserve history, optional transition notice on `/prep/{token}`. Dashboard banner warning bondsman to reprint collateral.

---

## Expert Cascade Gate

```
WHO:     April Dunford × Peep Laja × Sabri Suby × Atticus (INAA voice)
SOURCE:  Obviously Awesome 5-component canvas; Wynter B2B Message Layers;
         Sell Like Crazy Godfather Offer; INAA brand voice rules
WHY:     Two bondsman operational modes are legitimate distinct offers to the
         defendant (compliance-tight vs reminders-only). URL path is load-bearing
         signal for crisis buyers. Dashboard surfacing the single mode-matching URL
         eliminates bondsman choice pressure. Legacy alias absorbs flip-cost damage.
CASCADE:
  us            → 3 routes, 3 OGs, 1 schema change — modest maintenance for
                  meaningful mode distinction. Elite design session front-loads
                  the hard copy work.
  bondsman      → one URL to hand out, matching their posture.
  defendant     → URL + preview + copy all reinforce the bondsman's stated posture.
  downstream    → indemnitors, family, partner's clients all get consistent branding.
  ecosystem     → bail-bond industry gets a mode-aware referral pattern that actually
                  matches how the industry splits.
  future-us     → "county-specific check-in rules," "weekly check-in," attorney-partner
                  variants slot into the same URL-per-mode architecture.
```

Escape clause NOT invoked — flip-cost mitigated by legacy alias + dashboard banner.

---

## Blast Radius — every file to edit

### Schema (1 migration)
- `supabase/migrations/<YYYYMMDD>_add_check_in_enabled_to_partners.sql`
- `supabase/SCHEMA.md` — document new column

### New routes (2 route trees + OG + children)

**Check-in mode at `/checkin/[code]`:**
- `src/app/checkin/[code]/page.tsx` — bridge for check-in mode
- `src/app/checkin/[code]/opengraph-image.tsx` — check-in OG
- `src/app/checkin/[code]/quiz/page.tsx` — wrapper around `/r/[code]/quiz`
- `src/app/checkin/[code]/reminders/page.tsx` — wrapper
- `src/app/checkin/[code]/[product]/page.tsx` — wrapper

**Reminders-only mode at `/{TBD}/[code]`:** Phase 0 picks the path.
- Parallel structure to check-in tree
- All copy from Phase 0

### Legacy route (`/r/[code]`) becomes alias, not removed
- [src/app/r/[code]/page.tsx](src/app/r/[code]/page.tsx) — SELECT `check_in_enabled`; branch bridge copy variant
- [src/app/r/[code]/opengraph-image.tsx](src/app/r/[code]/opengraph-image.tsx) — SELECT `check_in_enabled`; branch between 2 OG copy sets
- Child routes (`/r/[code]/quiz`, `/r/[code]/reminders`, `/r/[code]/[product]`) — unchanged

### Shared bridge component
- [src/components/BridgePage.tsx](src/components/BridgePage.tsx) — accept `checkInEnabled` prop; all three route trees pass the flag. Body copy + CTA label + CTA destination branch on it.

### API routes
- [src/app/api/partners/apply/route.ts](src/app/api/partners/apply/route.ts) — accept + persist `check_in_enabled` on insert and pending-upgrade; require field when `source === "bondsman"`
- [src/app/api/partner/dashboard/route.ts](src/app/api/partner/dashboard/route.ts) — include `check_in_enabled`
- [src/app/api/partner/settings/route.ts](src/app/api/partner/settings/route.ts) — PATCH `check_in_enabled`
- [src/app/api/partner/compliance-report/route.ts](src/app/api/partner/compliance-report/route.ts) — skip check-in query when disabled; `checkInMode` on response
- [src/app/api/partner/clients/[id]/schedule/route.ts](src/app/api/partner/clients/[id]/schedule/route.ts) — 403 when disabled
- [src/app/api/cron/check-in-prompt/route.ts](src/app/api/cron/check-in-prompt/route.ts) — Phase 1 + 2 join partners, filter `check_in_enabled = true`

### Partner dashboard surfaces (thread the URL)
- [src/lib/partner-data.ts](src/lib/partner-data.ts) (`Partner` type) — add `check_in_enabled: boolean`
- [src/app/partner/dashboard/page.tsx](src/app/partner/dashboard/page.tsx) — compute `partnerUrl` from `partner.check_in_enabled`; thread down; add Client Workflow settings section with toggle + flip warning banner
- [src/components/partner/ToolkitSection.tsx](src/components/partner/ToolkitSection.tsx) — already receives `referralUrl`, becomes mode-aware via dashboard computation
- [src/components/partner/CreativeAssets.tsx](src/components/partner/CreativeAssets.tsx) — accept `checkInEnabled` + mode-aware `referralUrl`; swap template #6 from Phase 0
- [src/components/MessageTemplates.tsx](src/components/MessageTemplates.tsx) — same; swap "Add to your check-in text"
- [src/components/partner/ClientTracker.tsx](src/components/partner/ClientTracker.tsx) — accept `checkInEnabled`; hide check-in UI when disabled; **add two copy buttons per client row when enabled: "Copy check-in link" (emits `/prep/{token}`) and "Copy referral link" (emits mode-matching referral URL). When disabled, only "Copy referral link" appears.**
- [src/app/partner/card/page.tsx](src/app/partner/card/page.tsx) (bail-packet insert) — embed mode-matching URL; QR code data updates
- [src/app/partner/checklist/page.tsx](src/app/partner/checklist/page.tsx) — embed mode-matching URL
- [src/app/partner/compliance-report/ComplianceReportClient.tsx](src/app/partner/compliance-report/ComplianceReportClient.tsx) — disabled banner + reminders-only layout

### Client-facing token-gated page
- [src/app/prep/[token]/page.tsx](src/app/prep/[token]/page.tsx) — fetch `partner.check_in_enabled`; gate `<CheckInButton />`; optional transition notice
- **`src/app/prep/[token]/opengraph-image.tsx` (NEW FILE)** — dedicated OG image for the per-client check-in preview link. SELECT court_reminders row by token; render check-in-themed title/subtitle using first_name + court_date + partner company. Calls `renderOgImage()` from locked [src/lib/og-template.tsx](src/lib/og-template.tsx). Phase 0 design produces the copy.

### Preview surfaces NOT touched
- [src/app/partners/bondsman/opengraph-image.tsx](src/app/partners/bondsman/opengraph-image.tsx) — bondsman recruitment preview (surface #1 in preview map). Stays untouched.
- [src/app/partners/opengraph-image.tsx](src/app/partners/opengraph-image.tsx) — generic partner recruitment. Untouched.

### Signup
- [src/components/partner/PartnerApplicationForm.tsx](src/components/partner/PartnerApplicationForm.tsx) — required radio (bondsman-only); copy from Phase 0

### Middleware (verify)
- `middleware.ts` — currently sets referral cookie on `/r/*` paths. Extend to cover `/checkin/*` and `/{reminders-path}/*`. Verify cookie-set logic is promo-code-driven not path-driven.

### Tests
- Unit: cron partner-join filter
- Unit: `BridgePage.test.tsx` mode-aware render
- Unit: `ClientTracker.test.tsx` mode-aware hide
- E2E: bondsman signup "check-in" → dashboard `/checkin/{CODE}` → bridge + OG + `/prep/{token}` all check-in-flavored
- E2E: bondsman signup "reminders-only" → dashboard reminders URL → bridge + OG + `/prep/{token}` all reminders-flavored
- E2E: legacy `/r/{CODE}` still routes for both modes with server-branched copy
- E2E: bondsman toggles mode → flip banner appears → URL displayed updates → new clients land at new URL

### Explicitly NOT touched
- [src/lib/og-template.tsx](src/lib/og-template.tsx) — locked
- [src/components/partner/CheckInButton.tsx](src/components/partner/CheckInButton.tsx) — caller gates it; component file unchanged

---

## Migration Strategy

- Column defaults `true`, then UPDATE non-bondsmen to `false`
- **Pre-migration sanity query (mandatory):**
  ```sql
  SELECT p.id, p.name, p.source, COUNT(DISTINCT cci.id) AS checkins
  FROM partners p
  JOIN court_reminders cr ON cr.partner_promo_code = p.promo_code
  JOIN client_check_ins cci ON cci.court_reminder_id = cr.id
  WHERE (p.source IS NULL OR p.source != 'bondsman')
  GROUP BY p.id, p.name, p.source;
  ```
  If rows return, carve out exceptions before the UPDATE.
- Existing bondsmen: legacy `/r/{CODE}` still routes all collateral. Dashboard shows new `/checkin/{CODE}`. Bondsman can reprint or keep old — both work.

---

## Rollback Plan

**Feature flag:** `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true` controls new route visibility + dashboard surfacing. Flip → pre-toggle behavior within ~1min.

**Layered rollback:**
1. `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=false` — UI reverts, routes remain dark.
2. Cron hotfix removing `check_in_enabled` join.
3. Revert `/prep/{token}` partner lookup extension.
4. `ALTER TABLE partners DROP COLUMN check_in_enabled;` (non-destructive).
5. Git revert the PR.

**Guardrails:**
- Pre-commit `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1`
- Post-deploy CV: `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends`
- Spot-check one bondsman per mode + legacy URL

**Flip-cost dashboard banner:**

```
<div class="bg-amber-500/10 border border-amber-500/50 rounded-xl px-5 py-4 mb-6">
  <p class="text-amber-300 font-medium">Your partner URL changed.</p>
  <p class="text-zinc-300 text-sm mt-1">
    You flipped to {mode} mode. Your new link is {partnerUrl}.
    Existing QR codes and printed inserts still work, but they show the old
    mode's preview. <a href="/partner/card" class="underline">Reprint your
    bail-packet insert</a> and <a href="/partner/checklist" class="underline">
    your compliance checklist</a> with the new URL.
  </p>
  <button class="text-amber-400 text-xs mt-2 underline">Dismiss</button>
</div>
```

Dismissal stored in localStorage keyed by partner id + flip timestamp.

---

## OG Preview Copy

### `/checkin/[code]/opengraph-image.tsx` (check-in mode)

```
title:    Referred by\n{partnerName}.
subtitle: Your court check-in and prep. Don't miss a date. Know what to expect.
category: Court Check-In
alt:      "Court check-in and prep, referred by {partnerName} — ImNotAnAttorney"
```

### `/{reminders-path}/[code]/opengraph-image.tsx` (reminders-only mode) — **PHASE 0 DELIVERABLE**

TBD. Experts: Dunford + Laja + Suby + Atticus.

### `/r/[code]/opengraph-image.tsx` (legacy alias, server-branches)

- `check_in_enabled = true` → render check-in OG copy
- `check_in_enabled = false` → render reminders-only OG copy

---

## Bridge Page Copy

### `/checkin/[code]/page.tsx` → `BridgePage checkInEnabled={true}`

```
Headline: "{displayName} referred you.\nHere's your check-in."
Body:     "They see a lot of people go through what you're going through.
           The ones who don't miss court are the ones who check in, show up
           prepared, and know what the hearing will look like.

           This service handles your court date reminders, walks you through
           what to expect, and gives you the exact questions to bring to
           your attorney."
Discount: "Their code {promoCode} saves you 10% on case-specific analysis."
CTA:      "Set Up My Court Check-In"
CTA href: "/r/{promoCode}/reminders"
```

### `/{reminders-path}/[code]/page.tsx` → `BridgePage checkInEnabled={false}` — **PHASE 0 DELIVERABLE**

TBD. Parallel structure, reminders-only voice.

### `/r/[code]/page.tsx` (legacy, server-branches)

Passes current `check_in_enabled` to `BridgePage`. Same content as the matching new route.

---

## Partner Application Form — Radio Block (Phase 0 produces final copy)

Structural scaffold:

```
<fieldset>
  <legend>How do you work with clients after bonding?</legend>
  <label><input type="radio" name="checkInMode" value="enabled" required />
    <strong>I run check-ins.</strong> {Phase 0 body copy}
  </label>
  <label><input type="radio" name="checkInMode" value="disabled" required />
    <strong>Reminders only.</strong> {Phase 0 body copy}
  </label>
</fieldset>
```

---

## Ordered Task List

### Phase 0 — Elite Design Session (BLOCKING)
- [ ] Spawn dedicated design session
- [ ] Triangulate Dunford + Laja + Suby + Atticus
- [ ] Write `docs/plans/2026-04-17-reminders-only-variant-design.md` with all 6 deliverables
- [ ] Sign-off: cascade check, UPL pass, crisis-buyer filter
- [ ] Merge deliverable into this plan file before Phase 1

### Phase 1 — Schema + data
- [ ] Pre-migration sanity query (non-bondsman with check-ins)
- [ ] Write migration
- [ ] Apply via Supabase Management API
- [ ] Update `supabase/SCHEMA.md`
- [ ] Verify DB state

### Phase 2 — API layer
- [ ] `api/partners/apply/route.ts` — persist flag
- [ ] `api/partner/dashboard/route.ts` — expose flag
- [ ] `api/partner/settings/route.ts` — PATCH support
- [ ] `api/partner/compliance-report/route.ts` — disabled mode
- [ ] `api/partner/clients/[id]/schedule/route.ts` — 403 when disabled
- [ ] `api/cron/check-in-prompt/route.ts` — partner join filter
- [ ] `lib/partner-data.ts` — type extension

### Phase 3 — Route scaffold
- [ ] Create `app/checkin/[code]/` route tree
- [ ] Create `app/{reminders-path}/[code]/` route tree (path from Phase 0)
- [ ] Refactor `BridgePage.tsx` to accept `checkInEnabled`
- [ ] Update `app/r/[code]/page.tsx` + `opengraph-image.tsx` to server-branch
- [ ] Extend `middleware.ts` to set referral cookie on all three prefixes

### Phase 4 — Client-facing prep
- [ ] `app/prep/[token]/page.tsx` — gate `<CheckInButton />`; transition notice

### Phase 5 — Signup form
- [ ] `PartnerApplicationForm.tsx` — radio (Phase 0 copy)
- [ ] Verify `/partners/bondsman` E2E writes correct flag

### Phase 6 — Dashboard + partner-facing
- [ ] `partner/dashboard/page.tsx` — compute URL; thread down; settings toggle + flip banner
- [ ] `ClientTracker.tsx` — mode-aware hide
- [ ] `CreativeAssets.tsx` — swap template #6
- [ ] `MessageTemplates.tsx` — swap check-in template
- [ ] `partner/card/page.tsx` — mode-matching URL + QR
- [ ] `partner/checklist/page.tsx` — mode-matching URL
- [ ] `partner/compliance-report/ComplianceReportClient.tsx` — disabled layout

### Phase 7 — Testing
- [ ] Unit tests (cron filter, BridgePage, ClientTracker)
- [ ] Playwright E2E for both modes, legacy alias, toggle flip
- [ ] `tsc --noEmit --skipLibCheck` clean before every commit

### Phase 8 — Deploy + verify
- [ ] Ship behind `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=false` (dark routes)
- [ ] `git push origin master`
- [ ] Flip env var to true
- [ ] CV run
- [ ] Spot-check one bondsman per mode + legacy URL
- [ ] Watch cron logs 1 day for skip behavior on disabled partners

---

## Open flags

- **Phase 0 is a hard gate.** Don't start Phase 1+ without the reminders-only design deliverable signed off.
- **Middleware cookie-set audit:** before Phase 3, read `middleware.ts` and confirm the change needed to cover new path prefixes.
- **Bail-packet reprint notice:** email existing bondsmen when toggle ships. "Your new partner URL is {mode-matching}. Print fresh collateral at {card link}. Old URL still works."
- **Analytics attribution:** `/partner/dashboard/route.ts` funnel may need segmenting by entry path. Out of scope.
- **Non-bondsman partners:** stay on `/r/{CODE}`. Future partner sources (attorney, recovery-coach) with their own modes = separate architecture decision.

---

## Sign-off bar

- Phase 0 deliverable exists, signed off, merged
- All 8 triage questions implemented
- Bondsman signup requires mode selection
- Dashboard shows only the mode-matching URL
- Three bridge pages render correctly (check-in, reminders-only, legacy)
- Three OG previews unfurl correctly
- Cron phases 1 + 2 skip disabled partners
- Legacy `/r/{CODE}` still routes for both modes
- Compliance report correct in both modes
- Zero regressions for existing bondsmen
- Dunford, Laja, Suby, Atticus all nodding
