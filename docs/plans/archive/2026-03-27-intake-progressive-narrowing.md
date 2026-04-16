# Plan: Intake Form 3-Screen Progressive Narrowing (Task 10)

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Intake form uses hardcoded charge-type dropdowns. Replace with DB-driven 3-screen progressive narrowing using new components.
- **Key files:**
  - Modify: `src/app/intake/page.tsx`
  - Modify: `src/app/api/intake/route.ts`
  - Create: `src/app/api/charge-taxonomy/categories/route.ts`
  - Create: `src/app/api/charge-taxonomy/charges/route.ts`
  - Create: `src/app/api/charge-taxonomy/questions/route.ts`
- **Tech stack:** Next.js 15 App Router, TypeScript, Supabase, Tailwind
- **Key decisions:** Old dropdown kept as fallback when taxonomy DB is empty; new flow activates only when categories load successfully.

## Files to Create
1. `src/app/api/charge-taxonomy/categories/route.ts`, GET, returns all categories
2. `src/app/api/charge-taxonomy/charges/route.ts`, GET `?category=&jurisdiction=`, returns charges with statute info
3. `src/app/api/charge-taxonomy/questions/route.ts`, GET `?charge=`, returns charge questions

## Files to Modify
4. `src/app/intake/page.tsx`, Add imports, STATE_ABBR helper, new form state fields, taxonomy state, useEffect for categories, new 3-screen UI block, updated validation gate, updated handleSubmit
5. `src/app/api/intake/route.ts`, Relax charge-type validation (log unknown slugs instead of rejecting), store taxonomy fields in charge_specific_data

## Numbered Tasks
1. Create `src/app/api/charge-taxonomy/categories/route.ts`
2. Create `src/app/api/charge-taxonomy/charges/route.ts`
3. Create `src/app/api/charge-taxonomy/questions/route.ts`
4. Modify `src/app/intake/page.tsx`, imports + state + UI + validation + submit
5. Modify `src/app/api/intake/route.ts`, relax validation + store taxonomy fields
6. Run `npx next build` and fix any errors
7. Commit all files
