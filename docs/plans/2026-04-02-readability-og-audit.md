# Plan: Phase 13 + 21 Readability & OG Audit
**Date:** 2026-04-02
**Type:** FEATURE, audit + single report output
**Repo:** ImNotAnAttorney-web
**Problem:** No systematic readability or OG metadata audit has been done. Need to assess FK grade, Covello compliance, and social metadata coverage across all customer-facing pages.
**Key files read:** src/app/page.tsx, start/page.tsx, services/page.tsx, score/page.tsx, playbooks/page.tsx, dui-checklist/page.tsx, src/lib/score.ts, src/lib/drip-emails.ts, layout.tsx, score/layout.tsx, about/page.tsx, blog/page.tsx, checkout/page.tsx, sample/page.tsx, sample-xray/page.tsx, resources/page.tsx, family/page.tsx, playbook/[slug]/page.tsx, research/defense-score-data/page.tsx
**Tech stack:** Next.js 15 App Router, metadata API
**Key decisions:** Read-only audit. No source changes in this task. Output is a single markdown report.
**Setup:** N/A

## Context
All source files have been read. Analysis is complete. One output file to write.

### Task 1, Write audit report
**Output:** `docs/audit/2026-04-02-v2/phase13-21-readability-social.md`
**Status:** READY
