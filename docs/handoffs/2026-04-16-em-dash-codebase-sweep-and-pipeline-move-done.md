# Handoff: Em Dash Codebase Sweep + Blog Pipeline Move, DONE
Date: 2026-04-16 (late)

## Task
Continue from `docs/handoffs/2026-04-16-em-dash-nuke-and-pipeline-move.md`. Finish Step A (full-codebase em dash nuke), Step B (move blog-pipeline skill from global `~/.claude/commands/` to project-local `.claude/commands/`), and Step C (simplify humanizer output + fix-em-dashes comments).

**Triage tier:** QUICK_FIX (logged as `5b4b7f4f5e19`).

## Status: ALL THREE STEPS COMPLETE

## Approach

### Step A, em dash sweep (19,495 dashes, 1,022 files)
**Key decision:** file-type-aware rules. Markdown (`.md`, `.mdx`) replaces both Unicode em dash and `--`. Code (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) replaces Unicode em dash ONLY. Reason: `--` is legitimate JS/TS syntax (CLI flags `--dry-run`, decrement `i--`, JSDoc `<!-- -->`); blanket replacement breaks code. Unicode em dash (U+2014) is never valid JS/TS syntax, so it is always safe in source files.

**Second key decision:** space-variant handling. An em dash appears in prose in four configurations: bilateral (` X `), leading-only (` X`), trailing-only (`X `), bare (`X`). Each has a distinct correct output. The first attempt only covered the bilateral form, leaving orphan spaces (`,  Grade:`) and stray commas (`findings , `). Fixed with ordered split/join chain:
```js
r = r.split(` ${T} `).join(", ");
r = r.split(` ${T}`).join(",");
r = r.split(`${T} `).join(", ");
r = r.split(T).join(", ");
```

### Step B, blog-pipeline move
`.gitignore` changed `.claude/` to `.claude/*` with `!.claude/commands/` negation. Child-level ignore is required for negation to work (directory-level ignore cannot be un-ignored). Files copied into `.claude/commands/blog-pipeline/` (parent + 6 stages), md5-verified against originals. Global originals renamed to `.bak` on disk (untracked fallback, not committed).

### Step C, simplify
- `humanizer.mjs:399` em dash in own message, auto-fixed by Step A sweep (now `", all must be removed"`).
- `fix-em-dashes.mjs` header comment rewritten to document the 4-variant rule table and file-type split.
- Detector 4 refactor (optional in handoff), skipped. Working code; refactor = risk for no functional gain.

## Files Modified

### INAA-web (commits 7a712b5, 42a5f42)
- `scripts/fix-em-dashes.mjs`, rewrote to walk full tree with file-type-aware rules + 4-variant space handling. Self-documenting header.
- 1,022 files across `.md`/`.mdx`/`.ts`/`.tsx`/`.mjs`/`.js`, Unicode em dash and (in markdown) `--` replaced with `, `.
- `.gitignore`, `.claude/` changed to `.claude/*` + `!.claude/commands/` + comment explaining why.
- `.claude/commands/blog-pipeline.md`, new (copied from `~/.claude/commands/blog-pipeline.md`).
- `.claude/commands/blog-pipeline/{paths,select,generate,qa-gates,fix-loop,publish-and-flywheel}.md`, new (copied from global). All 7 md5-verified.

### ~/.claude (commit c9f8028)
- `commands/blog-pipeline.md`, deleted (on-disk `.bak` kept untracked).
- `commands/blog-pipeline/*.md`, deleted (on-disk `.bak` kept untracked).
- `docs/audits/2026-04-16-blog-pipeline-v4-audit.md`, subject path updated to project-local location.

### ~/.claude/projects/.../memory (new topic files)
- `pattern-punctuation-sweep-4-variants.md`
- `pattern-file-type-aware-text-sweep.md`
- `gotcha-gitignore-negation-needs-star.md`
- `MEMORY.md` index updated with 3 pointers.

## What Didn't Work

**Attempt 1, em dash script**: only handled bilateral ` X ` pattern. Ran it live (1,022 files changed), then discovered orphan-space artifacts (`,  Grade:`, `findings , `, `demographics , \n`) in diffs.

**Recovery**: verified prior em-dash work was committed (8ca97e3), confirmed working tree contained only my session's sweep, ran `git restore .` on working tree to undo 1,022 files cleanly. Rewrote script with 4-variant ordered replacement. Wrote 6 unit-test cases in a one-liner and verified all PASS before re-running. Re-ran live, sample diff (`src/app/sample-xray/page.tsx`) showed clean single-space commas everywhere. Committed.

**Lesson saved**: `pattern-punctuation-sweep-4-variants.md`. Never ship a punctuation-replace script without the 4-variant test fixture.

## Remaining Steps (next session)

1. **Test project-local `/blog-pipeline` resolution**. Start a session in `C:\Users\email\projects\ImNotAnAttorney-web`. Run `/blog-pipeline editorial` (or any stage). Verify parent + sub-stage files load from `.claude/commands/blog-pipeline/`, not global.
2. **If resolution works**: remove on-disk fallbacks.
   ```bash
   rm -rf "C:/Users/email/.claude/commands/blog-pipeline.bak"
   rm "C:/Users/email/.claude/commands/blog-pipeline.md.bak"
   ```
3. **If resolution breaks**: restore globals from `.bak` (or from `~/.claude` commit `c9f8028^1`) and investigate why project-local wasn't picked up. Claude Code convention says `.claude/commands/` in project root is auto-discovered when session starts from that directory.

## Verification

- `cd C:\Users\email\projects\ImNotAnAttorney-web && node scripts/fix-em-dashes.mjs --dry-run`, should report `Em dashes replaced: 0`.
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc --noEmit --skipLibCheck`, TypeScript clean (verified at commit).
- `cd C:\Users\email\projects\ImNotAnAttorney-web && git check-ignore -v .claude/commands/blog-pipeline.md`, exit 1 (not ignored), proves negation works.
- `cd C:\Users\email\projects\ImNotAnAttorney-web && md5sum .claude/commands/blog-pipeline.md`, should equal `40f4eecaf77d70599f175ead45758c1b` (matches pre-move global).
- Start CC session from INAA-web, run `/blog-pipeline`, confirm slash-command recognized and stages load.

## Key Decisions

- **Universal comma replacement** for em dashes. Not context-aware parens/colons/periods. Simple, grammatically correct in every position, no cascading bugs. (Confirmed from prior handoff, carried forward.)
- **File-type split** for sweep rules. Code vs markdown have different syntax constraints. Single ruleset breaks one or the other.
- **4-variant ordered replacement** is the canonical pattern for punctuation substitution. Saved to durable memory.
- **Blog pipeline is project-specific**, belongs in project repo. References `content/blog/`, voice profiles, INAA QA gates. Not shareable across projects, so global home was wrong from the start.
- **`.gitignore` child-level form** required for negation. Saved to durable memory.
- **On-disk `.bak` untracked**, not committed. Git history serves as the primary rollback; `.bak` is just a fast convenience for the next session.

## Commits
- INAA-web `7a712b5`, em dash sweep.
- INAA-web `42a5f42`, blog-pipeline move into project.
- `~/.claude` `c9f8028`, global blog-pipeline deletion + audit doc path update.
