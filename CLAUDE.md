<!, caveman-compressed,>
# ImNotAnAttorney-web, Claude Code Instructions

## Ecosystem, INAA Project Family
Part of INAA (ImNotAnAttorney) ecosystem. Freely read files from sibling repos:

| Repo | Path | Role |
|------|------|------|
| ImNotAnAttorney | `C:\Users\email\projects\ImNotAnAttorney\` | Business docs, strategy, content engine, templates, eval framework |
| ImNotAnAttorney-web | `C:\Users\email\projects\ImNotAnAttorney-web\` | Next.js customer-facing site (THIS REPO) |
| ImNotAnAttorney-engine | `C:\Users\email\projects\ImNotAnAttorney-engine\` | Backend worker pipeline (see `../ImNotAnAttorney-engine/tests/test-worker-registry.mjs:16` — asserts 64 workers, 6 phases, discovery tier processing) |
| KDP-Publishing (legal only) | `C:\Users\email\projects\KDP-Publishing\books\` | INAA Defense Guides (Jordan Blake). Only legal defense books. |

**Default boundary**: Do NOT read files from projects outside this table unless Rahim explicitly directs.

**⚠ DEPLOY SCOPE — read before any app-code change:** As of 2026-04-28 cutover, Vercel project `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr) deploys from `ImNotAnAttorney/apps/web/` (monorepo), NOT this repo. Pushing app-code fixes to `ImNotAnAttorney-web/master` MERGES BUT DOES NOT SHIP. For any change that must reach prod (`/src/`, `/supabase/functions/`, `/scripts/` runtime artifacts, `/content/`, `/public/`), work in `C:\Users\email\projects\ImNotAnAttorney\apps\web\`. This repo is now read-only-for-deploys (still useful for blog drafts, Twitter queue, scripts/cron registration, docs). Mirror landing site changes in BOTH repos until -web is fully retired. Verify link state any time: `curl https://api.vercel.com/v9/projects/prj_zqxNgG9xcM235bnKRoEgP5kBOEEr -H "Authorization: Bearer $VERCEL_TOKEN" | jq '{link, rootDirectory}'`. See memory `gotcha-vercel-project-cutover-silent-abandon.md`.

**How repos connect:**
- **This repo → Engine:** Stripe webhook creates `cases` + `processing_jobs` rows. Engine polls `processing_jobs` via cron-job.org every 5min. Discovery tiers ($2,497+) processed by engine workers.
- **This repo → Parent:** Reads `system/EVALUATION-TEAM.md` for audit criteria. Engine reads `system/templates/` for prompt templates at runtime.
- **Shared Supabase:** All 3 repos share one database (`jxjbjmgdukwkoclydqdr`). Web owns checkout/intake/delivery. Engine owns analysis/research/strategy tables. Parent seeds reference data.
- **This repo handles:** Playbooks ($97), Case Decoder ($197), Intelligence Brief ($997) generation via Supabase Edge Functions. Blog, checkout, intake, delivery, cron, email.
- **Engine handles:** X-Ray ($2,497), War Room ($4,997), Situation Room ($9,997), full discovery analysis pipeline.

**Architecture docs:** Each repo has own `ARCHITECTURE.md` at root. Read before cross-repo work.

## Identity: Atticus (Atti)

Auto-loaded via `.claude/rules/atti-persona.md`, 10 thinking modes (6 shared + 4 project-specific), research-first rule, voice.
Rules auto-loaded: `brand-voice`, `fix-engine`, `product-tiers`.
Eval framework: `ImNotAnAttorney/system/EVALUATION-TEAM.md` (11 teams, 164 criteria).

## What This Is

Next.js content-driven sales funnel for ImNotAnAttorney, legal empowerment for criminal defendants holding attorneys accountable. 43 blog posts, 48 pages, multi-tier checkout ($97-$9,997).

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **CMS:** MDX files in `content/blog/`
- **Database:** Supabase (cases, orders, drip email tracking, discovery documents, counters, score_aggregates)
- **Payments:** Stripe Checkout, all tiers LIVE since Mar 28 2026 (live flag per tier in `tiers.ts`). Using `STRIPE_SECRET_KEY_LIVE`. See `.claude/rules/product-tiers.md`
- **Email:** Resend (drip sequences, delivery notifications, admin digests)
- **Hosting:** Vercel, production domain served by project **`imnotanattorney`** (ID: `prj_zqxNgG9xcM235bnKRoEgP5kBOEEr`), NOT `imnotanattorney-web`. Deploy via `git push origin master` ONLY (GitHub integration). NEVER use `vercel deploy` CLI.
- **Schema:** FAQ, Service, Organization, Article, HowTo, BreadcrumbList (with `speakable`, `@id` binding, `citation`, `about`, `educationalLevel`, `audience`, `isBasedOn`)

## Key Architectural Files

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | System map: invariants, component map, E2E flows, env vars, architecture patterns, tier inclusion, deploy guardrails |
| `supabase/SCHEMA.md` | Full column-level DB schema reference (tables, RPCs, indexes, triggers) |
| `supabase/CONTEXT.md` | Case status state machine (19 statuses), Edge Functions, Storage buckets |
| `src/lib/schema.ts` | Structured data generators (about entities, citation mapping) |
| `src/lib/tiers.ts` | TIER_CORE array, single source of truth for pricing |
| `src/lib/drip-emails.ts` | 7+ email sequence definitions |
| `src/lib/blog.ts` | Frontmatter parser + renderer |
| `src/lib/email.ts` | Resend integration |
| `src/app/api/cron/drip/route.ts` | 22-part drip dispatcher |
| `src/lib/intelligence-brief/prompts.ts` | 9 prompt builders for report generation |
| `src/lib/playbook-configs.ts` | 8 charge-type playbook configs |

## Pricing Architecture
All prices come from `tiers.ts` (TIER_CORE) and `products.ts` (STANDALONE_PRODUCTS).
NEVER hardcode prices in components or pages. See `src/lib/PRICING-ARCHITECTURE.md` for the full three-layer system (mechanical, value-stack anchors, prose template functions).
When changing prices, the pre-commit hook validates automatically via `scripts/check-price-staleness.mjs`.

## Important Notes

- Repo: github.com/rahim0kapadia/ImNotAnAttorney-web
- Vercel account: `rahim0kapadia-1967` / team: `rahim-kapadias-projects`
- **CRITICAL: Production Vercel project is `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr), NOT `imnotanattorney-web`.** Env vars and CLI commands must target production project. `.vercel/project.json` set correctly, verify with `vercel env ls`.
- Deploy: `git push origin master` → auto-deploy. NEVER `vercel deploy`, `vercel env pull`, or `vercel domains` commands
- Domain: imnotanattorney.com, Cloudflare A records → Vercel. Already configured. DO NOT touch domain settings.
- Twitter: @ImNotAnAttorney (live: https://x.com/ImNotAnAttorney)

<important if="Rahim says run CV or you are doing verification or continuous verification">

## Continuous Verification (CV)

```bash
node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends
```

Hypotheses monitored: H1 (UPL gate), H2 (cron 48h), H3 (site up), H5 (adversarial UPL), H6 (orders healthy).
H1 CLEAN as of 2026-03-13. Zero violations.

Full verification: `node ~/projects/continuous-verification/verify.mjs,project inna`

</important>

## Design System

- **Brand identity:** `design-system/brand.md`, read BEFORE any UI/frontend work. Defines colors, typography, theme constraints.
- **Design intelligence:** UIU UX Pro Max skill at `.claude/skills/ui-ux-pro-max/`, run `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>",design-system` for industry-specific design recommendations.
- **Global design rule:** `~/.claude/rules/design-intelligence.md` auto-loads on UI files. Priority chain: brand.md > UIU search > frontend-design skill > existing patterns.
- **Brand:** Dark mode only. Amber (#f59e0b) + Navy (#1E3A8A) on black. Playfair Display (display) + Lato (body).

<important if="building UI components, pages, styling, or frontend features">
Read `design-system/brand.md` FIRST. All colors, fonts, design decisions must follow it. Use UIU UX Pro Max search for accessibility rules, UX patterns, industry guidance.
</important>

## Reference

- Business docs + templates: `C:\Users\email\projects\ImNotAnAttorney\`
- Engine pipeline (discovery tiers): `C:\Users\email\projects\ImNotAnAttorney-engine\`
- Elite skills: `C:\Users\email\.openclaw\workspace\skills\`
