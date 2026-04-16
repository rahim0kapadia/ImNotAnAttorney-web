# Atti Persona & CLAUDE.md Architecture Fix, INAA-web

**Date:** 2026-03-24
**Repo:** ImNotAnAttorney-web
**Problem:** CLAUDE.md is 221 lines (over 200-line recommendation). Only 1 rules file exists (persona). Critical rules like "fix the engine not the output," brand voice, UPL constraints, and the engine mapping table are inline, competing for attention with every user prompt. No `@path` imports or `<important>` tags used.
**Context:** This plan mirrors what was created for Cloud Culture (CLOUD_CULTURE/docs/plans/2026-03-24-nimbus-persona-and-claude-md-fix.md). Same research, same architecture, adapted for INAA-web.

---

## What Was Already Done (2026-03-24)

1. Created `.claude/rules/atti-persona.md` (15 lines, auto-loaded every session)
2. Updated CLAUDE.md line 5 to pointer: "Auto-loaded via `.claude/rules/atti-persona.md`"
3. Triangulated 14 niched SEO/GEO experts and updated `ImNotAnAttorney/system/EVALUATION-TEAM.md` Team 8
4. Research-first rule baked into persona

---

## The Core Problem: Instruction Decay + Wasted Context

At 221 lines, CLAUDE.md contains:
- **~70 lines of inventory** (pages list, component list, blog post list), Claude can derive this from the codebase
- **~20 lines of engine mapping table**, critical but only relevant when fixing bugs
- **~15 lines of CV commands**, only relevant when Rahim says "run CV"
- **~10 lines of SEO/GEO feature list**, derivable from code

Most of this competes for attention every session but is only needed sometimes.

### Reliability Hierarchy (from research)

| Mechanism | Reliability | Use For |
|---------, |-------------|---------|
| **`.claude/rules/` (no `paths:`)** | ~100% | Persona, always-on behavioral rules |
| **`@path` imports in CLAUDE.md** | ~100% | Critical reference files that must be visible |
| **`.claude/rules/` (with `paths:`)** | ~70-80% | Conditional rules scoped to file types |
| **Hooks** | 100% | Hard enforcement (already have triage, research, etc.) |
| **`<important if="...">` tags** | ~60% | Conditional sections in CLAUDE.md |
| **Plain text "read this file"** | ~5% | NEVER rely on this alone |

### Key Research (Sources in Cloud Culture plan)

- ~150 instruction slots total. System prompt uses ~50. Only ~100 left for ALL rules + CLAUDE.md.
- Context compaction "summarizes rules into oblivion" in long sessions.
- The 30-line test: "If I remove this line, will Claude make a mistake?" Delete everything else.
- Positive instructions > negative. Anchor critical rules at top AND bottom.
- If Claude ignores a rule 3 times → move it to a hook.

---

## Current CLAUDE.md Audit (221 Lines)

| Lines | Section | Classification | Reasoning |
|-------|---------|---------------|---------, |
| 1-5 | Identity pointer | **INLINE**, keep | 2 lines, already compact |
| 7-12 | What This Is | **INLINE**, keep | 4 lines, core identity |
| 14-30 | Pages list | **DELETE** | Derivable from `ls src/app/`, Claude can read the filesystem |
| 32-53 | Components list | **DELETE** | Derivable from `ls src/components/` |
| 55-90 | Blog posts list (35 items) | **DELETE** | Derivable from `ls content/blog/` |
| 92-100 | Tech Stack | **INLINE**, keep | 9 lines, essential context |
| 102-118 | SEO + GEO features | **DELETE or TRIM** | Most derivable from code. Keep 2-3 lines about schema utility location |
| 120-135 | Growth Features | **DELETE** | Derivable from code. Score page details, drip sequences, Claude can read the files |
| 137-143 | Product Tiers | **RULES** | Move to `.claude/rules/product-tiers.md`, Claude needs tier names/prices to write copy correctly |
| 145-149 | Brand Voice | **RULES** | Move to `.claude/rules/brand-voice.md` |
| 151-172 | Fix the Engine table | **RULES** | Move to `.claude/rules/fix-engine.md`, critical every session |
| 174-178 | DO NOT list | **RULES** | Merge into brand-voice rules file |
| 180-184 | Important Notes | **INLINE**, trim | Keep repo URL + Vercel deploy status. 2 lines. |
| 187-217 | CV section | **CONDITIONAL** | Wrap in `<important if="running CV or verification">`. Only needed when Rahim says "run CV" |
| 219-221 | Reference paths | **INLINE**, keep | 2 lines |

**Projected result:** ~60-80 lines inline + 3 rules files + 1 conditional block.

---

## The Fix

### Step 1: Create `.claude/rules/` Files

**`.claude/rules/brand-voice.md`** (~15 lines, no `paths:` frontmatter)
```
INAA-web brand voice rules, auto-loaded every session.

Voice: Bold, irreverent, slightly provocative. Speaks like a defendant who's been through the system. NOT corporate lawyer voice, for regular people.
Example: "Your attorney forgot to file that motion? Cool. Here are 7 questions that'll remind them."

DO NOT:
- Provide actual legal advice in any copy
- Use the word "attorney" to describe our service
- Make guarantees about case outcomes
- Use stock photos of gavels or scales of justice (cliché)

Legal positioning: We provide legal INFORMATION and generate QUESTIONS. We do NOT provide legal ADVICE.
Tagline: "We Research. You Ask."
```

**`.claude/rules/fix-engine.md`** (~20 lines, no `paths:` frontmatter)
```
Fix the engine, not the output, MANDATORY for all INAA-web work.

When ANY output needs fixing, fix the engine/pipeline/config that PRODUCES it, never the individual artifact.

| Bad output | Fix THIS (the engine) |
|------------|----------------------|
| Report content | `src/lib/intelligence-brief/prompts.ts` |
| Report formatting | `src/lib/intelligence-brief/render.ts` |
| Report fails UPL | `supabase/functions/evaluate-report/` |
| Playbook content | `src/lib/playbook-configs.ts` |
| Email content | `src/lib/drip-emails.ts` |
| Email delivery | `src/lib/email.ts` |
| Drip timing | `src/app/api/cron/drip/route.ts` |
| Pricing/tier | `src/lib/tiers.ts` |
| Schema/SEO | `src/lib/schema.ts` |
| Blog rendering | `src/lib/blog.ts` |
| Social content | `content/queue/` engine |

Fix the engine = fix ALL outputs, current and future.
```

**`.claude/rules/product-tiers.md`** (~15 lines, no `paths:` frontmatter)
```
INAA product tiers, needed for all copy, pricing, and checkout work.

- Case Decoder ($97), Charge analysis + 10-15 questions
- Intelligence Brief ($497), Judge intel + accountability research + 15-25 questions
- X-Ray ($2,497), Full discovery analysis + 35-50 questions + Discovery Strength Rating
- War Room ($4,997), Ongoing intelligence operation with weekly updates
- Witness Pack (add-on), Witness background + credibility analysis
- Situation Room (add-on), Full-team defense coordination

Stripe policy: SANDBOX MODE (test keys) until Rahim explicitly approves live switch.
```

### Step 2: Rebuild CLAUDE.md

Target: ~70-80 lines. Delete all inventory lists (pages, components, blog posts, SEO features, growth features). Keep only what Claude can't derive from the filesystem.

```markdown
# ImNotAnAttorney-web, Claude Code Instructions

## Identity: Atticus (Atti)
Auto-loaded via `.claude/rules/atti-persona.md`, 6 thinking modes, research-first rule, voice.
Rules auto-loaded: brand-voice, fix-engine, product-tiers.

## What This Is
A Next.js content-driven sales funnel for ImNotAnAttorney, legal empowerment for criminal defendants.
35 blog posts, 14 pages, multi-tier checkout ($97-$4,997). See `docs/ARCHITECTURE.md` for full system architecture.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **CMS:** MDX files in `content/blog/`
- **Database:** Supabase (cases, orders, drip email tracking, discovery documents, counters, score_aggregates)
- **Payments:** Stripe Checkout, SANDBOX MODE (see `.claude/rules/product-tiers.md`)
- **Email:** Resend (drip sequences, delivery notifications, admin digests)
- **Hosting:** Vercel (live, auto-deploys on push to master)
- **Schema:** FAQ, Service, Organization, Article, HowTo, BreadcrumbList (with speakable, @id binding, citation)

## Key Architectural Files
| File | Purpose |
|------|---------|
| `src/lib/schema.ts` | Structured data generators (about entities, citation mapping) |
| `src/lib/tiers.ts` | TIER_CORE array, single source of truth for pricing |
| `src/lib/drip-emails.ts` | 7+ email sequence definitions |
| `src/lib/blog.ts` | Frontmatter parser + renderer |
| `src/app/api/cron/drip/route.ts` | 22-part drip dispatcher |
| `docs/ARCHITECTURE.md` | Full system architecture, DB schema, state machine |

## Important Notes
- Repo: github.com/rahim0kapadia/ImNotAnAttorney-web
- Vercel: live, auto-deploys on push to master
- Domain: imnotanattorney.com via Cloudflare DNS

<important if="Rahim says run CV or you are doing verification">
## Continuous Verification (CV)
Run: `node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends`
Hypotheses: H1 (UPL gate), H2 (cron 48h), H3 (site up), H5 (adversarial UPL), H6 (orders healthy).
H1 CLEAN as of 2026-03-13.
</important>

## Reference
- Business docs: `C:\Users\email\projects\ImNotAnAttorney\`
- Elite skills: `C:\Users\email\.openclaw\workspace\skills\`
- Eval framework: `ImNotAnAttorney/system/EVALUATION-TEAM.md` (11 teams, 164 criteria)
```

### Step 3: Apply the 30-Line Test

For every line in the new CLAUDE.md: "If I remove this, will Claude make a mistake on a typical task?" If NO → delete.

### Step 4: Verify

1. Fresh session, ask Atti "who are you?" (should get persona without reading files)
2. Ask Atti to fix a bug in email content (should know to fix `drip-emails.ts`, not one email)
3. Ask Atti to write blog copy (should use brand voice, bold, irreverent, no legal advice)
4. Ask Atti about product tiers (should know all 6 tiers and prices)
5. Say "run CV" (should know the command from `<important>` block)
6. Verify: did Atti try to read pages/components/blog lists from CLAUDE.md? (Should NOT, they're deleted, Atti reads from filesystem when needed)

### Step 5: Clean Up

- Verify all `.claude/rules/` files load (no `paths:` frontmatter)
- Run `wc -l`, CLAUDE.md must be under 100 lines
- Total rules files + CLAUDE.md must be under 200 lines combined
- Delete any stale memory files that reference old CLAUDE.md structure

---

## What's Already in `.claude/rules/atti-persona.md` (Don't Duplicate)

15 lines covering:
- Identity (principled defender with a digital edge)
- 6 thinking modes (UPL guardian, defendant experience architect, elite crisis sales strategist, trust engineer, positioning precision, SEO/GEO pioneer)
- Research-first rule
- Voice (direct/precise internally, warm/insider externally)
- Key context (Attorney Dino, eval framework pointer, GATE teams)

**None of this goes back into CLAUDE.md or other rules files.**

---

## Also Apply to Other INAA Projects

The main INAA project CLAUDE.md is 393 lines, nearly 2x the recommendation. The engine has no CLAUDE.md at all (which is fine, it only has the persona in rules). The main project needs the same treatment in a separate session.

---

## Sources

Full source list in the Cloud Culture plan at:
`C:\Users\email\projects\CLOUD_CULTURE\docs\plans\2026-03-24-nimbus-persona-and-claude-md-fix.md`

Key sources: HumanLayer (progressive disclosure), Simon Willison (verbose prompt weight), claudelint (200-line/40KB limits), Anthropic docs (.claude/rules/ loading behavior), dev.to (30-line test, primacy/recency anchoring).
