# Content Layer — content/

> Two subsystems: MDX blog posts (customer-facing SEO content) and social content queue (multi-platform publishing pipeline).

## Blog — content/blog/

35+ MDX files. Rendered at `/blog/[slug]` via `next-mdx-remote`. Parsed by `src/lib/blog.ts`.

### Frontmatter Schema

```yaml
title: "Post Title"
date: "2026-03-15"
tags: ["dui", "breathalyzer", "dismissal"]
excerpt: "Short description for listings and meta description"
author: "ImNotAnAttorney Team"
category: "dui-defense" | "drug-defense" | "federal-crime" | "sex-offense" | "white-collar" | "probation" | "self-defense" | "general"
faqs:
  - q: "Question?"
    a: "Answer."
howToSteps:
  - name: "Step name"
    text: "What to do..."
```

All fields except `faqs` and `howToSteps` are required. `faqs` generates FAQ schema (JSON-LD). `howToSteps` generates HowTo schema.

### Post Distribution by Category

| Category | Count | Notes |
|----------|-------|-------|
| `dui-defense` | ~19 | Largest category; DUI is the live tier |
| `drug-defense` | ~6 | Drug possession + trafficking |
| `federal-crime` | ~3 | Federal criminal defense |
| Other categories | ~7 | Self-defense, probation, white-collar, general |

### Key Functions (src/lib/blog.ts)

| Function | Returns | Used By |
|----------|---------|---------|
| `getAllPosts()` | All posts sorted by date desc | Blog listing page |
| `getPostBySlug(slug)` | Single post with MDX body | Individual post page |
| `getRelatedPosts(category, tags, excludeSlug)` | 3 related posts | Post page sidebar |
| `getReadingTime(content)` | Minutes string | Post metadata |
| `getPostsByCategory(category)` | Filtered post list | Category filter |

### UPL Compliance Rule
Every blog post must include a disclaimer: "This article provides general information, not legal advice. Every case is different. Consult a licensed attorney in your jurisdiction." This is audited by `src/lib/blog-generation/qa-upl.ts` for AI-generated posts.

### Expert Attribution Rule
All expert references must exist in `ImNotAnAttorney/system/EXPERT-REFERENCE.md` and be web-verified. The Victor Knapp incident (March 2026) — a fabricated attorney cited across 3 pages — established this as a hard rule.

## Content Queue — content/queue/

Multi-platform social content staging directory. Content moves from `pending/` to `published/` after posting via Postiz.

### Directory Structure

```
content/queue/
  email/
    pending/      ← Drafts ready to send
    published/    ← Sent (archived)
  facebook/
    pending/
    published/
  quora/
    pending/
    published/
  reddit/
    pending/
    published/
  tiktok/
    pending/
    published/
  twitter/
    pending/
    published/
  youtube/
    pending/
    published/
  pinterest/
    pending/
    published/
  growth/         ← Strategy + growth docs (not platform-specific)
    pending/
    published/
```

### File Format

Each content item is a `.md` file with frontmatter:

```yaml
---
platform: twitter
type: thread | post | video-script | email
topic: "DUI defense tips"
source_post: "content/blog/dui-breathalyzer-refusal.mdx"  # optional
status: pending | approved | published
created: 2026-03-15
scheduled: 2026-03-16T14:00:00Z  # optional
---

Content body here...
```

### Publishing Workflow

Content queue integrates with the Atlas-wide Postiz publishing pipeline:
1. Draft created in `content/queue/{platform}/pending/`
2. Telegram approval via `@ClaborBot` (operator reviews before publish)
3. Post via Postiz API → status updated to `published`, file moved to `published/`
4. Postiz is self-hosted at `localhost:5100` (marketing-hq project)

## How To

- **Add a blog post manually:** Create `content/blog/your-slug.mdx`. Required frontmatter: `title`, `date`, `tags`, `excerpt`, `author`, `category`. Body is MDX (standard markdown + JSX components). No import needed for basic markdown — advanced components must be registered in `src/app/blog/[slug]/page.tsx`'s MDX components map.
- **Generate a blog post via pipeline:** Use `POST /api/admin/blog-pipeline` (operator-only). Pipeline runs `blog-generation/generate-post.ts` → `qa-humanizer.ts` → `qa-slop.ts` → `qa-upl.ts` → saves to `content/blog/`. Review output before committing.
- **Add content to queue:** Create a `.md` file in `content/queue/{platform}/pending/` with the frontmatter above. Status: `pending`. Operator reviews and approves via Telegram before publishing.
- **Fix a UPL violation in a post:** Edit the `.mdx` file directly. Remove specific outcome predictions, add disclaimers, reframe legal claims as questions for attorneys. Redeploy via `git push origin master`.
- **Update frontmatter fields:** Edit the `.mdx` file frontmatter directly. `getAllPosts()` re-reads on next build. No DB sync needed — blog is file-system only.

## Key Constants

| Constant | Value | File:Line |
|----------|-------|-----------|
| BLOG_DIR | `path.join(process.cwd(), "content", "blog")` | `src/lib/blog.ts:33` |
| Allowed categories | dui-defense, drug-defense, federal-crime, sex-offense, white-collar, probation, self-defense, general-defense | `src/lib/blog.ts` |
| Required frontmatter | title, date, tags, excerpt, author, category | `src/lib/blog.ts:15-24` |
| Optional frontmatter | faqs, howToSteps, lastModified | `src/lib/blog.ts:55-60` |
| Post slug regex | `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` (prevents path traversal) | `src/lib/blog.ts:106` |
| Post sort order | By date descending (newest first) | `src/lib/blog.ts:92` |
| Related posts limit | 2 posts (same category OR shared tag) | `src/lib/blog.ts:145, 154-155` |
| Default author | "ImNotAnAttorney Team" | `src/lib/blog.ts:122` |
| Default category | "general-defense" | `src/lib/blog.ts:123` |

## Integration Points

**Who reads blog files:**
- `src/app/blog/page.tsx` → `getAllPosts()` at build time, category filter
- `src/app/blog/[slug]/page.tsx` → `getPostBySlug()`, `getRelatedPosts()`
- `src/app/blog/[slug]/opengraph-image.tsx` → `getPostBySlug()` for dynamic OG
- `src/app/sitemap.ts` → `getAllPosts()` for sitemap URLs
- `src/lib/schema.ts` → FAQ/HowTo schema from frontmatter `faqs`/`howToSteps`

**Who writes to content/queue/:**
- Content operators create `.md` files in `content/queue/{platform}/pending/`
- Telegram approval (@ClaborBot) moves pending → approved → published
- Postiz API (self-hosted at localhost:5100) handles final publishing

**Shared state (filesystem only):**
- `content/blog/*.mdx` — 35+ blog post files (no DB sync)
- `content/queue/{platform}/pending/` — staged content
- `content/queue/{platform}/published/` — archived published content

## Gotchas

1. **Frontmatter date must be `YYYY-MM-DD`.** No timezone handling. Silently defaults to current date if format is wrong.

2. **UPL compliance is NOT automated for hand-written MDX.** QA checks in `blog-generation/` only apply to AI-generated posts. Hand-written posts must include UPL disclaimers manually.

3. **Slug renaming breaks URLs.** No redirect system. If you rename a slug, old URLs return 404. Add redirects in `next.config.ts` for renamed posts.

4. **Blog is file-system only.** No DB sync. Category/tag changes propagate on next build but any DB queries referencing old values remain stale.

5. **`lastModified` defaults to `date` if unset.** Google sees the original date for `dateModified` in Article schema. Always update `lastModified` when editing a post.

6. **Related posts matching:** Category matching is case-insensitive, tag matching is exact. If no related posts found for a category, returns empty array.

7. **Content queue directory structure is strict.** Each platform must have `/pending/`, `/published/` subdirs. Files in wrong directory won't be discovered by Postiz.

8. **Expert Attribution Rule.** All expert references must exist in `ImNotAnAttorney/system/EXPERT-REFERENCE.md` and be web-verified. The Victor Knapp incident (March 2026) established this as a hard rule.

## Maintenance Triggers

- **New blog post created** → Ensure unique lowercase slug, validate frontmatter, test render at `/blog/{slug}`
- **Blog post deleted** → Remove `.mdx` file, blog listing + sitemap auto-update on next build
- **New category added** → Update allowed categories list, update CATEGORY_LABELS in `src/app/blog/page.tsx`, update routing maps in HomepageHero + BlogCTA
- **Social content queued** → Create `.md` in `content/queue/{platform}/pending/` with proper frontmatter
- **Content queue platform added** → Create `{platform}/pending/` and `{platform}/published/` directories
