# Paths & Environment

## Path Table

All paths derive from `WEB_ROOT`. Set once, everything else follows.

```
WEB_ROOT = C:\Users\email\projects\ImNotAnAttorney-web
```

| Resource | Path (relative to WEB_ROOT) |
|----------|-----------------------------|
| Blog content | `content/blog/` |
| QA sidecars | `content/blog/.qa-state/` |
| QA rubrics | `content/blog/.qa-rubrics/` |
| QA flywheel | `content/blog/.flywheel/qa-patterns.jsonl` |
| Editorial flywheel | `content/blog/.flywheel/editorial-patterns.jsonl` |
| Voice profiles | `content/voice-profiles/` |
| Humanizer JS | `scripts/lib/blog-gen/humanizer.mjs` |
| Topic research | `scripts/lib/blog-gen/topic-research.mjs` |

## Environment Variables

Read from `WEB_ROOT/.env.local`:

| Var | Used By |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase queries (content_gaps, blog_drafts) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase auth |
| `INDEXNOW_KEY` | IndexNow submission on publish |

**MUST source .env.local before running Node scripts:**
```bash
cd {WEB_ROOT} && export $(grep -v '^#' .env.local | xargs)
```

## Supabase Schema — content_gaps

Key fields and valid values:

| Column | Type | Notes |
|--------|------|-------|
| `id` | int | Primary key |
| `charge_type_slug` | text | Maps to voice profile filename |
| `pain_point_slug` | text | Used for spoke article slug derivation |
| `suggested_title` | text | Fallback for slug derivation |
| `suggested_keywords` | text[] | Injected into generation prompt |
| `pillar_slug` | text | Links to pillar content |
| `article_type` | text | `hub` or `spoke` |
| `status` | text | `identified`, `queued`, `in-progress`, `qa-passed`, `qa-failed`, `published`, `declined` |
| `gap_score` | numeric | Priority ranking |
| `demand_score` | numeric | Secondary ranking |
| `has_blog_post` | boolean | Set true on publish |
| `blog_slug` | text | Set on generation |
