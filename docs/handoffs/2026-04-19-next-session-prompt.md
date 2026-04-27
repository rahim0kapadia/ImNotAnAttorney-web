# Next-Session Prompt — 2026-04-19 handoff

Paste the fenced block below into the next session. Self-contained — zero additional context needed.

---

```
Continue INAA-web work. The 2026-04-19 bondsman-referral audit master plan
shipped end-to-end today (Sessions A + B, 18 items, 5 rounds of reviewer
fan-outs). All pushed to origin/master. Current HEAD: 8e3f429.

Master plan (annotated with per-item status):
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-19-bondsman-referral-audit-master.md

Latest handoffs:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-19-session-b-7items-shipped.md
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-19-session-a-dashboard-structural.md

Three work buckets remain, ranked by leverage:

1. WHITE-LABEL INFRASTRUCTURE (biggest unstarted piece). Deferred from
   master plan, no plan written yet. Scope:
   - DB migration: `partners.logo_url`, `brand_color_primary`,
     `brand_color_accent`, `website_url`
   - Brandfetch API + Color Thief v3 extraction fallback + manual hex
     override UI
   - Partner dashboard upload widget
   - Shared shell components: <PartnerBrandedShell> (pre-quiz bondsman-
     referral pages) + <InaaBrandedShell> (quiz + paid-funnel) — per
     strategic decisions #1-#3 in master plan
   - Supabase Storage bucket for logo assets
   - OG template refactor to consume partner brand colors + logo
   - Contrast guard so partner-chosen colors never fail WCAG AA
   First step: WRITE A PLAN at docs/plans/2026-04-YY-white-label-
   infrastructure.md. Do NOT start code until the plan is written and
   approved.

2. VERIFY 2026-04-17 PLANS ACTUALLY SHIPPED. Earlier plans may or may
   not be done — need to grep before building on top of them:
   - docs\plans\2026-04-17-guarantee-truth-audit.md — split "Questions
     Guarantee" (CD/IB) from "Discovery Guarantee" (X-Ray+). TRUTH/UPL
     CRITICAL. The canonical guarantee language used on 2026-04-19
     (`at least 15 case-specific questions your attorney hasn't raised`)
     assumes this shipped. If not shipped, there's a live UPL-adjacent
     overclaim on the homepage.
   - docs\plans\2026-04-17-brand-dna-tagline-surface-onsite.md — "The
     legal system has a file on you. We help you build one on them."
     on Homepage + /masked + About.
   - docs\plans\2026-04-17-narrative-shift-plural-peer-voice.md
   - docs\plans\2026-04-17-legal-compliance-round3.md
   - docs\plans\2026-04-17-og-favicon-and-referral-copy.md
   For each: grep for the intended copy change, confirm
   presence/absence, mark DONE or spawn a finisher.

3. FOLLOW-UP AUDITS flagged in the master plan:
   - src\lib\tiers.ts — `delivery` field speed-selling-language audit
     (leaks onto every tier display; atti-persona rule bans selling
     on speed)
   - src\lib\partner-data.ts — full FAQ text audit (Atti-voice pass
     on all 6 FAQ answers, not just the 10%-off line already fixed
     in 8e3f429)
   - src\components\partner\* — hardcoded child-component copy
     audit on CreativeAssets, ComplianceKit, EarningsSection,
     PartnerAnalytics (the round-2 Fix E voice pass covered most
     surfaces but leftover hardcoded strings may remain)

Non-bondsman open surfaces (lower priority, from memory):
  - Charge extraction pipeline — Postgres timeout blocks full run
  - CL bulk data load — verify the parallel Session C thread (2026-
    04-19 Supabase Micro 53100 incident) actually completed; run
    CV probe before assuming anything is populated
  - Free tools Phases 6-7 (1-5 shipped 2026-04-14)
  - Two untracked blog drafts:
      content\blog\30000-police-encounters-your-rights.mdx
      content\blog\plea-trap-94-percent-never-see-jury.mdx

Rules that matter for this work:
  - Expert-Decides: .01%-expert triangulation before every strategic
    call, not Rahim-as-fallback
  - Pristine-Or-Nothing: reviewer findings = fix ALL severities
  - Fix-Engine (INAA-web specific): fix the producer, not the output
  - UPL guard: information + questions, never advice; no "attorney
    will verify" language
  - No hardcoded prices; TIER_CORE single source
  - No text-zinc-500 on text-xs; ≥ 44×44 touch targets; no &mdash;
    HTML entities; unicode em-dash or commas

Recommended first move: pick bucket 1 (white-label infra plan) if the
project is ready for that lift, or bucket 2 (verify 2026-04-17 plans)
if the homepage UPL exposure is a concern. Bucket 3 is filler for
small-window sessions.
```

---

**Why this prompt:** the next session needs to know (a) what shipped today, (b) the three buckets of remaining work ranked by leverage, (c) which rules apply so they don't re-litigate. The prompt is self-contained — Rahim can paste it into a fresh session and the model has everything.
