## Context
- **Repo:** C:/Users/email/projects/ImNotAnAttorney-web
- **Problem:** 2 admin partner routes rely solely on middleware for auth with no inline defense-in-depth. The deprecated `operator-auth.ts` file should be removed now that `auth/guards.ts` replaces it.
- **Key files to read first:**
  - `src/app/api/admin/partners/route.ts`
  - `src/app/api/admin/partners/[id]/route.ts`
  - `src/lib/auth/guards.ts`
  - `src/lib/operator-auth.ts`
  - `src/middleware.ts`
- **Tech stack:** Next.js 15, TypeScript, Supabase
- **Key decisions:** Use `requireAdmin()` from `@/lib/auth/guards` (already established pattern). GET handlers that lack a `req` parameter need one added.
- **Setup/prerequisites:** None beyond existing env vars.

## Plan

### Part A: Add defense-in-depth to 2 admin routes

**File 1: `src/app/api/admin/partners/route.ts`**
- Add import for `requireAdmin` from `@/lib/auth/guards`
- `GET()` handler: add `req: NextRequest` parameter, add guard check at top
- `POST(req)` handler: add guard check at top (param already exists)

**File 2: `src/app/api/admin/partners/[id]/route.ts`**
- Add import for `requireAdmin` from `@/lib/auth/guards`
- `GET(_req, context)` handler: rename `_req` to `req`, add guard check at top
- `PATCH(req, context)` handler: add guard check at top
- `POST(req, context)` handler: add guard check at top

**Commit:** `fix: add defense-in-depth auth to 2 admin routes that relied on middleware only`

### Part B: Clean up deprecated operator-auth.ts

1. Grep for `isOperatorAuthorized` and `operator-auth` references in src/
2. If zero references: delete the file
3. If referenced: add `@deprecated` JSDoc
4. Run `npx tsc --noEmit` to verify no type errors

**Commit:** `chore: remove deprecated operator-auth.ts (replaced by auth/guards.ts)`
