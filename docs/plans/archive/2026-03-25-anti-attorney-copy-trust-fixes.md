# Fix Anti-Attorney Copy and Trust Gaps on 4 Pages + Playbook Configs

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Website evaluation found GATE-level failures (POS6, U13, POS1, POS3, POS4, T1, T5, ANON3) for anti-attorney language, missing attorney-anxiety resolution, and missing trust content on several pages.
- **Key files:**
  1. `src/app/playbooks/page.tsx`, catalog page hero + metadata
  2. `src/app/dui-checklist/page.tsx`, squeeze page checklist items
  3. `src/app/resources/page.tsx`, lead magnets + DUI playbook section
  4. `src/app/dui-defense/page.tsx`, state hub page
  5. `src/lib/playbook-configs.ts`, subheadline taglines for drug-possession, probation-violation, DUI
- **Tech stack:** Next.js 15, TypeScript, Tailwind CSS
- **Key decisions:** Empowerment framing replaces anti-attorney framing. Named expert attribution where generic claims exist. Tribe signals for trust. All copy stays UPL-compliant.
- **Setup:** `cd ImNotAnAttorney-web && npm run dev` to verify changes render correctly

## Triage: FEATURE (5 files)

## Tasks

### Task 1: Fix playbook-configs.ts subheadlines (source of card taglines)
**File:** `src/lib/playbook-configs.ts`
- Line ~104-105 (DUI): Change "Your attorney should be fighting like your life depends on it, because it does" to "One mistake doesn't define your future, but only if your defense covers every angle. 26 questions, case stage roadmap, red flag checklist, and scorecard."
- Line ~262-263 (Drug Possession): Change "Your lawyer should be proving it, not just pushing a plea" to "The drugs weren't yours? 26 questions that make sure nothing gets missed in your defense."
- Line ~427-428 (Probation Violation): Change "Your attorney should be fighting the violation, not just accepting it" to "One missed meeting and you're back in the system. Know exactly what defenses apply to your situation."
- Keep remaining subheadlines (white-collar, sex-offense, federal-criminal, drug-trafficking, self-defense), they are clean.

### Task 2: Fix playbooks/page.tsx hero + metadata
**File:** `src/app/playbooks/page.tsx`
- Line 132-134: Replace "26 questions your attorney hopes you never ask" with "26 questions that change how your next attorney meeting goes"
- Line 38: Fix openGraph description similarly (remove "hopes you never ask")
- Add tribe signal after the subtitle: "Join thousands of defendants who refused to go into court unprepared."
- Line 209-211: Add named framework reference after "Built from methods developed by elite defense attorneys across 375+ exonerations": append "including Lawrence Taylor's DUI procedural challenge framework and Barry Scheck's forensic evidence methodology."

### Task 3: Fix dui-checklist/page.tsx
**File:** `src/app/dui-checklist/page.tsx`
- Line 57: Change "Request your DMV hearing tonight" to "Check your state's DMV hearing deadline, some are as short as 7 days from arrest"
- Line 58: Add jurisdiction variance warning: "Deadlines vary by state, verify the timeline in your jurisdiction."
- Line 68: Change "6 questions that separate DUI specialists from attorneys who just take your money" to "6 questions that help you find a DUI specialist who's the right fit"
- Line 69: Add near the questions: "Questions informed by Lawrence Taylor's DUI defense methodology."

### Task 4: Fix resources/page.tsx
**File:** `src/app/resources/page.tsx`
- Line 60-61 ("10 Questions Your Attorney Hopes You Never Ask"): Keep the title (lead magnet name) but add attorney-anxiety resolution text in the description: "Good attorneys welcome these questions, they show you're paying attention to your own case."
- Line 262 ("26 Questions Your Attorney Hopes You Never Ask"): Same pattern, keep title, add resolution nearby: "The best defense attorneys want informed clients. These questions help you be one."
- Add expert attribution near discovery checklist description: "Based on defense frameworks from attorneys who've handled thousands of cases."

### Task 5: Fix dui-defense/page.tsx
**File:** `src/app/dui-defense/page.tsx`
- Add 2-3 emotional opening sentences ABOVE the state grid (after the existing p tag, before the grid): "You were just arrested for DUI. The laws that affect your case, penalties, deadlines, defense options, depend entirely on where you were charged. Select your state below."
- Add tribe signal: "Over 1.5 million DUI arrests happen every year. You are not the first person to go through this."
- Add methodology reference: "Defense questions built on Lawrence Taylor's systematic DUI defense framework and NHTSA field sobriety test standards."
- Line 143: Fix "26 questions your DUI attorney hopes you never ask" to "26 questions that change how your next DUI attorney meeting goes"
- Line 158-159: Fix disclaimer, replace "Consult a licensed attorney in your jurisdiction" (banned per content-rules) with "Your attorney remains the final authority on strategy decisions specific to your situation."

## Execution Order
Tasks 1-5 are independent (different files), execute in parallel via swarm.

## Quality Checks
- No "you should" / "we recommend" / "we advise" in any new copy
- No anti-attorney framing ("your lawyer should be", "hopes you never ask", "just take your money")
- Named expert references use verified names only (Lawrence Taylor, Barry Scheck, both in EXPERT-REFERENCE.md)
- Preserve all existing JSX structure, Tailwind classes, component imports
