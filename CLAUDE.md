# ImNotAnAttorney-web — Claude Code Instructions

## Identity: Atticus (Atti)

Auto-loaded via `.claude/rules/atti-persona.md` — 6 thinking modes, research-first rule, voice.
Rules auto-loaded: `brand-voice`, `fix-engine`, `product-tiers`.
Eval framework: `ImNotAnAttorney/system/EVALUATION-TEAM.md` (11 teams, 164 criteria).

## What This Is

A Next.js content-driven sales funnel for ImNotAnAttorney — legal empowerment for criminal defendants holding their attorneys accountable. 35 blog posts, 14 pages, multi-tier checkout ($97-$4,997).

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **CMS:** MDX files in `content/blog/`
- **Database:** Supabase (cases, orders, drip email tracking, discovery documents, counters, score_aggregates)
- **Payments:** Stripe Checkout — dual-mode (live flag per tier in `tiers.ts`). DUI is LIVE. See `.claude/rules/product-tiers.md`
- **Email:** Resend (drip sequences, delivery notifications, admin digests)
- **Hosting:** Vercel — `rahim-kapadias-projects/imnotanattorney-web`. Deploy via `git push origin master` ONLY (GitHub integration). NEVER use `vercel deploy` CLI.
- **Schema:** FAQ, Service, Organization, Article, HowTo, BreadcrumbList (with `speakable`, `@id` binding, `citation`, `about`, `educationalLevel`, `audience`, `isBasedOn`)

## Key Architectural Files

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | Full system architecture, DB schema, case status state machine, env vars |
| `src/lib/schema.ts` | Structured data generators (about entities, citation mapping) |
| `src/lib/tiers.ts` | TIER_CORE array — single source of truth for pricing |
| `src/lib/drip-emails.ts` | 7+ email sequence definitions |
| `src/lib/blog.ts` | Frontmatter parser + renderer |
| `src/lib/email.ts` | Resend integration |
| `src/app/api/cron/drip/route.ts` | 22-part drip dispatcher |
| `src/lib/intelligence-brief/prompts.ts` | 9 prompt builders for report generation |
| `src/lib/playbook-configs.ts` | 5 charge-type playbook configs |

## Important Notes

- Repo: github.com/rahim0kapadia/ImNotAnAttorney-web
- Vercel account: `rahim0kapadia-1967` / team: `rahim-kapadias-projects`
- Deploy: `git push origin master` → auto-deploy. NEVER `vercel deploy`, `vercel env pull`, or `vercel domains` commands
- Domain: imnotanattorney.com — Cloudflare A records → Vercel. Already configured. DO NOT touch domain settings.
- Twitter: @ImNotAnAttorney (live: https://x.com/ImNotAnAttorney)

<important if="Rahim says run CV or you are doing verification or continuous verification">

## Continuous Verification (CV)

```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```

Hypotheses monitored: H1 (UPL gate), H2 (cron 48h), H3 (site up), H5 (adversarial UPL), H6 (orders healthy).
H1 CLEAN as of 2026-03-13. Zero violations.

Full verification: `node ~/projects/continuous-verification/verify.mjs --project inna`

</important>

## Reference

- Business docs: `C:\Users\email\projects\ImNotAnAttorney\`
- Elite skills: `C:\Users\email\.openclaw\workspace\skills\`
