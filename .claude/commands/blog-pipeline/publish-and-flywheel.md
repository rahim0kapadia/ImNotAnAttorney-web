# Stage 5: PUBLISH + Stage 6: FLYWHEEL

---

## Stage 5: PUBLISH

When all gates pass for a post:

### 5.1 Finalize Sidecar
- Compute `published_hash` (MD5 of final MDX content)
- Update sidecar with `published_hash` and `all_passed: true`

### 5.2 Commit
Stage MDX + sidecar, commit with message:
```
feat(blog): publish {slug} — all QA gates passed

Gates: anti-hallucination 6/6, humanizer {score}, slop {n}/14, UPL 15/15, DNA {n}/14
```

For batch runs: if git commit gets a 409 conflict, pull and retry with 2s backoff.

### 5.3 Update Supabase
- `content_gaps`: status -> `published`, `has_blog_post` -> true, `blog_slug` -> `{slug}`
- `blog_drafts` (if row exists): status -> `published`, `published_at` -> now

### 5.4 IndexNow
```bash
curl -s "https://api.indexnow.org/indexnow?url=https://imnotanattorney.com/blog/{slug}&key={INDEXNOW_KEY}"
```
If IndexNow fails -> log warning, do NOT block publish.

---

## Stage 6: FLYWHEEL

### Flywheel A — QA Failure Prevention

For every gate failure that was fixed in Stage 4, append to `.flywheel/qa-patterns.jsonl`:

```json
{"slug":"<slug>","gate":"<gate>","check":"<check_id>","failure_evidence":"<evidence>","fix_applied":"<what changed>","fix_worked":true/false,"cycle":<1-3>,"ts":"<ISO>"}
```

Also append entries for declined posts — persistent failures are the most valuable flywheel data.

### Flywheel B — Editorial Quality

Already captured in Stage 1A. No additional action in Stage 6.

### Flywheel C — Sub-Failure Pattern Capture

The gap Flywheel A misses: patterns that trigger a detector but don't fail the gate. These accumulate silently across posts and never feed back into generation.

After QA gates complete (whether post passed or entered fix loop), check the humanizer `flagged_patterns` array. For every pattern that triggered:

1. Read `.flywheel/qa-patterns.jsonl` and count how many times this detector has appeared in the last 10 posts (by distinct slug)
2. If the detector has triggered on **3+ of the last 10 posts**, append a generation-prevention entry:

```json
{"slug":"<slug>","gate":"humanizer","check":"<detector_name>","failure_evidence":"Sub-gate trigger: <count> instances, <details>","fix_applied":"PREVENTION: injected into generation prompt as DO NOT instruction","fix_worked":null,"cycle":0,"ts":"<ISO>","type":"sub_failure_pattern"}
```

3. The `type: "sub_failure_pattern"` field distinguishes these from fix-loop captures

**How this feeds back:** Stage 2.4 (QA Flywheel Patterns) already reads `qa-patterns.jsonl` and injects patterns with 3+ occurrences as DO NOT instructions. Sub-failure patterns use the same mechanism — once 3 posts trigger the same detector, generation gets a DO NOT instruction automatically.

**Why this matters:** Em dashes triggered on 67/67 posts but never entered the flywheel because the old detector penalty was too low to fail the gate. This flywheel stage prevents that class of blind spot.

### Flywheel Pruning

If a QA pattern hasn't triggered in the last 20 posts (count distinct slugs in the ledger after the pattern's most recent occurrence), mark it as archived by prepending `ARCHIVED:` to the check field. Archived patterns are not injected into generation prompts.

---

## Rollback Procedure

If a published post needs to be reverted:

1. `git revert {commit_hash}` — reverts the MDX + sidecar
2. Update Supabase: `content_gaps` status -> `queued`, `has_blog_post` -> false
3. Submit IndexNow again (signals content removal)
4. Log reason to flywheel as a declined pattern
