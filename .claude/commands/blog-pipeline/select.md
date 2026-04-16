# Stage 1: SELECT

Three independent sub-stages. Failure in any one MUST NOT block the others.

---

## 1A. Editorial Capture (Flywheel B)

Runs first on every invocation except `generate` and `regrade` modes.

For every sidecar in `.qa-state/`:

1. Read sidecar JSON. Skip if no `published_hash`.
2. Compute MD5 of current MDX file.
3. If hashes match -> skip (no edit detected).
4. If hashes differ -> editorial edit detected. Extract the pattern:

**Getting the diff (IMPORTANT — do NOT use `git diff HEAD~1`):**
```
Use `git log -p --follow -1 -- content/blog/{slug}.mdx` to find the most recent
commit that changed this file. This catches edits regardless of how many commits
ago they happened.
```

5. For each meaningful change (not whitespace-only), extract:
   - What section was edited?
   - What was the original text?
   - What did it become?
   - What writing principle does this edit demonstrate?

6. Append to `.flywheel/editorial-patterns.jsonl`:
```json
{"slug":"<slug>","section":"<section>","original":"<old>","edited":"<new>","pattern_extracted":"<principle>","ts":"<ISO>"}
```

7. Update `published_hash` in sidecar to new MD5.

---

## 1B. Select Posts for Re-grading

Scan `.qa-state/*.json`. Select posts where:
- Any gate has `status: "unchecked"` or `passed: false`
- OR any gate's `rubric_hash` doesn't match current rubric file hash (rubric changed)

Order by `last_checked` ascending (oldest first).
Limit to `BLOG_PIPELINE_REGRADE_BATCH` (default: 5).

---

## 1C. Select Content Gaps for Generation

Query Supabase:
```sql
SELECT * FROM content_gaps
WHERE has_blog_post = false
  AND status = 'queued'
  AND status != 'in-progress'
ORDER BY gap_score DESC, demand_score DESC
LIMIT {BLOG_PIPELINE_GENERATE_BATCH}
```

**Immediately after selection, lock each gap:**
```sql
UPDATE content_gaps SET status = 'in-progress' WHERE id = {id}
```

This prevents concurrent sessions from picking the same gap.

If generation fails or is declined, set status back to `queued` (not `identified` — it was already approved).

---

## Slug Derivation Formula

For each selected content gap, derive the blog slug:

1. If `article_type = 'spoke'` AND `pain_point_slug` exists: use `pain_point_slug`
2. Else: slugify `suggested_title` (lowercase, replace spaces with hyphens, strip non-alphanumeric except hyphens, collapse multiple hyphens, trim to 60 chars)

**Verify slug is unique:** check that `content/blog/{slug}.mdx` does not already exist. If collision, append `-2`, `-3`, etc.

Set `blog_slug` on the content_gap row immediately after derivation.
