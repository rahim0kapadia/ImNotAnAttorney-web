# Worry — Attorney-Discipline-Events Wiring (2026-04-25, v2.4 post-round-0-v4-CRITs+WARNs)

> **STATUS:** v2.4 — round-0-v4 swarm CRITs + all WARNs applied. SUGs documented as Phase 5 follow-up. Plan ready for Phase 5 implementation.
> - Round-0-v4 (3 reviewers — code, security, dreyer): 2 CRIT + 14 WARN + 11 SUG.
> - **CRIT #1 (code) — T3.1 panel check #1 stale** → updated to tolerant regex `/<h2[^>]*>Your Attorney's Public Bar Record<\/h2>/` with new heading.
> - **CRIT #2 (dreyer) — empty-state "N years of practice" reads as INAA vouching → UPL surface** → dropped years arithmetic; render only "Licensed in CA since YYYY (per CA State Bar)."
> - WARNs applied:
>   - Code: `buildAttorneyDisciplineSection` is the SOLE public symbol (T2.4 wiring); render lib internal helpers stay private. Parity test uses `readFileSync` + parse (matches existing `whitelist-parity.test.ts` pattern), not direct import. `escapeRegExp` 1-liner pinned in `fixtures.ts`. `BRADY_GIGLIO_APPENDIX` literal pinned by symbol-grep in T2.1. Garbage detection limitation noted (multi-token bypass = harmless DB roundtrip, not security defect).
>   - Sec: `null`/`undefined` strings added to garbage regex + `typeof attorneyName !== 'string'` early-return. `WHERE full_name IS NOT NULL` predicate added to expression index. T4.6 RPC anon-denial asserts BOTH `r.status === 404` AND body `code === 'PGRST202'`. Parity test added to `vitest.config.ts` include glob (runs every CI). Extension-namespace runtime invariant: cold-start RPC sentinel call logs WARN if `lower(immutable_unaccent(...))` errors out.
>   - Dreyer: heading reordered to `## Your Attorney's Public Bar Record` (defendant-pronoun first). Niche-domination one-liner: `*We check this on every IB — before you do.*` Disclaimer trim: "Public CA State Bar record. Same data, faster than the .gov form." Cross-state ready: `{stateBarName}` parameterized via `JURISDICTION_BAR_NAMES = { CA: 'California State Bar', NJ: 'NJ Office of Attorney Ethics', VA: 'Virginia State Bar', ... }` (CA only renders v2; multi-state blocked on per-state fair-report memos per T0b).
> - SUGs deferred to Phase 5 commit hygiene: status-header CRIT count alignment, postgrest-special regex `;`/`+` belt-and-suspenders, migration-order comment in T0a, no-match "Most often this is..." NEGATION-IN-CAPS reframe, footnote "Why this is public — and why you should always check", `1 event` vs `N events` conditional, inactive/resigned status copy variants.
>
> **Round-0-v3 history:** v2.3 closed 4 CRITICALs (JS unaccent shim divergence, FIXTURE-004 hostile rows in prod, prompts.ts repath, h2 class regex) + 1 Dreyer CRIT (no-match copy reads scary). All v3 fixes verified applied by v4 swarm.
> - Round-0-v3 (4 reviewers — spec-critic, code-reviewer, security-auditor, chris-dreyer): 4 CRITICAL + 14 WARN + 14 SUG.
> - **CRITICAL #1 (Sec) — JS unaccent shim divergence** → dropped JS shim entirely; RPC takes raw input; Postgres applies `lower(immutable_unaccent($1))` on both sides. Eliminates Søren↔Soren / Łodz↔Lodz / Đức↔Duc asymmetric defamation surface. RPC renamed `attorney_match_by_raw_name`.
> - **CRITICAL #2 (Sec) — FIXTURE-004 hostile rows seeded into prod DB** → fixtures migration now CLEAN-ONLY (3 rows). Hostile values flow only through in-memory test calls to `renderAttorneyDisciplineSection()`; never persist. Eliminates future-surface XSS via service-role table reads.
> - **CRITICAL #3 (Code) — `prompts.ts` not in Edge Function** → T3.2 repathed: Deno-side canonical list at `supabase/functions/generate-report/lib/banned-phrases.ts`, Node-side mirror at `src/lib/intelligence-brief/banned-phrases.ts`, parity test at T3.2a, extraction script at T3.2b reads existing `prompts.ts:34` template literal.
> - **CRITICAL #4 (Code) — `md2html` injects `class="section-h2"`** → T2.4 + Criterion 11 + T3.1 panel updated to assert tolerant regex `/<h2[^>]*>${heading}<\/h2>/`, not bare-tag literal.
> - **CRITICAL (Dreyer) — no-match copy reads as "your lawyer might not be licensed"** → rewrote no-match copy to lead with reassurance + name typo/out-of-state as the two real causes.
> - WARNs applied: regex consistency, Deno test runner clarity (built-in `Deno.test`, not std/bdd), T4.2 baseline-missing fallback, T4.6 RPC anon-test, T1.2 input-contract reorder (trim→collapse→garbage→ctrl→postgrest-special→cap→empty), T2.4 line-number drift (pin-by-symbol), heading rewrite to "Public Bar Record for Your Attorney", empty-state trust signal "Clean public record per the California State Bar", disclaimer trim "Saved you the lookup", T3.3 interpretive-adjective panel, T3.4 entity-decode panel.
> - SUGs applied: T1.1a extension namespace verify (extensions vs public), niche-domination one-liner, footnote rewording "Public record — here's why we can show it", empty-state CTA, status-line ordering rule, T1.3a fixtures.ts task, T2.1 sibling-anchor symbol-pinning, YOUR_PLAN anchor pin (or fallback bound), `safeMdLink` null-URL helper, dictionary-staleness comment, criterion-2 grant-posture pin.
> - Round 0 v2 (history): 17 unique findings, 6 CRITICALs all fixed in v2.1; 10 backlog WARN/SUG applied in v2.2.
> - Round 0 v1: 39 raw findings across 3 reviewers (code 21, sec 10, dreyer 8); ~30 unique post-dedup. Plan rewritten as v2 with major scope cuts (dropped: fuzzy match, Case Decoder integration, intake form changes, multi-state stub, real-attorney fixtures) + 9 adds (RLS migration, fair-report memo, Deno-fetch helper, escapeHtml/safeHttpUrl, current_status/admission_date render, Atti-voice disclaimer, anchor strings, security smokes, expanded worktree).
> - Round 0 v2: 17 unique findings across 3 reviewers (code 13, sec 5, dreyer 2). v2.1 applied **all 6 CRITICALs**: (a) Dreyer markdown-vs-HTML wiring bug (T2.3a), (b) Dreyer Deno-context escapeHtml (T2.3 inline), (c) Sec column-name drift (T1.1/T2.2), (d) Sec PostgREST wildcard (T1.2 input contract), (e) Code wrong render path (T2.4 → `generate-report/index.ts:7429-7450`), (f) Code Deno-side anchors (T2.1).
> - **v2.2 — backlog applied (this session, 2026-04-25):**
>   - Code v2 WARN #4 → T1.4 + T4.2: pinned `deno test` runner; T4.2 tracks Deno + npm counts as separate `before/after` JSON files.
>   - Code v2 WARN #5 → T3.1: replaced LLM `evaluate-report` POST with a deterministic regex panel (no `cases.report_html` setup, no $2-3/run, no LLM dependency in the gate).
>   - Code v2 WARN #6 → T2.3a: added `escapeMarkdownPipe()` step BEFORE escapeHtml on every cell value.
>   - Code v2 WARN #7 → T1.1 (new migration `20260425c_attorney_unaccent.sql`) + T1.2: switched to `lower(unaccent(full_name)) = lower(unaccent($1))` with expression index.
>   - Code v2 WARN #8 → T3.2: imports the full `BANNED_PHRASES_BLOCK` list from a shared module, not a hand-rolled subset; test asserts every phrase is checked.
>   - Code v2 WARN #9 → T1.2 input contract step 0: garbage detection (`asdf`/`test`/`n/a`/`none`/`na`/`qwerty`/`xxxx`/length<3/no whitespace) returns `no-match` before sanitization.
>   - Code v2 WARN #10 → Worktree Boundary pre-check: `gh pr list` filter widened to include `supabase/functions/generate-report/index.ts` specifically.
>   - Code v2 SUG #11 → T4.1a: `deno check` on every Deno-side file written.
>   - Code v2 SUG #12 → T2.4: heading emitted as markdown `## Attorney Bar Record Check`; production-renderer test asserts the literal markdown string survives `markdownToHtml` as `<h2>Attorney Bar Record Check</h2>`.
>   - Code v2 SUG #13 → T2.2: `last_seen_at` rendered via `formatShortDate(d) = new Date(d).toISOString().slice(0,10)` (YYYY-MM-DD), NEVER the raw timestamptz.
> - **Discoveries this session:**
>   - `.env.local` anon key is stale/invalid — returns 401 on every table including known-RLS-protected `cases`/`orders`. Cleanup task: refresh from Supabase Mgmt API. Documented in T4.6.
>   - Production IB renders inside Edge Function (`generate-report/index.ts:7322`), NOT `src/lib/intelligence-brief/render.ts` (dev/test only).
>   - Anchor pinning must be Deno-side; src/lib copy is import-orphaned.
> - **Next entry point:** re-spec-critic v2.2 → swarm round-0-v3 → if pristine, Phase 5 in worktree at `C:\Users\email\projects\_worktrees\worry-attorney-discipline`.

## Worry
We loaded 1,842 California Bar attorneys and 3,417 attorney-discipline events into Supabase (PR shipped 2026-04-22 to 2026-04-24). The `attorneys` table is **populated but unread by product code** — the 91 occurrences of "attorney" in `playbook-configs.ts` and 280 in `generate-report` are all copy/labels referring to "your attorney," not table queries. Zero `from('attorneys')` or `from('attorney_discipline_events')` calls exist in `src/`. The IB Phase-2 intake (`src/app/intake/intelligence-brief/page.tsx:84`) collects `attorneyName` (required), but no surface JOINs that name against the bar tables.

This is the #1 crisis-buyer fear (Bloomstein trust lens, INAA crisis-buyer rule): "is my lawyer trustworthy?" We have the data. We have the intake field. We have not connected them. Every $997 IB customer reads their report and silently asks "did you check my attorney?" — to which the answer right now is "no, even though we could have."

## Expert Lens

**Chris Dreyer** (Rankings.io $34M/yr, *Niching Up*, *From Good to GOAT*, PIMCon 2026) — legal services niche domination. Cached at `~/.claude/experts/chris-dreyer.md`. **Frame:** in legal-adjacent info products, the trust ceiling is set by what the buyer can verify about the named professionals. Surfacing public bar-discipline records puts INAA on the same trust footing as the bar association — a verification layer competitors cannot match without aggregating the data.

**Margaret Hagan** (Stanford Legal Design Lab, A2J methodology) — UPL-safe content audit framework. Cached at `~/.claude/experts/margaret-hagan.md`. **Frame:** factual public records rendered mechanically without interpretation stay on the information side of the UPL line.

**Synthesis:** ship the verification, render mechanically, render only on EXACT-MATCH (no fuzzy — defamation surface).

## Cascade
- **Us:** zero new acquisition cost; IB tier ($997) gains a trust-signal section competitors cannot match.
- **Defendant:** answers a question they are already asking silently.
- **Defendant family:** sees the bar-record check they were Googling at 2am.
- **Disciplined attorney (worst-affected node):** their public bar record is shown inside the defendant's report. Mitigation: render ONLY on exact match (no false-attribution risk per fuzzy-match defamation surface), include explicit "this is the public CA Bar record" framing, link directly to the bar lookup so the defendant can verify themselves, render fact-only (date/type/outcome) without interpretation. CA Civ. Code § 47 fair-report privilege covers accurate republication of official proceedings — but the privilege is jurisdiction-specific. v2 ships CA-only; multi-state expansion blocked on per-state privilege memo (T0b).
- **Future-us:** every new state bar (FL/TX/NY/PA/OH already shipped) becomes another row in the same render section once per-state privilege memos exist.

No node loses (under exact-match-only rendering). Cascade-positive.

## v2 Scope Cuts (vs v1)

| v1 element | v2 status | Why |
|------------|-----------|-----|
| Fuzzy match (Levenshtein ≤2) | **DROPPED** | Sec CRIT #3 + Code WARN #15 — defamation surface, edge cases. Exact-match only. |
| Case Decoder integration (T3) | **DEFERRED to Phase 1.1b** | Code CRIT #3+#4 — CD path goes through `batch-poller.ts:238`, not `generate-report` Edge Function; needs separate plan after IB ships. |
| Intake form changes (T4) | **DROPPED** | Code CRIT #5 — IB intake already has `attorneyName`. Default `attorneyJurisdiction = phase2.state` (defendant's state). 2-bar attorneys (CA-licensed working FL case) are out of v2 scope. |
| Multi-state expansion stub (T6) | **DROPPED** | Replace with one fact: scrapers share `public.attorneys` + `public.attorney_discipline_events`, jurisdiction-keyed (per `scrape-flbar-discipline.mjs:386`, `scrape-txbar-discipline.mjs:291`). v2 ships CA-only. |
| Real-attorney test fixtures (SELECT live data) | **DROPPED** | Sec WARN #8 — privacy/optics + Code WARN #12 — drift. v2 inserts synthetic rows with `bar_number LIKE 'FIXTURE-%'`. |

## v2 Adds (vs v1)

| Add | Source | Description |
|-----|--------|-------------|
| Explicit RLS migration (T0a) | Sec CRIT #1 | Add `ENABLE ROW LEVEL SECURITY` + service-role-only policy to both tables. Anon currently returns 401 (verified live), but RLS posture is implicit — make explicit. |
| Fair-report privilege memo (T0b) | Sec WARN #5 | Document CA Civ. Code § 47 coverage at `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md`. Block multi-state expansion until per-state memo exists. |
| Deno-fetch helper for IB Edge Function (T1.4) | Code WARN #10 | IB renders inside `supabase/functions/generate-report/index.ts` — Deno runtime, no `@supabase/supabase-js`. Use `fetch` against PostgREST matching `supabaseSelect()` pattern at `index.ts:107`. |
| `escapeHtml` + `safeHttpUrl` (T2.4) | Sec WARN #6 | Every interpolated value through `escapeHtml`. `Source URL` through `safeHttpUrl(u)` returning `'#'` for non-`http(s):` protocols. |
| `current_status` + `admission_date` render (T2.2) | Code WARN #17 + Dreyer WARN #5 | Use literal `attorneys.current_status` from DB ('active'/'inactive'/'disbarred'/'suspended'/'resigned'), not synthesized "in good standing." Render years-of-practice from `admission_date` ("Licensed in CA since YYYY — N years"). |
| Atti-voice UPL-safe disclaimer (T2.3) | Code WARN #16 + Dreyer WARN #4 | Replace v1's "should review with the attorney" with: "This is the public CA State Bar record. You can pull it yourself at <bar URL>. We pulled it so you didn't have to." Removes "should" (UPL banned phrase per `prompts.ts:34-44`) + adopts insider Atti tone. |
| Anchor strings pinned to REAL section keys (T2.5) | Code CRIT #1+#2 | Existing IB sections (per `render.ts:311-346`): `case-roadmap`, `whats-working`, `case-intelligence`, `legal-options`, `protection`, `your-plan`, then static appendices. Place attorney-discipline as **new appendix slot** after `your-plan`, before existing static appendices. Export anchor constants from new `src/lib/intelligence-brief/section-anchors.ts` so render + tests share. |
| Sec smokes (T7.6+) | Sec SUG #9 | Anon-key 401 verified, XSS escape unit, injection unit (`"' OR 1=1 --"` returns no-match). |
| Worktree boundary expanded | Sec SUG #10 + Code SUG #21 | Add `supabase/migrations/20260425*_attorney_discipline_rls.sql`, `supabase/functions/evaluate-report/__tests__/`, `docs/legal/`, `src/lib/intelligence-brief/section-anchors.ts`. |

## Numbered Tasks (v2)

### T0 — Pre-implementation gates
- **T0a (RLS migration)** — Create `supabase/migrations/20260425a_attorney_discipline_rls.sql`:
  ```sql
  ALTER TABLE public.attorneys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attorney_discipline_events ENABLE ROW LEVEL SECURITY;
  -- service_role bypasses RLS by default; no SELECT policy = no anon access.
  -- Explicit deny-by-default is the posture.
  ```
  Apply via Management API. Verify anon-key SELECT returns 401 (not `[]`) post-apply.
- **T0b (fair-report memo)** — Write `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` documenting CA Civ. Code § 47 coverage of accurate republication of CA State Bar discipline records inside our reports. Cite source: triangulated .01% media/defamation expert OR cached `~/.claude/experts/eugene-volokh.md` (TBD-triangulate if uncached). Reference memo path in section footer disclaimer (T2.3).

### T1 — DB layer (CA-only, exact match)
- **T1.1** — Schema confirmed (per `supabase/migrations/20260422e_attorney_discipline.sql`):
  - `attorneys`: `(id BIGSERIAL, jurisdiction CHAR(2), bar_number TEXT, full_name TEXT, first_name TEXT, last_name TEXT, admission_date DATE, current_status TEXT, last_seen_at TIMESTAMPTZ, ...)`. UNIQUE `(jurisdiction, bar_number)`.
  - `attorney_discipline_events`: `(id BIGSERIAL, attorney_id BIGINT FK→attorneys, jurisdiction CHAR(2), bar_number TEXT, full_name TEXT, order_date DATE, effective_date DATE, discipline_type TEXT, discipline_raw TEXT, violation_summary TEXT, order_url TEXT, source_url TEXT, scraped_at TIMESTAMPTZ)`. UNIQUE `(jurisdiction, bar_number, order_date, discipline_type)`.
  - Note: there is NO column called `date`/`type`/`outcome`. Render template (T2.2) MUST use the literal column names: `order_date`, `discipline_type`, `violation_summary` (or `discipline_raw` as fallback for human-readable type), `order_url` (preferred for the bar-document link) with fallback to `source_url`. (Sec v2 CRIT #2.)
- **T1.1a (unaccent + expression index)** — Code v2 WARN #7. Create `supabase/migrations/20260425c_attorney_unaccent.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS unaccent;
  -- IMMUTABLE wrapper required because unaccent() is STABLE and indexes need IMMUTABLE.
  -- The wrapper pins to the default 'unaccent' dictionary so behavior matches the index.
  -- NOTE: the two-arg unaccent() form is unaccent(regdictionary, text) — the dictionary
  -- name MUST be cast to regdictionary explicitly (otherwise overload resolution picks the
  -- single-arg form OR errors out on apply).
  CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
    RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
    $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
  CREATE INDEX IF NOT EXISTS idx_attorneys_full_name_norm
    ON public.attorneys (jurisdiction, lower(public.immutable_unaccent(full_name)))
    WHERE full_name IS NOT NULL;
  ```
  (Sec v4 WARN: `WHERE full_name IS NOT NULL` predicate keeps the index lean — NULL `full_name` rows aren't matchable anyway, no point indexing them.)
  Apply via Supabase Management API (`POST /v1/projects/<ref>/database/query`). **Migration role posture (spec-critic CRITICAL):** all migrations apply as the `postgres` superuser role via the Management API, which BYPASSES RLS. T0a's RLS enable + T1.3 fixture INSERT + T1.1a index build all succeed for this reason. Document explicitly so reviewers don't flag the T0a→T1.3 ordering. Verify post-apply: `EXPLAIN SELECT * FROM attorneys WHERE jurisdiction='CA' AND lower(immutable_unaccent(full_name)) = 'jose garcia'` shows index usage. citext was rejected because case-fold is unrelated to diacritic-fold (`José` vs `Jose` is a unaccent problem, not a casefold problem).
- **T1.2** — Write Deno-compatible query helper at `supabase/functions/generate-report/lib/attorney-discipline.ts` (Deno-side, not src/lib) using raw `fetch` to PostgREST matching the `supabaseSelect()` pattern at `generate-report/index.ts:107`. Signature: `getAttorneyDiscipline(attorneyName: string, jurisdiction: string): Promise<{ attorney: AttorneyRow | null, events: DisciplineEvent[], status: 'matched' | 'no-match' }>`.
  - **Jurisdiction guard** (Sec v2 SUG #5): hard-code `if (jurisdiction !== 'CA') return { attorney: null, events: [], status: 'no-match' };` at function entry. Defense-in-depth so v2's CA-only fair-report scope is enforced in code, not only in plan prose. TODO comment names the per-state-memo gate (T0b extension) for future state additions.
  - **Input contract** (Sec v1 CRIT #2 + Sec v2 WARN #3 + Code v2 WARN #9 + Sec v3 WARN reorder + Code v3 + Sec v3 CRITICAL — drop JS shim + Sec v4 WARN null-bypass): apply IN ORDER:
    0. **Type gate (Sec v4 WARN)** — `if (typeof attorneyName !== 'string') return no-match;`. Closes the JS-coercion path where `String(null)` produces `"null"` (4 chars, no whitespace) and bypasses the empty-after-sanitize gate.
    1. `trim()` whitespace
    2. Collapse interior whitespace via `replace(/\s+/g, ' ')` (catches `"n a"`, `"t b d"` bypasses identified by Sec v3).
    3. **Garbage-input gate (Code v2 WARN #9 + Sec v3 WARN ordering + Sec v4 WARN null-literal)** — return `no-match` (don't even reach the DB) if input matches any of:
       - Length < 3
       - No whitespace character (single-token "FirstLast" → most placeholder inputs are tokens)
       - Matches case-insensitive regex `/^(asdf|qwerty|test|n\s*\/?\s*a|none|na|null|undefined|tbd|tbc|x{2,}|z{2,})$/i`
       Limitation note (Code v4 WARN): multi-token garbage like `"asdf foo"` passes this gate and reaches the DB. That is a harmless DB roundtrip (returns no-match), not a security defect. T1.4 garbage-input assertion is scoped to single-token inputs only; the test expectation states "fetch is invoked at most 0 times for single-token inputs, at most 1 time and returns 0 rows for multi-token garbage."
    4. Reject (return `no-match`) on control characters: `/[\r\n\x00]/`.
    5. Reject (return `no-match`) on PostgREST-special chars: `/[*%_,():.]/` — `*` and `%` are wildcards in PostgREST `ilike` (`"Smith*"` would silently match all Smith-prefixed names → defamation surface). `,()` are PostgREST filter separators. `:` is PostgREST operator delimiter. `_` is SQL LIKE single-char wildcard. `.` is reserved in PostgREST identifiers.
    6. Cap 200 chars after sanitization.
    7. Empty after sanitization → return `no-match`.
    > **NO JS-side normalization** (Code v3 CRITICAL + Sec v3 CRITICAL). Earlier v2.2 draft had `s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()` as a "JS unaccent shim." That shim diverges from Postgres `unaccent()` for precomposed-only Latin extensions: `Ł→L`, `Ø→O`, `Æ→AE`, `Ð→D`, `Þ→Th`, `ß→ss`, `đ→d` — JS leaves them intact, Postgres folds them. Asymmetric divergence creates a defamation surface (defendant input `Søren` matches stored `Soren` one direction but not the other). Fix: **drop the JS shim entirely**; pass the trimmed/sanitized RAW input to the RPC; let Postgres apply `lower(immutable_unaccent($1))` on BOTH sides of the equality. Single source of truth, zero divergence.
  - **Match strategy** (Code v2 WARN #7 + revised v3): use a **PostgREST stored RPC**: define `public.attorney_match_by_raw_name(jur text, raw_name text)` returning `setof attorneys`. Helper calls `POST /rest/v1/rpc/attorney_match_by_raw_name` with body `{ "jur": "CA", "raw_name": "<sanitized raw input>" }`. NEVER string-concat into URL or body; use `JSON.stringify` for body and `URLSearchParams` for any query args. RPC + expression-index match yields O(log n), case- and accent-insensitive via Postgres `unaccent`, with `ilike` entirely avoided (no wildcard surface).
  - **RPC migration (T1.1a addendum)**: append the function definition to `20260425c_attorney_unaccent.sql`:
    ```sql
    CREATE OR REPLACE FUNCTION public.attorney_match_by_raw_name(jur text, raw_name text)
      RETURNS SETOF public.attorneys LANGUAGE sql STABLE SECURITY INVOKER AS
      $$ SELECT * FROM public.attorneys
         WHERE jurisdiction = jur
           AND lower(public.immutable_unaccent(full_name))
             = lower(public.immutable_unaccent(raw_name)) $$;
    REVOKE ALL ON FUNCTION public.attorney_match_by_raw_name(text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.attorney_match_by_raw_name(text, text) TO service_role;
    ```
    `SECURITY INVOKER` + `service_role`-only `EXECUTE` keeps RLS posture: anon cannot call the RPC (PostgREST returns 404 for un-EXECUTE-able functions), only the Edge Function (running as service_role) can. **Extension namespace verify (Code v3 SUG):** Supabase typically installs `unaccent` into the `extensions` schema, NOT `public`. Run `SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace=n.oid WHERE e.extname='unaccent'` post-CREATE; if `extensions`, change all `public.unaccent` references in `immutable_unaccent` body and the regdictionary cast to `extensions.unaccent` / `'extensions.unaccent'::regdictionary`. Index/RPC signatures unchanged.
  - **Ambiguous match handling** (Code v1 WARN #15): if >1 row returned, return `status: 'no-match'` (treat as ambiguous → no render). Disambiguation is out of v2 scope.
- **T1.3 (CLEAN fixtures only — Sec v3 CRITICAL #2 — NEVER seed live exploit strings into prod tables)** — Synthetic test fixtures stay STRICTLY non-hostile when seeded via the migration system. Hostile-input testing (XSS, pipe-shred) is done at TEST TIME by the test inserting/restoring rows in a transaction it rolls back, OR by passing hostile values directly to the render builder (in-memory) without DB round-trip.
  Create `supabase/migrations/20260425b_attorney_discipline_test_fixtures.sql` inserting ONLY clean rows:
  ```sql
  INSERT INTO public.attorneys (jurisdiction, bar_number, full_name, first_name, last_name, admission_date, current_status, last_seen_at)
  VALUES
    ('CA', 'FIXTURE-001', 'Fixture Cleanrecord', 'Fixture', 'Cleanrecord', '2010-01-15', 'active',    '2026-04-25T00:00:00Z'),
    ('CA', 'FIXTURE-002', 'Fixture Disciplined', 'Fixture', 'Disciplined', '2005-06-20', 'suspended', '2026-04-25T00:00:00Z'),
    ('CA', 'FIXTURE-003', 'Fixture Cleanrecord', 'Fixture', 'Cleanrecord', '2012-09-10', 'active',    '2026-04-25T00:00:00Z'); -- duplicate full_name → ambiguous-match probe
  INSERT INTO public.attorney_discipline_events (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, discipline_raw, violation_summary, order_url, source_url, scraped_at)
  SELECT a.id, 'CA', a.bar_number, a.full_name, e.order_date, e.discipline_type, e.discipline_raw, e.violation_summary, e.order_url, e.source_url, '2026-04-25T00:00:00Z'
  FROM public.attorneys a
  CROSS JOIN LATERAL (VALUES
    ('FIXTURE-002', DATE '2018-03-12', 'Suspension', 'SUSPENSION 90D STAYED', '90-day suspension stayed', 'https://example.com/fixture-002-evt-1', 'https://example.com/fixture-002-source'),
    ('FIXTURE-002', DATE '2020-07-01', 'Probation',  'PROBATION 1Y',          '1-year probation imposed', 'https://example.com/fixture-002-evt-2', 'https://example.com/fixture-002-source')
  ) AS e(bar, order_date, discipline_type, discipline_raw, violation_summary, order_url, source_url)
  WHERE a.bar_number = e.bar AND a.jurisdiction='CA';
  ```
  Mark fixtures as test-only via comment + RLS policy `WHERE bar_number NOT LIKE 'FIXTURE-%'` for any future anon-readable view (future-proof). `FIXTURE_DISCIPLINED_EVENT_COUNT = 2`.

  **In-memory hostile fixture (T4.4 / criterion 10)** — hostile values (`<script>`, `javascript:`, pipe-shred) are passed DIRECTLY to `buildAttorneyDisciplineSection()` in the test as in-memory `DisciplineEvent` objects. NO DB write required:
  ```ts
  const hostileEvent: DisciplineEvent = {
    order_date: '2024-01-15',
    discipline_type: '<script>alert(1)</script>',
    discipline_raw: 'XSS RAW',
    violation_summary: 'alert | <script>',
    order_url: 'javascript:alert(1)',
    source_url: 'javascript:alert(2)',
  };
  const html = renderAttorneyDisciplineSection({ status: 'matched', attorney: hostileAttorney, events: [hostileEvent] });
  // panel + per-fixture assertions on `html` — never persists.
  ```
  This eliminates the round-0-v3 attack surface where future surfaces (Slack notifier, admin email, CSV export, ops dashboard) could fetch the live FIXTURE-004 row over the service-role key and emit raw `<script>` without going through `cell()`.
- **T1.3a (fixtures.ts module — spec-critic CRITICAL)** — Create `supabase/functions/generate-report/__tests__/fixtures.ts` exporting all constants the test suite + Success-Criteria assertions reference:
  ```ts
  export const FIXTURE_CLEAN_BAR_NUMBER = 'FIXTURE-001';
  export const FIXTURE_CLEAN_ATTORNEY_NAME = 'Fixture Cleanrecord';
  export const FIXTURE_DISCIPLINED_BAR_NUMBER = 'FIXTURE-002';
  export const FIXTURE_DISCIPLINED_ATTORNEY_NAME = 'Fixture Disciplined';
  export const FIXTURE_DISCIPLINED_EVENT_COUNT = 2;
  export const FIXTURE_AMBIGUOUS_BAR_NUMBER = 'FIXTURE-003';
  export const FIXTURE_HOSTILE_BAR_NUMBER = 'FIXTURE-004';
  export const FIXTURE_HOSTILE_ATTORNEY_NAME = 'Fixture Hostile';
  // Re-export from render-attorney-discipline.ts so tests don't import twice:
  export { NO_MATCH_MESSAGE, DISCLAIMER_VERBATIM } from '../lib/render-attorney-discipline.ts';
  // CA Bar lookup base URL — used in success criterion #6 (panel check).
  export const CA_BAR_LOOKUP_BASE = 'https://apps.calbar.ca.gov/attorney/Licensee/Detail/';
  ```
  No logic, just constants + re-exports. Single source of truth for every fixture identifier referenced in T1.4, T3.1, T3.2, T4.4, and Success Criteria 4-13.
- **T1.4** — Unit test in `supabase/functions/generate-report/__tests__/attorney-discipline.test.ts`. **Runner pinned (Code v2 WARN #4 + Code v3 WARN clarity):** `deno test --allow-net --allow-env --no-check=remote supabase/functions/generate-report/__tests__/attorney-discipline.test.ts`. Use Deno's BUILT-IN `Deno.test(name, fn)` global API directly — zero std imports needed. (Earlier v2.2 wording mixed `Deno.test` with `std/testing/bdd.ts` describe/it — incoherent. Pick one. We pick the built-in.) NOT vitest, NOT node:test — those break in Deno's runtime. Cover: matched-clean, matched-disciplined, no-match, ambiguous (`FIXTURE-003` shares full_name with `FIXTURE-001`), injection input (`"' OR 1=1 --"` returns no-match, no error), control-character input, **garbage input (`asdf`, `n/a`, `n a`, `xx`, single-token `Bob`, length<3) returns no-match without DB call** (mock fetch and assert it's never invoked), **diacritic-input (`José García` matches stored `Jose Garcia` via Postgres unaccent — and Postgres-only because we dropped the JS shim per Code v3 CRITICAL; this test exercises the live RPC, NOT a JS-side normalization)**, **non-NFD-decomposable diacritic-input (`Søren Larsen` matches stored `Soren Larsen`; `Nguyễn Đức` matches `Nguyen Duc`) — proves the JS-shim divergence Sec v3 CRITICAL flagged is closed**.

### T2 — IB section (mechanical render only)
- **T2.1** — New file: `supabase/functions/generate-report/lib/section-anchors.ts` (Deno-side, NOT `src/lib/...` — Code v2 CRIT #2: src/lib is import-orphaned in Deno runtime). Export `IB_SECTION_ANCHORS = { ... }` with literal H2 heading strings used by the production IB renderer at `supabase/functions/generate-report/index.ts:7322` (`renderIBReportHtml`, sections array at lines 7429-7450). Read existing strings from `index.ts:7429-7450` and from each `buildXxx()` static appendix builder, pin them here. The Edge Function renderer + Deno-side tests both import from this file. Optional parallel mirror at `src/lib/intelligence-brief/section-anchors.ts` for Node-side dev tools (`scripts/test-ib-pipeline.ts`, `render-ib-test.mjs`) with a parity test (mirror pattern from `src/lib/report/__tests__/whitelist-parity.test.ts`).
- **T2.2** — New section builder in `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (Deno-side, factual mechanical render). Inputs: result of T1.2. Outputs: markdown string (NOT HTML; flows through `markdownToHtml` per T2.3a). Helper `formatShortDate(d) = new Date(d).toISOString().slice(0,10)` returns `YYYY-MM-DD` or `'unknown'` on `NaN` (Code v2 SUG #13 — never render raw timestamptz). **Render-order rule (Dreyer v3 SUG):** trust-signal headline FIRST, status second, admission year third, detail last. Crisis-buyer hierarchy = answer-first, evidence-second.
  - **`matched` + `current_status='active'` + `events.length === 0` (Dreyer v3 WARN + Dreyer v4 CRIT — drop years-of-practice INAA-vouching):**
    ```
    **Clean public record per the {stateBarName} — no discipline events on file.**
    Status (per {stateBarName} as of {formatShortDate(last_seen_at)}): Active
    Licensed in {jurisdiction} since {YYYY of admission_date} (per {stateBarName}).
    Verify yourself: {bar-lookup-url-with-bar-number}
    ```
    Dreyer v4 CRIT: drop "— N years of practice" (INAA editorializing the credential = vouching for the attorney = UPL surface). Years arithmetic stays out of the render. The defendant came suspicious; we don't editorialize.
  - **`matched` + `events.length >= 1` (Dreyer v4 SUG — singular/plural conditional):**
    ```
    **Public discipline record on file with the {stateBarName} ({events.length === 1 ? '1 event' : `${events.length} events`}).**
    Status (per {stateBarName} as of {formatShortDate(last_seen_at)}): {current_status}
    Licensed in {jurisdiction} since {YYYY of admission_date} (per {stateBarName}).
    | Date | Type | Summary | Source |
    |------|------|---------|--------|
    | {cell(formatShortDate(order_date))} | {cell(discipline_type)} | {cell(violation_summary || discipline_raw)} | [CA Bar order]({safeHttpUrl(order_url || source_url)}) |
    ```
    `cell(s)` is the composition `escapeHtml(escapeMarkdownPipe(s))` — pipe-escape FIRST (so the cell stays one cell), HTML-escape SECOND (defangs `<` `>` `&` `"` `'`). See T2.3 + T2.3a. Column-name source per T1.1: `order_date`, `discipline_type`, `violation_summary` (fallback to `discipline_raw`), `order_url` (fallback to `source_url`). All four free-text columns (`discipline_type`, `discipline_raw`, `violation_summary`, plus `formatShortDate(order_date)` for safety even though it's a DATE) flow through `cell()`. (Sec v2 CRIT #2 + Code v2 WARN #6.)
    Footer disclaimer (Atti voice — UPL-safe — Dreyer v4 WARN rewrite): "Public {stateBarName} record. Same data, faster than the .gov form: {bar-lookup-url}." Drops "Saved you the lookup" (read cute/dismissive on a discipline section); replaces with insider-Atti speed-of-access framing.

    Footnote (separate paragraph, smaller font / muted color in CSS): "[Public record — here's why we can show it]({fair-report-memo-url})" (Dreyer v3 SUG). Link target is the deployed URL of `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md`.
  - **`no-match` (includes ambiguous-match) — Dreyer v3 CRITICAL rewrite (lead with reassurance, not negative):**
    ```
    We couldn't match "{cell(attorney_name)}" to a {stateBarName} record. Most often this is a spelling difference, or your attorney is barred in another state. It does NOT mean they're unlicensed. Try the official lookup yourself: {bar-lookup-url}
    ```
    Dreyer v4 SUG applied: leads with the cause ("Most often this is..."), uses NEGATION-IN-CAPS ("does NOT mean") so a panicked skim-reader who only catches fragments still anchors on the reassurance. Defamation surface unchanged — still no fact-claim about the named attorney's status.
- **T2.3** — Inline helpers inside the Deno-side `render-attorney-discipline.ts` file (Deno cannot import from `src/lib/intelligence-brief/render.ts` which imports from `../email`). Three helpers, all applied to every interpolation:
  - `escapeHtml(s: string): string` — covers `& < > " '`.
  - `safeHttpUrl(u: string): string` — returns `u` if `/^https?:\/\//i.test(u)` else `'#'`.
  - `escapeMarkdownPipe(s: string): string` — `s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')` (Code v2 WARN #6). Backslash is escaped first to keep the pipe-escape itself literal. Without this, a scraper-fed `discipline_raw` value like `Suspension | 90-day stayed` would shred the markdown table by adding an extra cell.
  - `cell(s)` shorthand: `escapeHtml(escapeMarkdownPipe(s == null ? '' : String(s)))`. Pipe-escape BEFORE HTML-escape so the `\|` stays a literal escape sequence visible to the markdown parser, not an `&#92;|`. (Dreyer v2 WARN #2.) **Verified by Sec v3** that the order is correct: HTML-escape doesn't touch `\` or `|` (neither is in the 5-char escape set), so the markdown parser sees the literal `\|` and renders it as a single-cell pipe. **Renderer pin (Sec v3 WARN)**: `md2html` at `index.ts:7329` is a hand-rolled regex pipeline (NOT `marked`/`commonmark`). Its table-row split regex is `(?<!\\)\|` — `\|` is the recognized escape, confirming `escapeMarkdownPipe`'s `\|` output is correctly consumed. If `md2html` is ever swapped for a library, re-verify this — drop a CI parity test rendering `'a \| b'` and asserting one cell, not two.
  - `safeMdLink(label, url)` — when `url` is null/empty, return plain text `${label} (link unavailable)` (Sec v3 SUG cosmetic — avoids `[CA Bar order](#)` clickable anchor pointing to top-of-page). Otherwise return `[${label}](${safeHttpUrl(url)})`. Used wherever the order_url/source_url fallback could land on `'#'`.
- **T2.3a** — Section builder MUST emit **markdown**, not raw HTML, because `renderIntelligenceBriefHtml` at `src/lib/intelligence-brief/render.ts:348-350` pipes every section through `markdownToHtml(s)` before joining — the `|`-pipe regex at `render.ts:37` would shred a pre-built `<tr>` block. Output a markdown table built using the `cell()` helper from T2.3:
  ```
  | Date | Type | Summary | Source |
  |------|------|---------|--------|
  | {cell(formatShortDate(order_date))} | {cell(discipline_type)} | {cell(violation_summary || discipline_raw)} | [CA Bar order]({safeHttpUrl(order_url || source_url)}) |
  ```
  with the heading + paragraph copy as plain markdown. (Dreyer v2 WARN #1.) Note: HTML-tagged input values still flow through `markdownToHtml` paragraph wrapping — pipe-escape and HTML-escape BEFORE markdown-render, not after.
- **T2.4** — Wire into the **production IB renderer** at `supabase/functions/generate-report/index.ts` (NOT `src/lib/intelligence-brief/render.ts` — zero production callers; dev/test tooling only). Pin the insertion point by section-output keys (Code v3 WARN — line numbers drift): place the new entry between the array entry that reads `sectionOutputs["your-plan"]` and the call to `buildBradyGiglioChecklist()`. The new entry calls `await buildAttorneyDisciplineSection({ attorneyName, jurisdiction, supabaseUrl, serviceRoleKey })`; move array construction inside an `async` block (the renderer is already inside an async caller).
  - **Heading wording — Dreyer v4 WARN rewrite**: emit markdown `## Your Attorney's Public Bar Record`. (Dreyer v4: defendant-pronoun "Your Attorney's" leads, institutional "Public Bar Record" follows. Aligns with INAA's defendant-side voice across other IB sections.) Personalized variant `What the State Bar Says About {first_name}` reserved for v3 A/B once intake-name confidence is high.
  - **Heading assertion (Code v3 CRITICAL — md2html emits `<h2 class="section-h2">`)**: `md2html` at `index.ts:7346` does `.replace(/^## (.+)$/gm, '<h2 class="section-h2">$1</h2>')` — class is ALWAYS injected, NOT bare-tag. T3.1 panel + Criterion 11(a):
    - Strict-literal form: `<h2 class="section-h2">Your Attorney's Public Bar Record</h2>`.
    - Tolerant regex (preferred, survives future class rename): `/<h2[^>]*>Your Attorney's Public Bar Record<\/h2>/`.
  - **Niche-domination one-liner (Dreyer v4 WARN — anchor to defendant's job, not competitor)**: under the H2, emit one italicized markdown line: `*We check this on every IB — before you do.*` Anchors the moat claim to the defendant's 2am job-to-be-done (looking up their own lawyer) rather than a competitor comparison. Zero UPL risk (factual, not interpretive). The line is part of the section body — if section is suppressed (kill-switch, jurisdiction unsupported, RPC failure fallback), the one-liner is suppressed with it.
  - Export `IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE = "Your Attorney's Public Bar Record"` from the Deno `section-anchors.ts` (T2.1). NOTE the apostrophe — `escapeRegExp` is mandatory before injecting into any test regex (`fixtures.ts` exports `escapeRegExp(s) = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`). **Pin sibling anchors by symbol, not line range** (Code v3 WARN): T2.1 must `Grep` `<h2 class="section-h2">.+?<\/h2>` in `index.ts` + each `buildXxx()` body, plus pin the LLM-generated `your-plan` heading from its prompt template, and seed every literal in `IB_SECTION_ANCHORS`.
  - **YOUR_PLAN anchor pin (Code v3 SUG)** — `your-plan` is LLM-generated; H2 emitted depends on prompt template. Before relying on `IB_SECTION_ANCHORS.YOUR_PLAN` as an ordering anchor in Criterion 11(b), grep `index.ts` + `prompts.ts` for the `your-plan` heading template (likely literal `Your Plan Right Now` or similar); pin the literal. If the LLM heading is non-deterministic, drop YOUR_PLAN as the lower bound and use the new section's PRECEDING stable static appendix as the bound instead.
- **T2.5** — Skip Case Decoder integration (deferred to Phase 1.1b). v2 = IB-only.

### T3 — UPL safety
- **T3.1 (deterministic regex panel — Code v2 WARN #5)** — REPLACE the LLM-based `evaluate-report` POST. The LLM eval was rejected because it (a) requires a `caseId` plus pre-populated `cases.report_html`, (b) costs $2-3/run × 5 fixtures × every CI run, (c) is non-deterministic (LLM grader can flake green or red on identical input), (d) gates a code-review iteration loop on a paid LLM call. Instead: add `supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts` (Deno test) that renders the 5 fixture payloads in-process (no DB, no LLM) and runs a deterministic regex panel against each rendered HTML string:
  - **Panel checks (every fixture):**
    1. Matches regex `/<h2[^>]*>Your Attorney's Public Bar Record<\/h2>/` exactly once. (Code v4 CRIT — was stale "Attorney Bar Record Check" + bare-tag literal; updated to v2.4 heading + tolerant regex matching md2html's `class="section-h2"` injection.)
    2. Does NOT contain any phrase from `BANNED_PHRASES_BLOCK` (case-insensitive `.includes` per phrase — see T3.2).
    3. Does NOT contain literal `<script` or `javascript:` (case-insensitive — XSS panel).
    4. Every `href="..."` attribute satisfies `/^(#|https?:\/\/)/i` (no `data:`/`mailto:`/`vbscript:`).
    5. Contains the disclaimer string `DISCLAIMER_VERBATIM` exactly once.
    6. Contains link to `https://apps.calbar.ca.gov/attorney/Licensee/Detail/` (the CA Bar lookup base URL — verifies the "verify yourself" CTA wired correctly).
  - **Per-fixture assertions:**
    - matched-clean: contains `Active`, contains `No public discipline events on record`.
    - matched-1-event-suspension: contains `Suspension`, contains exactly one `<tr>`-equivalent table data row (i.e., the rendered HTML matches `/<table>[\s\S]*?<\/table>/` exactly once and that block contains exactly two `<tr>`s — header + 1 event).
    - matched-multi-event-disbarment: matches the multi-event count from `FIXTURE_DISCIPLINED_EVENT_COUNT`.
    - no-match: contains `No exact match for`, does NOT contain `<table>`.
    - ambiguous: same as no-match (confirms ambiguous → no-match path).
  - LLM `evaluate-report` integration moved to a **separate nightly cron sample** (5 random reports/day, asserted via the same regex panel + LLM as a tie-breaker). Out of v2 scope — captured as Phase 1.1c follow-up.
- **T3.2 (banned-phrase shared module — Code v2 WARN #8 + Code v3 CRITICAL repath)** — Round-0-v3 ground-truth: `BANNED_PHRASES_BLOCK` lives at `src/lib/intelligence-brief/prompts.ts:34` (Node-side template literal, multi-line string). The Edge Function (`supabase/functions/generate-report/`) has NO `lib/` directory and NO `prompts.ts`; the Edge Function's own UPL prompts are inline in `index.ts`. Therefore "extract from `supabase/functions/generate-report/lib/prompts.ts`" is impossible.
  Two-file canonical pattern:
  - **Deno-side canonical** (`supabase/functions/generate-report/lib/banned-phrases.ts`) — array-of-strings derived from the Node-side template literal. Each entry is an individual phrase, not the whole block:
    ```ts
    // CANONICAL banned-phrase list. Mirrored to Node-side at
    // src/lib/intelligence-brief/banned-phrases.ts via a parity test (T3.2a).
    export const BANNED_PHRASES_BLOCK: readonly string[] = [
      'you should',
      'should file', 'should pursue', 'should review',
      'you need to', 'your best option', 'you must', 'you have to',
      'we advise', 'we recommend', 'i recommend',
      'red flag', 'warning sign', 'escalation ladder',
      // EXTEND with every literal phrase parsed from src/lib/intelligence-brief/prompts.ts
      // BANNED_PHRASES_BLOCK template literal — DO NOT hand-roll a subset.
    ] as const;
    ```
  - **Node-side mirror** (`src/lib/intelligence-brief/banned-phrases.ts`) — re-exports the Deno-side list (TS `import` with relative path resolves at build time; if Vite/webpack resolution complains because of the `supabase/functions/` prefix, copy-by-codegen is acceptable: a tiny script reads the Deno file and writes the Node mirror, run as `pnpm run sync-banned-phrases` and asserted in T3.2a). `prompts.ts` then imports `BANNED_PHRASES_BLOCK` from the Node mirror and interpolates into the existing template literal.
- **T3.2a (parity test)** — Node-side test `src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts` reads BOTH files, asserts the arrays are deep-equal. Catches future drift between Deno-side and Node-side. Mirror pattern: `src/lib/report/__tests__/whitelist-parity.test.ts`.
- **T3.2b (canonical-phrase extraction)** — Implementer must, before writing the array, read the existing `BANNED_PHRASES_BLOCK` template literal at `src/lib/intelligence-brief/prompts.ts:34` and tokenize EVERY quoted phrase out of it (the literal mixes prose with quoted phrases — only the quoted phrases are banned). Document the extraction script + checked-in output. Test asserts `BANNED_PHRASES_BLOCK.length >= 10` so a future hand-edit that empties the array doesn't false-green.
- **T3.1 panel uses the canonical list**: `for (const p of BANNED_PHRASES_BLOCK) assert(!html.toLowerCase().includes(p.toLowerCase()), \`fixture \${name} contains banned phrase "\${p}"\`)`.

- **T3.3 (interpretive-language structural panel — Code v3 WARN safety net)** — Regex panel cannot catch novel interpretive phrasing the LLM eval previously flagged. Defense-in-depth: add a structural assertion to T3.1 panel that fails on ANY adjective-about-attorney pattern:
  ```ts
  const INTERPRETIVE_BANNED = /\b(unreliable|incompetent|negligent|untrustworthy|sketchy|shady|questionable|inadequate|deficient)\b/i;
  assert(!INTERPRETIVE_BANNED.test(html), 'interpretive adjective about attorney');
  ```
  Bridges the gap between deterministic regex panel and the deferred Phase 1.1c LLM-sample cron.

- **T3.4 (entity-encoded-XSS panel check — Sec v3 SUG)** — Add to the panel: after rendering, run the HTML through ONE round of HTML-entity decoding (use Deno's `https://deno.land/std/html/entities.ts` `decode`); assert the decoded string still does NOT contain `<script` or `javascript:`. Defends against double-encoded payloads where a future renderer change might decode-then-render.

### T4 — Verification
- **T4.1** — `npm run build` exit 0.
- **T4.1a (Code v2 SUG #11)** — `deno check` on every Deno-side file written in the worktree, before committing:
  ```
  deno check supabase/functions/generate-report/lib/attorney-discipline.ts \
             supabase/functions/generate-report/lib/render-attorney-discipline.ts \
             supabase/functions/generate-report/lib/section-anchors.ts \
             supabase/functions/generate-report/lib/banned-phrases.ts \
             supabase/functions/generate-report/__tests__/attorney-discipline.test.ts \
             supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts \
             supabase/functions/generate-report/__tests__/fixtures.ts \
             supabase/functions/__tests__/rls-attorney-discipline.test.ts \
             supabase/functions/generate-report/index.ts
  ```
  Exit 0 mandatory. Catches Deno-resolution drift the npm `tsc` build never covers (Edge Function runs on Deno, not Node).
- **T4.2 (Code v2 WARN #4 — separate Deno + npm count tracking)** — Capture two pairs of before/after snapshots, asserted independently:
  - **npm side** — `npm test -- --reporter=json --outputFile=.tmp/after-npm.json`. Capture `.tmp/baseline-test-counts/before-npm.json` from `origin/master` via fresh worktree at `.tmp/baseline-test-counts/`. Assert `after.numPassedTests >= before.numPassedTests` AND `before.passing[]` ∩ `after.failing[]` is empty.
  - **Deno side** — `deno test --allow-net --allow-env --no-check=remote --reporter=junit supabase/functions/ > .tmp/after-deno.xml`. Capture `.tmp/baseline-test-counts/before-deno.xml` from `origin/master` by checking out master into a temp worktree and running the same command. **If the baseline file is missing OR malformed (Code v3 WARN — origin/master may have zero deno tests)**: treat as `tests=0, failures=0, errors=0` and proceed. Document the fallback explicitly in the harness. Parse `<testsuites tests="N" failures="F" errors="E">`; assert `after.tests >= before.tests` AND `after.failures + after.errors === 0`.
  - **Confirm npm runner first (Code v3 / spec-critic WARN)**: read `package.json#scripts.test`. If `vitest`, the `--reporter=json --outputFile=` flags are correct as-written. If `jest`, switch to `--json --outputFile=`. Pin the actual runner in this T-task before Phase 5 begins.
  - The two suites use different runners and different file globs (`vitest`/`jest` vs `deno test`); merging counts hides regressions in either. Track separately, gate on both.
- **T4.3** — CV probe-only: `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` exits 0 AND no `INNA-H1.*FAIL` in stdout (no substring count assertion).
- **T4.4** — XSS smoke: insert a third fixture row with `discipline.type='<script>alert(1)</script>'` and `source_url='javascript:alert(1)'`; render via T2.2; assert HTML contains escaped `&lt;script&gt;` and `href="#"` (not `href="javascript:..."`).
- **T4.5** — Injection smoke: `getAttorneyDiscipline("' OR 1=1 --", 'CA')` returns `{ status: 'no-match', attorney: null, events: [] }`, no error thrown.
- **T4.6** — Anon-key denial smoke: in `supabase/functions/__tests__/rls-attorney-discipline.test.ts`, FIRST decode the ANON_KEY JWT and assert `role === 'anon'` (otherwise abort — wrong-key misconfig produces a false-green per Sec v2 WARN #4). THEN three assertions:
  1. **Table SELECT** — `curl ${SUPABASE_URL}/rest/v1/attorney_discipline_events?select=* -H "apikey: ${ANON_KEY}"` returns **HTTP 200 + body `[]`** (RLS-blocked-anon returns empty, NOT 401 — Code v2 CRIT #3 verified live 2026-04-25). `r.status === 200 && JSON.parse(await r.text()).length === 0`. Same assertion against `attorneys`. **Grant-posture pin (Code v3 SUG)**: pre-flight asserts `\dp public.attorneys` shows `anon` has table-level `SELECT` grant (otherwise PostgREST returns 401 instead of 200/[] and the test would false-fail under stricter posture). Pin the expected grant state in this T-task.
  2. **RPC POST denial (Sec v3 WARN + Sec v4 WARN body-code pin)** — `curl -X POST ${SUPABASE_URL}/rest/v1/rpc/attorney_match_by_raw_name -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" -d '{"jur":"CA","raw_name":"x"}'` returns **HTTP 404 AND body parses to JSON with `code === 'PGRST202'`**. Test asserts BOTH conditions (Sec v4 — earlier `||` form silently degraded if body shape changed). Add positive control: same RPC with service-role key against `FIXTURE_CLEAN_ATTORNEY_NAME` returns 200 + non-empty array — proves the test exercises the actual function path, not a typo'd 404 for the wrong reason.
  3. **Pre-flight key source (Sec v2 WARN #4)** — anon-key in test env MUST come from Supabase Mgmt API at runtime (`/v1/projects/<ref>/api-keys?reveal=true`) NOT `.env.local`. Stale `.env.local` returned 401 on every table during the 2026-04-25 session, masking actual RLS posture. Update `.env.local` anon key in a separate cleanup task.
  Aligns with INAA-web ARCHITECTURE.md invariant #4 (service-role only for production DB; RLS is defense-in-depth).
- **T4.7** — Live render smoke: invoke IB renderer with the synthetic `FIXTURE-002` case fixture; assert rendered HTML contains `Your Attorney's Public Bar Record` exactly once, with the `<tr>` discipline event row, with the Atti-voice disclaimer string verbatim.

## Out of Scope (v2)
- Case Decoder integration → **Phase 1.1b** separate plan (path: `batch-poller.ts:238` post-Opus markdown injection).
- Multi-state attorney discipline (FL/TX/NY/PA/OH) → blocked on per-state fair-report privilege memos.
- Fuzzy match / disambiguation prompt → defamation surface; not until exact-match version is shipped + observed.
- Intake form jurisdiction field → 2-bar attorneys are an edge case; default to defendant's state until real demand observed.
- Attorney rating / scoring → interpretation, breaks UPL safety.
- Officer-discipline parallel section → separate worry, separate plan.
- Backfill of already-delivered reports → not in scope; new section only for reports generated after deploy.

## Success Criteria

**Fixture declarations (defined in T1.3 migration; constants exported from `supabase/functions/generate-report/__tests__/fixtures.ts`):**
- `FIXTURE_CLEAN_BAR_NUMBER = 'FIXTURE-001'`
- `FIXTURE_CLEAN_ATTORNEY_NAME = 'Fixture Cleanrecord'`
- `FIXTURE_DISCIPLINED_BAR_NUMBER = 'FIXTURE-002'`
- `FIXTURE_DISCIPLINED_ATTORNEY_NAME = 'Fixture Disciplined'`
- `FIXTURE_DISCIPLINED_EVENT_COUNT = 2`
- `FIXTURE_AMBIGUOUS_BAR_NUMBER = 'FIXTURE-003'` (second 'Fixture Cleanrecord' row to test ambiguous-match no-match return)
- `NO_MATCH_MESSAGE` exported from `render-attorney-discipline.ts`
- `IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE = "Your Attorney's Public Bar Record"` (and other existing IB section heading constants pinned in `supabase/functions/generate-report/lib/section-anchors.ts` — Deno-side canonical; Node-side `src/lib/intelligence-brief/section-anchors.ts` is a parity mirror)
- `DISCLAIMER_VERBATIM` exported from `render-attorney-discipline.ts` containing the full footer-disclaimer string

1. **RLS posture explicit.** `psql` against the project: `SELECT relrowsecurity FROM pg_class WHERE relname IN ('attorneys','attorney_discipline_events')` returns `t` for both rows. (Verifiable PASS/FAIL via single SQL query post-T0a.)
2. **Anon denial smoke.** `curl ${SUPABASE_URL}/rest/v1/attorney_discipline_events?select=* -H "apikey: ${ANON_KEY}"` returns **HTTP 200 + body `[]`** (RLS-blocked-anon under PostgREST returns empty, NOT 401 — Code v2 CRIT #3 verified live 2026-04-25). Test at `supabase/functions/__tests__/rls-attorney-discipline.test.ts` first decodes the JWT and asserts `role === 'anon'` (false-green guard per Sec v2 WARN #4), then asserts `r.status === 200 && JSON.parse(await r.text()).length === 0` against both `attorneys` and `attorney_discipline_events`.
3. **Function exists.** `import { getAttorneyDiscipline } from 'supabase/functions/generate-report/lib/attorney-discipline'` resolves; `typeof getAttorneyDiscipline === 'function'`; `getAttorneyDiscipline.length === 2`.
4. **Shape test passes.** Test `'returns expected shape'` calls `getAttorneyDiscipline(FIXTURE_DISCIPLINED_ATTORNEY_NAME, 'CA')`; asserts result keys deep-equal `['attorney', 'events', 'status']`.
5. **Clean attorney match.** Test `'matches clean attorney'` calls `getAttorneyDiscipline(FIXTURE_CLEAN_ATTORNEY_NAME, 'CA')`; asserts `result.status === 'matched' && result.events.length === 0 && result.attorney.current_status === 'active' && result.attorney.bar_number === FIXTURE_CLEAN_BAR_NUMBER`.
6. **Disciplined attorney match.** Test asserts `result.status === 'matched' && result.events.length === FIXTURE_DISCIPLINED_EVENT_COUNT && result.attorney.current_status === 'suspended'`. Each event has `typeof e.order_date === 'string' && typeof e.discipline_type === 'string' && (typeof e.violation_summary === 'string' || typeof e.discipline_raw === 'string')`. (Column-name correction per T1.1 — `date`/`type`/`outcome` columns do not exist.)
7. **Ambiguous match returns no-match.** Test inserts duplicate fixture row `FIXTURE-003` with same `full_name` as `FIXTURE-001`; asserts `getAttorneyDiscipline(FIXTURE_CLEAN_ATTORNEY_NAME, 'CA').status === 'no-match'`.
8. **Injection-resistant.** Test asserts `getAttorneyDiscipline("' OR 1=1 --", 'CA')` deep-equals `{ attorney: null, events: [], status: 'no-match' }` AND no error thrown.
9. **No-match path.** Test asserts `getAttorneyDiscipline('Zzzzz Nonexistent', 'CA')` deep-equals `{ attorney: null, events: [], status: 'no-match' }`.
10. **Renderer escapes hostile input — IN-MEMORY ONLY (Sec v3 CRITICAL — no hostile rows persisted).** Test constructs an in-memory `DisciplineEvent` with `discipline_type='<script>alert(1)</script>'`, `violation_summary='alert | <script>'` (pipe-injection probe), `source_url='javascript:alert(1)'`, and passes it directly to `renderAttorneyDisciplineSection({ status: 'matched', attorney: hostileAttorney, events: [hostileEvent] })`. Asserts output HTML contains `&lt;script&gt;alert(1)&lt;/script&gt;` AND contains `href="#"` AND does NOT contain literal `<script>` or literal `javascript:` AND the rendered table has exactly the expected `<td>` cell count per row (pipe-escape kept the cell intact, no extra column). Test also runs the rendered HTML through ONE round of HTML-entity decoding (`std/html/entities.ts decode`) and asserts the decoded output STILL does not contain `<script` or `javascript:` (T3.4 entity-decode panel — Sec v3 SUG).
11. **IB renders attorney-discipline section in correct slot.** Test imports `IB_SECTION_ANCHORS`, invokes IB renderer with `FIXTURE_DISCIPLINED_BAR_NUMBER` synthetic case; asserts: (a) output HTML matches `/<h2[^>]*>${escape(IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE)}<\/h2>/` exactly once (md2html ALWAYS injects `class="section-h2"` per `index.ts:7346`; the regex tolerates that without coupling to the class name — Code v3 CRITICAL), (b) `output.indexOf(IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE) > output.indexOf(IB_SECTION_ANCHORS.YOUR_PLAN)`, (c) `output.indexOf(IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE) < output.indexOf(IB_SECTION_ANCHORS.BRADY_GIGLIO_APPENDIX)`. Anchor strings imported from `section-anchors.ts` so render + test cannot drift.
12. **UPL deterministic regex panel passes — 5-fixture matrix.** Test from T3.1 renders 5 fixture payloads (matched-clean, matched-1-event, matched-multi-event, no-match, ambiguous) and runs the regex panel + per-fixture assertions. Every panel check passes; no LLM call made. (Replaces the v2.1 LLM-eval criterion per Code v2 WARN #5.)
13. **Disclaimer is UPL-banned-phrase-free.** Test asserts `DISCLAIMER_VERBATIM` does NOT contain ANY phrase from `BANNED_PHRASES_BLOCK` (imported from `supabase/functions/generate-report/lib/banned-phrases.ts`, T3.2). Iterates the full array — no hand-rolled subset (Code v2 WARN #8). Also asserts `BANNED_PHRASES_BLOCK.length >= 10` so a future hand-edit that empties the array doesn't false-green.
14. **Fair-report privilege memo present.** File `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` exists; contains the literal substring `California Civil Code § 47`. (Reader runs `test -f` and `grep -F`.)
15. **Build green.** `npm run build` exit 0.
16. **Tests green — count-pinned.** Capture `npm test -- --reporter=json --outputFile=before.json` on `origin/master` via temporary `.tmp/baseline-checkout/`; capture `after.json` on PR branch; assert `after.numPassedTests >= before.numPassedTests` AND no test name in `before.passing[]` appears in `after.failing[]`.
17. **CV probe-only green.** `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` exits 0 AND stdout has zero lines matching `/INNA-H1.*FAIL/`.

**Worry-intent coverage:** worry says "we have intake.attorneyName, we have the bar tables, we never connect them." Criteria 5/6/11 connect intake fixture → query helper → IB rendered output for both clean and disciplined cases. Criterion 12 confirms UPL gate stays green. Criteria 1/2 confirm defensive RLS. Criteria 7/8/9/10 cover defamation/injection/XSS edge cases the round-0 reviewers flagged.

## Worktree Boundary (v2.3)
Run in isolated worktree at `C:\Users\email\projects\_worktrees\worry-attorney-discipline` off `origin/master` (currently `725a8a8e`). Touch only:
- `supabase/migrations/20260425a_attorney_discipline_rls.sql` (new, T0a)
- `supabase/migrations/20260425b_attorney_discipline_test_fixtures.sql` (new, T1.3 — CLEAN fixtures only, no hostile rows; Sec v3 CRITICAL)
- `supabase/migrations/20260425c_attorney_unaccent.sql` (new, T1.1a + T1.2 RPC `attorney_match_by_raw_name`; Code v2 WARN #7 + Code v3 CRITICAL JS-shim drop)
- `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` (new, T0b)
- `supabase/functions/generate-report/lib/attorney-discipline.ts` (new, T1.2 — RPC client, no JS unaccent shim)
- `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (new, T2.2)
- `supabase/functions/generate-report/lib/section-anchors.ts` (new — Deno-side anchors, T2.1)
- `supabase/functions/generate-report/lib/banned-phrases.ts` (new, T3.2 — Deno-side canonical list; Code v3 CRITICAL repath)
- `src/lib/intelligence-brief/banned-phrases.ts` (new — Node-side mirror; T3.2 + T3.2a parity test)
- `src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts` (new — T3.2a)
- `src/lib/intelligence-brief/prompts.ts` (modify — interpolate `BANNED_PHRASES_BLOCK` from new Node-side mirror, T3.2)
- `supabase/functions/generate-report/__tests__/attorney-discipline.test.ts` (new, T1.4)
- `supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts` (new, T3.1 — deterministic regex panel + T3.3 interpretive panel + T3.4 entity-decode panel)
- `supabase/functions/generate-report/__tests__/fixtures.ts` (new — fixture constants, T1.3a)
- `supabase/functions/__tests__/rls-attorney-discipline.test.ts` (new, T4.6 — table SELECT + RPC POST anon denial)
- `supabase/functions/generate-report/index.ts` (modify — wire helper between `your-plan` and `buildBradyGiglioChecklist`)
- `src/lib/intelligence-brief/section-anchors.ts` (new — Node-side parallel mirror, T2.1, optional)
- `src/lib/intelligence-brief/render.ts` (modify — dev-tool parity, optional)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire.md` (this file)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire-findings.md` (rounds findings, new)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire-rounds.md` (per-round log, new)

**Pre-execution check** (Code WARN #18 + Code v2 WARN #10):
1. Run `gh pr list --state open --json number,headRefName,files --limit 50`.
2. Confirm none of the 17 worktree-boundary paths appear in any open sibling PR's `files[]`.
3. **Special case for `supabase/functions/generate-report/index.ts`** — this file is high-collision (every IB-touching PR modifies it). Filter open PRs to those touching this exact path:
   ```
   gh pr list --state open --json number,headRefName,files --limit 50 \
     | jq '[.[] | select(.files[].path == "supabase/functions/generate-report/index.ts")
                | {number, headRefName}]'
   ```
   If any PR is returned, surface to the user BEFORE starting Phase 5 — Phase 5 will rebase-conflict against it. Coordinate sibling-session owner: either wait for sibling merge, OR rebase Phase 5 onto sibling's branch instead of `origin/master`.
4. Abort if collision after coordination fails.

Do NOT touch sibling-owned files: anything modified in PRs currently open by sibling sessions (#102, #105, #108, #110, #116, #118, #134, #136, etc).

## Phase 1.1b — Case Decoder integration (deferred plan, queued)
After v2 ships:
- Audit `src/lib/cron/batch-poller.ts:202-238` to find the post-Opus markdown injection seam.
- Add a CD-side mechanical render appended to `cleaned` markdown before `renderReportHtml(cleaned, meta)` call.
- Verify CD intake (`src/app/api/intake/route.ts`) collects `attorney_name` (audit needed; v2 does not assume).
- Tier-monotonicity: CD section shows `current_status` + lookup link only (no event table); IB shows full table. (Dreyer WARN #3.)

This is a separate `/worry-to-pristine` invocation, not part of v2.
