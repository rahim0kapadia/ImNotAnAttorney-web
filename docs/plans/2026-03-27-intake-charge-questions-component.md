# Plan: IntakeChargeQuestions Component

## Context
- Repo: ImNotAnAttorney-web
- Problem: Need a DB-driven charge-specific questions component for the intake flow (Task 9 of 10)
- Key files: `src/components/IntakeChargeQuestions.tsx` (new)
- Tech stack: Next.js 15, TypeScript, Tailwind CSS
- Key decisions: Pill/chip button UI (not dropdowns), flex-wrap for mobile, answers stored in parent state via onChange

## Tasks

1. Create `src/components/IntakeChargeQuestions.tsx`
   - Props: `questions: ChargeQuestionData[]`, `answers: Record<string, string>`, `onChange`
   - Return null when questions array is empty
   - Render each question as a labeled group of pill/chip option buttons
   - Selected state: amber (border-amber-500, bg-amber-500/10, text-amber-400)
   - Unselected state: zinc (border-zinc-700, bg-zinc-900, text-zinc-400, hover:border-zinc-600)
   - Options wrap with flex-wrap, mb-6 per question group

2. Verify TypeScript compiles: `npx tsc --noEmit --skipLibCheck`

3. Commit
