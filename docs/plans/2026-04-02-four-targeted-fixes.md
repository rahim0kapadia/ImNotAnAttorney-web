# Four Targeted Fixes — robots.ts, checkout route, package.json, schema.ts

## Context
- **Repo:** ImNotAnAttorney-web (`C:\Users\email\projects\ImNotAnAttorney-web`)
- **Problem:** Four small issues identified during site audit: missing AI bot rules in robots.txt, unguarded req.json() in checkout route, outdated Anthropic SDK, and a potentially dead URL in schema.ts
- **Key files:** `src/app/robots.ts`, `src/app/api/checkout/route.ts`, `package.json`, `src/lib/schema.ts`
- **Tech stack:** Next.js 15 + TypeScript
- **Key decisions:** Follow existing patterns (intake route try/catch for req.json, existing bot rule format in robots.ts). schema.ts URL verified as valid — no change needed.

## Tasks

### Task 1: Add AI bot entries to robots.ts — DONE
- **File:** `src/app/robots.ts`
- **Change:** Add ClaudeBot, Claude-User, and Claude-SearchBot rules after Applebot-Extended, same `allow: ["/"]` pattern

### Task 2: Verify schema.ts URL — NO CHANGE NEEDED
- **File:** `src/lib/schema.ts` line ~286
- **Finding:** `/blog/how-to-prepare-for-sentencing` is valid — content exists at `content/blog/how-to-prepare-for-sentencing.mdx` and the `[slug]` route serves it

### Task 3: Add try/catch to checkout route req.json() — DONE
- **File:** `src/app/api/checkout/route.ts` line 54
- **Change:** Wrap `req.json()` in its own try/catch returning 400, matching the pattern from `src/app/api/intake/route.ts` lines 71-76

### Task 4: Upgrade @anthropic-ai/sdk — PENDING
- **File:** `package.json`
- **Change:** Bump `@anthropic-ai/sdk` from `^0.80.0` to `^0.82.0`, then run `npm install`
