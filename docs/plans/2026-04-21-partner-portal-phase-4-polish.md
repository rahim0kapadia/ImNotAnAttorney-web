# Partner Portal Pristine — Phase 4: Copy/UX Polish

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`

**Parent design:** `docs/plans/2026-04-21-partner-portal-pristine-design.md`

**Base:** `fix/partner-hardening` (Phase 3) — inherits zod, auth-boundary test, CV probe, rate-limit + env-var inventories. Phase 4 PR merges last.

## Scope — polish we can mechanize

Copy/UX polish is inherently subjective and often needs live-browser review. Phase 4 ships what can be **mechanized as tests + audits**, leaving the live-browser adversarial-walkthrough pass for a manual user-driven session.

| Item | Phase 4 action |
|---|---|
| Adversarial walkthrough (7-agent swarm on live URL) | **Defer** — needs live staging URL + screenshot review + subjective judgment calls. User-driven, not auto-mode. |
| axe-core accessibility audit (AA violations per partner route) | **Ship** — adds a Playwright spec using `@axe-core/playwright`. Gated on `E2E_SEED_READY`. |
| UPL scan — static source-text test on defendant-facing copy | **Ship** — structural grep-test asserts no "legal advice", no "ask your attorney to verify", no outcome guarantees on `/r/[code]/*` + `/checkin/[code]`. |
| Brand-voice review (Atti voice across partner-facing pages) | **Defer** — requires judgment + line-by-line rewrites. User-driven. |
| Mobile-scannable audit (375px viewport) | **Defer** — needs live-browser visual review. |

## Tasks

### Task 1: Plan commit ✅ (this doc)

### Task 2: axe-core a11y audit spec
**Files:** `e2e/a11y-partner-routes.spec.ts` (new), `package.json` (add `@axe-core/playwright` dep)

Playwright + axe-core run automated WCAG AA checks against every partner-facing route. Fails on critical/serious violations; warnings on moderate. Gated on `E2E_SEED_READY=1`.

Routes covered: `/partner/login`, `/partner/dashboard`, `/partner/dashboard/branding`, `/r/[code]`, `/r/[code]/reminders`, `/r/[code]/[product]`, `/checkin/[code]`.

On first CI run against a seeded + live environment, any failures become real follow-up work. For now: spec exists + compiles; baseline is "whatever the site currently emits" (not hardened here).

### Task 3: UPL structural scan test
**Files:** `tests/compliance/upl-partner-copy.test.ts` (new)

Read the source text of every defendant-facing partner page (`src/app/r/**/page.tsx`, `src/app/checkin/[code]/page.tsx`) and assert NONE of these phrases appear in the text content (JSX children + string literals):
- "legal advice" (except in the permitted "legal information, not legal advice" disclaimer — exempt that exact substring)
- "ask your attorney to verify"
- "your attorney can confirm"
- Outcome guarantees: "will win", "guaranteed", "dismissal", "not guilty" (in promising tone — context-aware scan, flag for review, don't hard-fail)

The test is rigid for the first two (zero tolerance); soft for outcome-guarantee phrases (print warnings, let the user triage).

Per `.claude/rules/no-hallucinated-legal-data.md` + `.claude/rules/brand-voice.md`: UPL exposure is a real risk + the brand rule is "never put burden back on the defendant." Ask-your-attorney framing violates this.

### Task 4: Push + PR

Final verification. Push. Open PR.

## Exit criteria

- [ ] `npx tsc --noEmit --skipLibCheck` — clean
- [ ] `npx vitest run tests/compliance/upl-partner-copy.test.ts` — green
- [ ] `npx playwright test --list e2e/a11y-partner-routes.spec.ts` — shows expected test count, no config errors
- [ ] ARCHITECTURE.md updated (add a11y spec + UPL scan to E2E Coverage Map)

Phase 4 PR closes the pristine pass. Remaining live-browser adversarial walkthrough, brand-voice line-edits, and mobile-scannable review are user-driven follow-ups.
