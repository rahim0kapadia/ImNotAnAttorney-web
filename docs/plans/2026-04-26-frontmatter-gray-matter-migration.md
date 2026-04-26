# Frontmatter Parser Migration to gray-matter — 2026-04-26

## Worry / Source

Audit Angle 3 finding **F-3 frontmatter parsers**: 5 hand-rolled YAML
regex parsers identified across web + parent. The 2 web social scripts
use a parser shape (`{ fmLines, bodyLines }`) that's redundant with
`gray-matter` (already in deps). 1 web script (`fix-humanizer-slop.mjs`)
uses a DIFFERENT parser shape that's actually correct for content-
preserving rewrites and should be kept.

## Scope decision

| File | Parser shape | Migration verdict |
|------|--------------|-------------------|
| `scripts/schedule-social.mjs` | `{ fmLines, bodyLines }`, caller uses `bodyLines` only | **Migrate** to gray-matter |
| `scripts/schedule-social-slow.mjs` | byte-identical to above | **Migrate** same way |
| `scripts/fix-humanizer-slop.mjs` | `{ frontmatter: rawString, body: rawString }` content-preserving | **Skip** — gray-matter would re-stringify YAML and risk format drift on rewrite |

The 2 other audit-cited files are in the PARENT repo, not web. Audit
attribution was wrong; those need a separate parent worktree.

## Architectural Invariants Touched

ARCHITECTURE.md #4 service-role rule — N/A (no DB access change).
ARCHITECTURE.md #6 input-allowlisting — N/A (queue files are author-
controlled, not user input).

The fix preserves the existing `extractPostContent(bodyLines, platform)`
signature so downstream call sites remain unchanged.

## Files to Modify

1. `scripts/schedule-social.mjs` — replace `parseFrontmatter()` body
   with gray-matter's `matter()`; preserve `bodyLines` array shape
2. `scripts/schedule-social-slow.mjs` — same migration

## Tasks

1. Add `import matter from 'gray-matter'` to both files
2. Replace each `parseFrontmatter()` body — call `matter(raw)` then
   return `{ data: parsed.data, bodyLines: parsed.content.split('\n') }`
3. Caller already uses `parsed.bodyLines` — keep that
4. Smoke test each with --dry-run on a real queue file
5. Commit + push to `fix/frontmatter-gray-matter-migration`
6. Open PR

## Out of Scope

- `fix-humanizer-slop.mjs` (content-preserving, keeps hand-rolled parser)
- Parent repo's 2 hand-rolled parsers — separate parent worktree
- Engine PARENT_PATH_HEALTH coverage (separate engine PR #6)
- Humanizer parity (separate parent PR #17)

## Success Criteria

- `git diff --stat` shows 2 modified files only
- `node scripts/schedule-social.mjs --dry-run twitter` runs cleanly
- Same for `schedule-social-slow.mjs`
- No behavior change in `extractPostContent()`
- PR opens off `master`

## Cited

- Audit: `~/projects/ImNotAnAttorney/docs/plans/2026-04-26-german-engineering-audit-findings.md` F-3 frontmatter
- gray-matter library (already in deps)
- Beck Simple Design rule 3 (no duplication)
