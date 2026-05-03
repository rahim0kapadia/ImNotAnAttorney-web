# NH Title LXII Statute Seeder — Design (Wave 2 Group 3)

Date: 2026-05-02
Companion: `docs/plans/2026-05-02-wave2-state-configs.md` (NH row, lines 172-183)
Source plan: Wave 2 design report; this plan operationalizes the NH row only.
Scope: design + tests + fixtures + dry-run smoke. No DB writes. No live ingest.

## Routing flag

NH crawl-delay = 11 seconds (gc.nh.gov robots.txt). Per `gotcha-az-leg-robots-120s.md`, slow-crawl-delay states are routed to engine workers, not Vercel cron. Seeder header documents this; orchestration team owns the engine vs cron decision at run time.

## Files to create

1. `scripts/ingest/lib/nh-html.mjs` — parser + URL builders + chapter-token discovery
2. `scripts/ingest/seed-statutes-nh-titlelxii.mjs` — orchestrator + chapter cohort loop
3. `scripts/ingest/__tests__/seed-statutes-nh-titlelxii.test.mjs` — unit tests
4. `scripts/ingest/__tests__/fixtures/nh/title-lxii-toc-sample.html` — title TOC fixture (chapter list)
5. `scripts/ingest/__tests__/fixtures/nh/chapter-630-toc-sample.html` — chapter-630 TOC fixture
6. `scripts/ingest/__tests__/fixtures/nh/section-630-1-sample.html` — active section
7. `scripts/ingest/__tests__/fixtures/nh/section-repealed-sample.html` — repealed section

## Files to modify

None. NH does not touch the shared harness or any other state seeder. Existing `bucket-b-html.mjs` is consumed read-only.

## Numbered tasks

1. **lib/nh-html.mjs** — adapt the MN parser shape with NH-specific structure:
   - `decodeEntities`, `stripHtml` (copy MN/MA pattern verbatim)
   - `buildChapterUrl(chapter)` returns `https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-{C}.htm`
   - `buildNHSourceUrl(chapter, section)` returns `https://gc.nh.gov/rsa/html/LXII/{C}/{C}-{S}.htm`
   - `canonicalSectionId(chapter, sec)` returns `{C}:{S}` (RSA cite form)
   - `discoverChapterTokens(titleTocHtml)` returns ordered list of chapter tokens (`625`, `632-A`, etc.)
   - `discoverSections(chapterTocHtml, chapter)` returns BucketBSectionDescriptor[]
   - `parseSection(html, sectionNum)` returns `{titleText, bodyText, effectiveDate}` or null
2. **seed-statutes-nh-titlelxii.mjs** — orchestrator following MN single-cohort pattern:
   - `NH_COHORT_DEFAULT` = hardcoded chapter list verified 2026-05-02
   - `NH_CHAPTER_DESCRIPTIONS` map (chapter to human label)
   - `NH_TITLELXII_ROW_FLOOR` = 250 (conservative, design report says ~600-800; floor avoids runtime brittleness if a few chapters get heavily repealed)
   - `bucketBDiscover(tocHtml, config)` adapter to harness contract
   - `bucketBParse(html, sectionNum)` adapter (drops effectiveDate field)
   - `buildSourceUrl(sectionNum)` for harness
   - `buildChapterConfig(chapter)` per-chapter config; crawlDelayMs: 11000
   - CLI: `--dry-run`, `--limit=N`, `--verbose`, `--chapters=625,630,...`
   - Smoke gate: at least 1 row across cohort
   - Production floor: enforced only on full live runs
   - Header comment flags engine-only routing
3. **Tests** mirror MN test layout:
   - constants present + cohort shape
   - CLI flag parsing
   - URL builders (chapter, section, both letter-suffixed and plain)
   - canonicalSectionId behavior on URL-form vs citation-form input
   - discoverSections from chapter-630 fixture: at least 6 active descriptors, includes 630:1, dedupes, all HTTPS
   - discoverSections handles letter-suffixed chapters (632-A)
   - parseSection extracts title + body from active fixture
   - parseSection returns null on repealed fixture
   - parseSection returns null on section-num mismatch
   - parseSection returns null on too-short HTML
   - bucketBDiscover/bucketBParse adapter shape contract
4. **Fixtures** minimal synthetic fixtures matching the documented HTML structure:
   - title-LXII-toc-sample.html anchor list mirroring real TOC
   - chapter-630-toc-sample.html section anchor list using `../LXII/630/630-N.htm`
   - section-630-1-sample.html `<center><h3>Section 630:1</h3></center><b>630:1 Capital Murder. -</b>` + body + `<b>Source.</b>` block
   - section-repealed-sample.html heading + `[Repealed, YYYY, NNN:N, eff. ...]` body
5. **Dry-run smoke** `node scripts/ingest/seed-statutes-nh-titlelxii.mjs --dry-run --limit=3` after design lands; confirm exit 0 + at least 1 valid row + log shows the engine-only routing flag.
6. **Triage** already logged via `writeTriageEntry` at session start (FEATURE / wave2 NH Title LXII design / scope=worktree).

## Anti-patterns (banned)

- Editing `scripts/ingest/lib/bucket-b-html.mjs` that's the shared harness
- Live DB writes design-only scope
- Reducing crawlDelayMs below 11000 violates published robots.txt
- Hardcoding section numbers without colon canonicalization citation form is RSA's canonical
- Skipping the engine-only routing comment in the seeder header orchestration team needs that signal

## Out of scope (next session)

- Engine-worker integration (separate task)
- cron-job.org registration (depends on engine vs Vercel routing decision)
- Wave 2 ME/AL/MI ingests (separate seeders, separate sessions)
