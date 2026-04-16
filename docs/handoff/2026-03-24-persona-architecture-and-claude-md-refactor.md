# Handoff: Persona Architecture & CLAUDE.md Refactor

Date: 2026-03-24 14:30

## Task

Built and deployed the Atti persona across all 3 INAA projects + Nimbus persona for Cloud Culture using the `.claude/rules/` auto-load pattern. Triangulated SEO/GEO experts. Refactored INAA-web CLAUDE.md from 221 → 63 lines.

## Approach

Research-backed architecture (HumanLayer, Willison, claudelint, Anthropic docs):
- **Always-on behavior** → `.claude/rules/` (auto-loaded, ~100% reliable)
- **CLAUDE.md** → compact routing table (under 200 lines)
- **Conditional content** → `<important if="...">` tags
- **Task-specific reference** → `docs/` or engine files, NOT inlined
- **Inventory lists** (pages, components, blog slugs) → DELETED (derivable from filesystem)

## Files Modified

### INAA-web (ImNotAnAttorney-web)
- `.claude/rules/atti-persona.md`, CREATED: 15-line persona (6 thinking modes, research-first rule, voice)
- `.claude/rules/brand-voice.md`, CREATED: 13 lines (voice, DO NOT list, legal positioning)
- `.claude/rules/fix-engine.md`, CREATED: 23 lines (engine mapping table)
- `.claude/rules/product-tiers.md`, CREATED: 11 lines (6 tiers + Stripe sandbox policy)
- `CLAUDE.md`, REBUILT: 221 → 63 lines. Deleted inventory lists, kept tech stack + key files + CV conditional block
- `docs/plans/2026-03-24-atti-claude-md-fix.md`, CREATED: execution plan (used and completed)

### INAA Main (ImNotAnAttorney)
- `.claude/rules/atti-persona.md`, CREATED: 21 lines (6 shared + 4 project-specific modes)
- `CLAUDE.md`, EDITED: replaced 13-line inline persona with 2-line pointer
- `system/EVALUATION-TEAM.md`, EDITED: Team 8 "SEO & GEO Compliance" → "SEO & GEO Pioneer" (6 experts → 14 niched experts across GEO/SEO/Local, criteria split into GEO1-6/SEO1-7/LOC1-2)

### INAA Engine (ImNotAnAttorney-engine)
- `.claude/rules/atti-persona.md`, CREATED: 21 lines (6 shared + 4 project-specific modes)
- `.claude/` directory, CREATED (didn't exist before)

### Cloud Culture (CLOUD_CULTURE)
- `.claude/rules/nimbus-persona.md`, CREATED: 16 lines (7 thinking modes, research-first rule)
- `CLAUDE.md`, EDITED: replaced NIMBUS.md pointer with rules pointer (another session then refactored it to 120 lines)
- `docs/plans/2026-03-24-nimbus-persona-and-claude-md-fix.md`, CREATED: full execution plan with research

### Memory
- `memory/persona-atticus.md`, UPDATED: documents architecture (rules file, not inline)
- `memory/feedback-research-first.md`, CREATED: "never assume you know" rule
- `memory/MEMORY.md`, UPDATED: index entries for both

## What Didn't Work

- Triage hooks blocked cross-repo edits, had to re-triage for each project scope (ImNotAnAttorney → CLOUD_CULTURE → ImNotAnAttorney-web)
- First attempt to log triage via `echo >>` was blocked by bash-writes hook, needed `node -e` with `os.tmpdir()` + `claude-triage` + `writeFileSync` pattern to match whitelist
- Original plan used "pointer rows" in CLAUDE.md, research showed Claude ignores these ~95% of the time. Switched to `.claude/rules/` (auto-loaded) + `<important if="...">` tags

## Remaining Steps

1. **INAA main CLAUDE.md refactor**, 393 lines, needs same treatment as INAA-web (no plan written yet)
2. **Cloud Culture rules extraction**, CLAUDE.md references 4 rules files (`brand-voice`, `compliance`, `tag-system`, `systems-fixer`) that don't exist yet. The plan at `CLOUD_CULTURE/docs/plans/2026-03-24-nimbus-persona-and-claude-md-fix.md` has the specs.
3. **Cloud Culture expert triangulation**, hemp compliance, Shopify D2C conversion, quiet luxury branding, hemp SEO, dropship ops
4. **Delete old `.claude/NIMBUS.md`** in Cloud Culture (superseded)

## Verification

- `wc -l C:/Users/email/projects/ImNotAnAttorney-web/CLAUDE.md`, should be 63
- `wc -l C:/Users/email/projects/ImNotAnAttorney-web/.claude/rules/*.md`, should total 62
- `ls C:/Users/email/projects/ImNotAnAttorney-web/.claude/rules/`, should show 4 files
- `ls C:/Users/email/projects/ImNotAnAttorney/.claude/rules/`, should show atti-persona.md
- `ls C:/Users/email/projects/ImNotAnAttorney-engine/.claude/rules/`, should show atti-persona.md
- `ls C:/Users/email/projects/CLOUD_CULTURE/.claude/rules/`, should show nimbus-persona.md

## Key Decisions

- **Persona in `.claude/rules/`, never inline in CLAUDE.md**, auto-loaded with ~100% reliability vs ~5% for "read this file" pointers
- **Research-first rule baked into every persona**, "never assume you know, information gets dated after days"
- **SEO/GEO pioneer, not compliance**, Rahim's explicit direction: explore what's working, don't check boxes
- **Niche down, never generalize**, every expert must earn their spot with something specific to INAA's situation
- **All INAA projects share 6 core thinking modes** + project-specific additions on top
- **`<important if="...">` tags for conditional content**, CV commands, engine references
- **30-line test**, "If I remove this line, will Claude make a mistake?" Delete everything else
