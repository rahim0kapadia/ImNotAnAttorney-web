# Stage 4: FIX LOOP

When any gate fails, fix surgically. **Max 3 cycles per post.**

---

## Fix Priority Order

MUST fix in this order — safety before compliance before quality:

1. **Anti-hallucination failures** (FIRST — always)
2. **UPL failures** (legal compliance)
3. **Slop hard-gate failures** (QUESTION_COUNT, CITATION_SOURCING, JARGON_DEFINITION, FEAR_ACTION_PAIRING)
4. **DNA failures**
5. **Slop soft failures** (NEEDS_WORK items)

---

## Per Cycle

1. Read the MDX and ALL FAIL results with evidence
2. For each failure (in priority order above), edit ONLY the section cited in the evidence
3. **Max 3 edits per cycle** — prevents drift from original generation
4. **Anti-hallucination fix rule:** fixes are ALWAYS deletion or qualification. Remove the fabricated claim, add jurisdiction qualifier, add source attribution. NEVER rewrite to "sound sourced."
5. After edits, re-run these gates:
   - Humanizer (ALWAYS — it's instant and any edit can affect it)
   - Anti-hallucination (ALWAYS — safety re-check is nearly free)
   - Plus any other gates that failed
6. Write updated sidecar (partial write — preserve passing gate results)
7. All gates pass -> exit loop, proceed to Stage 5
8. Still failing -> next cycle with updated failure details

---

## After 3 Cycles With Remaining Failures

Mark post as declined:
- Update `content_gaps` status -> `qa-failed`
- Log the persistent failures to flywheel (still valuable data)
- Print: `DECLINED: {slug} — persistent failures after 3 fix cycles: {list of failing checks}`

Do NOT update to `declined` — reserve that for editorial rejection. `qa-failed` means "pipeline couldn't fix it, may be retried after flywheel improves."

---

## Fix Loop Anti-Patterns

NEVER do these during fixes:
- Rewrite entire sections (surgical edits only)
- Add new H2 sections (structural changes cascade)
- Change the frontmatter title or slug
- Remove FAQ entries (add or edit only)
- "Fix" by making content more generic (specificity is value)
