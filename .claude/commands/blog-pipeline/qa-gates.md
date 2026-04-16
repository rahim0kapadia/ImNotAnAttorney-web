# Stage 3: QA GATES

Run all 5 gates sequentially. The session evaluates inline — read the rubric, read the MDX, produce JSON results. NEVER call an API or spawn a subprocess.

---

## Gate Order (fixed — do not reorder)

| # | Gate | Type | Threshold | Zero Tolerance |
|---|------|------|-----------|----------------|
| 1 | Anti-Hallucination | LLM inline | 6/6 PASS | YES — fix immediately before other gates |
| 2 | Humanizer | Pure JS | compositeScore < 45 | No |
| 3 | Slop | LLM inline | >=12/14 PASS, 0 hard-gate FAIL, <=2 NEEDS_WORK | Hard gates: QUESTION_COUNT, CITATION_SOURCING, JARGON_DEFINITION, FEAR_ACTION_PAIRING |
| 4 | UPL | LLM inline | 15/15 PASS | YES |
| 5 | DNA | LLM inline | 0 FAIL, <=3 NEEDS_WORK | No |

**Why this order:** Safety first (anti-hallucination), then cheapest gate (humanizer is instant JS), then legal compliance (slop, UPL), then structural quality (DNA).

---

## Running Each Gate

**1. Anti-Hallucination** (SAFETY-CRITICAL)
- Read rubric: `.qa-rubrics/anti-hallucination.md`
- Evaluate the MDX content against 6 checks inline
- Produce JSON array of 6 check results
- If ANY check FAIL: fix immediately, re-run this gate, THEN continue to gate 2

**2. Humanizer** (pure JS)
```bash
cd {WEB_ROOT} && node --input-type=module -e "
import {runHumanizerCheck} from './scripts/lib/blog-gen/humanizer.mjs';
import {readFileSync} from 'fs';
const r = runHumanizerCheck(readFileSync('content/blog/{slug}.mdx','utf8'));
console.log(JSON.stringify(r));
"
```

**3. Slop**
- Read rubric: `.qa-rubrics/slop.md`
- Evaluate inline — produce JSON array of 14 checks

**4. UPL**
- Read rubric: `.qa-rubrics/upl.md`
- Evaluate inline — produce JSON array of 15 criteria

**5. DNA**
- Read rubric: `.qa-rubrics/dna.md`
- Evaluate inline — produce JSON array of 14 checks

---

## Gate Version Tracking

After reading each rubric file, compute its MD5. Store in the sidecar so future runs can detect rubric changes:

```json
"rubric_hashes": {
  "anti_hallucination": "<md5>",
  "slop": "<md5>",
  "upl": "<md5>",
  "dna": "<md5>"
}
```

When a rubric hash changes, the post needs re-grading even if content hasn't changed.

---

## Sidecar Schema

Write to `.qa-state/{slug}.json` after ALL 5 gates complete:

```json
{
  "slug": "<slug>",
  "last_checked": "<ISO timestamp>",
  "all_passed": true/false,
  "published_hash": "<MD5 of MDX if published>",
  "rubric_hashes": { "anti_hallucination": "<md5>", "slop": "<md5>", "upl": "<md5>", "dna": "<md5>" },
  "gates": {
    "anti_hallucination": {"status": "checked", "passed": true/false, "details": {...}},
    "humanizer": {"status": "checked", "passed": true/false, "score": <n>, "details": {...}},
    "slop": {"status": "checked", "passed": true/false, "details": {...}},
    "upl": {"status": "checked", "passed": true/false, "details": {...}},
    "dna": {"status": "checked", "passed": true/false, "details": {...}}
  }
}
```

**Partial sidecar writes:** After each gate completes, update the sidecar on disk. If the session crashes mid-QA, completed gate results are preserved and the next run only needs to re-run unchecked gates.
