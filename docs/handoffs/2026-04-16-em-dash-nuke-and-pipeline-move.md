# Handoff: Em Dash Nuke + Blog Pipeline Move
Date: 2026-04-16 22:30

## Task
Remove all em dashes from the codebase (AI writing tell #1) and move the blog-pipeline skill from global `~/.claude/commands/` to project-level `ImNotAnAttorney-web/.claude/commands/` for portability.

## What's Done

### Em Dash, Blog Content (COMPLETE)
- Humanizer detector 4 upgraded: zero-tolerance, 65pts = guaranteed fail
- Humanizer `, ` counting fixed: ignores `---` delimiters and table separators
- 67 blog posts: 2,312 em dashes replaced with commas
- 4 voice profiles: em dashes stripped from examples, added to banned vocab + anti-slop checklists
- `generate.md` hard constraint: zero em dash as first rule
- Flywheel C added to `publish-and-flywheel.md`: sub-failure pattern capture
- Committed: INNA-web `8ca97e3`, .claude `b28311d`

### Em Dash, Humanizer Message (NOT DONE)
- `humanizer.mjs:399` has em dash in its own output message: `",  all must be removed"`
- Replace with ` - `

## What Didn't Work
- Character-by-character replacement with context-aware heuristics (paired em dashes to parens, definitions to parens, uppercase to periods), cascading bugs, text duplication, one file ballooned from 138 to 16,689 matches. Hit thrash limit.
- Simple `countOccurrences(text, ", ")` counts `, ` inside `---` and markdown table separators as false positives. Fix: char loop that checks neighbors.
- Lesson saved to memory: `feedback-batch-text-transforms.md`, use split/join with placeholder, not char loops.

## Remaining Steps

### Step A: Full Codebase Em Dash Nuke
970 files, 17,569 em dashes across scripts, source, docs. Same root cause as blog posts.

1. Extend `scripts/fix-em-dashes.mjs` to walk the full project tree (not just `content/blog/`)
2. Skip `node_modules/`, `.next/`, `.git/`
3. Handle `.ts`, `.tsx`, `.js`, `.mjs`, `.md` files
4. Same placeholder approach: protect `---`, split/join replace, restore
5. Run `npx tsc , noEmit , skipLibCheck` after to verify no breakage
6. Spot-check a few source files
7. Commit

### Step B: Move Blog Pipeline to Project Repo
Reviewed by 3 agents + brainstorm review. Revised plan with all findings:

1. Fix `.gitignore`: change `.claude/` to `.claude/*`, add `!.claude/commands/` with comment explaining why `*` not `/`
2. Verify gitignore works: `git check-ignore -v .claude/commands/blog-pipeline.md` should return NO output
3. Create `ImNotAnAttorney-web/.claude/commands/blog-pipeline/`
4. Copy parent `blog-pipeline.md` + 6 stage files (paths.md, select.md, generate.md, qa-gates.md, fix-loop.md, publish-and-flywheel.md)
5. md5sum verify copies match originals + verify file count = 7
6. Rename global originals to `.bak`
7. Test: run `/blog-pipeline editorial` from INNA-web project, verify sub-commands resolve, stage loading works
8. Keep `.bak` until NEXT session confirms (don't delete same session)
9. Update audit doc path: `~/.claude/docs/audits/2026-04-16-blog-pipeline-v4-audit.md` line 5
10. Commit

### Step C: Simplify Fixes (from code reviews)
- `humanizer.mjs:399`: replace em dash in output message with ` - `
- `fix-em-dashes.mjs` comment on line 50-51: explain why `", "` must come before `", "` in split order
- Consider unifying humanizer detector 4 into single char loop (currently indexOf for Unicode + char loop for , )

## Key Decisions
- Em dashes replaced with commas universally (not context-aware parens/colons/periods), simpler, no cascading bugs
- Flywheel C captures sub-failure patterns that pass the gate but recur, feeds back into generation via existing Stage 2.4 mechanism
- Blog pipeline must move as a unit (parent + sub-commands in same directory), Claude Code resolution requires it
- `.gitignore` must use `.claude/*` not `.claude/` for negation to work

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && node , input-type=module -e "import {runHumanizerCheck} from './scripts/lib/blog-gen/humanizer.mjs'; import {readFileSync} from 'fs'; const r = runHumanizerCheck(readFileSync('content/blog/case-keeps-getting-continued.mdx','utf8')); console.log(JSON.stringify(r));"`, should pass with score < 45 and 0 flagged patterns
- `npx tsc , noEmit , skipLibCheck`, TypeScript clean
- `node scripts/fix-em-dashes.mjs , dry-run`, should show 0 em dashes in blog posts

## Files Modified This Session
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\lib\blog-gen\humanizer.mjs`, detector 4 zero-tolerance + counting fix
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\fix-em-dashes.mjs`, NEW, batch replacement script
- `C:\Users\email\projects\ImNotAnAttorney-web\content\blog\*.mdx` (65 files), em dashes removed
- `C:\Users\email\projects\ImNotAnAttorney-web\content\blog\.qa-state\case-keeps-getting-continued.json`, sidecar updated
- `C:\Users\email\projects\ImNotAnAttorney-web\content\voice-profiles\general-defense.md`, em dash ban + anti-slop
- `C:\Users\email\projects\ImNotAnAttorney-web\content\voice-profiles\dui.md`, em dash ban + anti-slop
- `C:\Users\email\projects\ImNotAnAttorney-web\content\voice-profiles\drug.md`, em dash ban + anti-slop
- `C:\Users\email\projects\ImNotAnAttorney-web\content\voice-profiles\white-collar.md`, em dash ban + anti-slop
- `C:\Users\email\.claude\commands\blog-pipeline\generate.md`, hard constraint added
- `C:\Users\email\.claude\commands\blog-pipeline\publish-and-flywheel.md`, Flywheel C added
