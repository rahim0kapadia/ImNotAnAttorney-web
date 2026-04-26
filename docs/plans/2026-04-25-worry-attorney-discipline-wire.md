# Worry — Attorney-Discipline-Events Wiring (2026-04-25, v2.4 post-round-0-v4)

> **STATUS:** v2.2 — all 10 v2.1 backlog findings applied. Ready for round 0 v3 swarm.
> - Round 0 v1: 39 raw findings across 3 reviewers; v2 plan rewrite (scope-cut fuzzy match, CD integration, intake form, multi-state, real-attorney fixtures; added RLS migration, fair-report memo, Deno-fetch helper, escapeHtml/safeHttpUrl, current_status/admission_date, Atti-voice disclaimer, anchor strings, security smokes).
> - Round 0 v2: 17 unique findings; v2.1 applied 6 CRITICALs (Dreyer md-vs-HTML wiring, Dreyer Deno escapeHtml, Sec column drift, Sec PostgREST wildcard, Code wrong render path, Code Deno-side anchors).
> - **v2.2 (this revision)**: all 10 backlog findings (Code WARN #4-10 + SUG #11-13) applied:
>   - WARN #4: T1.4 pins `deno test --allow-net --allow-env`; T4.2a tracks Deno count separately from npm test count.
>   - WARN #5: T3.1 rewritten — insert fixture `cases` row with `report_html` populated, invoke evaluate-report by caseId; reduce live LLM calls 5→1 (cost ~$2-3); regex panel covers other 4 fixture states.
>   - WARN #6: `escapeMarkdownPipe()` helper added to T2.3 inline; applied BEFORE `escapeHtml` in every cell value of the discipline-events table.
>   - WARN #7: T0a migration adds `CREATE EXTENSION IF NOT EXISTS unaccent` + expression index `LOWER(unaccent(full_name))` + RPC `match_attorney(p_name, p_jurisdiction)`. T1.2 calls RPC via `POST /rest/v1/rpc/match_attorney` (not raw `?ilike=`); RPC body uses `LOWER(unaccent(...))` so `José` matches `Jose`.
>   - WARN #8: `BANNED_PHRASES_LIST` extracted as exported `as const` array next to `BANNED_PHRASES_BLOCK` in `src/lib/intelligence-brief/prompts.ts`; T3.2 test imports the array (Node-side test) and asserts `DISCLAIMER_VERBATIM` contains none.
>   - WARN #9: T2.4 IB renderer entry adds garbage-name guard — skip section if `attorneyName` is empty, `length<3`, no space, or matches `/^(n\/?a|none|tbd|unknown|skip|pending|asdf|test)$/i`. Helper exported from `render-attorney-discipline.ts` as `isAttorneyNameRenderable()`.
>   - WARN #10: New T0c task — `gh pr list --state open --json files` pre-flight before worktree creation; abort if any open PR touches `supabase/functions/generate-report/index.ts`. Verified 2026-04-25 against open PRs #102 (score) + #133 (NYPD CCRB) — neither touches the renderer.
>   - SUG #11: T4.1a adds `deno check supabase/functions/generate-report/index.ts` between npm build and tests.
>   - SUG #12: Heading is emitted as markdown `## Attorney Bar Record Check` (T2.2 + T2.4 reinforce).
>   - SUG #13: `last_seen_at` rendered as `YYYY-MM-DD` via `new Date(last_seen_at).toISOString().slice(0,10)`.
> - **Migration filename collision (2026-04-25 discovery):** PR #133 (NYPD CCRB depth) reserves `20260425a_*.sql` and `20260425b_*.sql`. v2.2 renumbers to `20260425c_attorney_discipline_rls.sql` + `20260425d_attorney_discipline_test_fixtures.sql` to leave merge order intact regardless of which branch lands first.
> - **Discoveries this session:**
>   - `.env.local` anon key is stale/invalid — returns 401 on every table including known-RLS-protected `cases`/`orders`. Cleanup task: refresh from Supabase Mgmt API. Documented in T4.6.
>   - Production IB renders inside Edge Function (`generate-report/index.ts:7322`), NOT `src/lib/intelligence-brief/render.ts` (dev/test only).
>   - Anchor pinning must be Deno-side; src/lib copy is import-orphaned.
>   - `evaluate-report` Edge Function entry point: `{ caseId: UUID }` body → fetches `cases.report_html` from DB → strips HTML → runs UPL+Psych on plain text via Anthropic API. Direct HTML POST is NOT supported. (`supabase/functions/evaluate-report/index.ts:381-407`.)
>   - `unaccent` extension: NOT yet enabled on this Supabase project (only `pg_trgm`, `pgcrypto`, `moddatetime`, `uuid-ossp` per migration audit). T0a enables it.
> - **Round 0 v3 (2026-04-25 late):** spec-critic passed on retry 1. Round 0 v3 swarm (code-reviewer + security-auditor + chris-dreyer, all opus, with prior-round-attempts blocks) returned 37 NEW findings: 10 CRITICAL, 17 WARNING, 10 SUGGESTION. NOT pristine.
> - **v2.3 (this revision)** applies fixes:
>   - **Code CRIT #1 (renderer-async)**: confirmed `renderIBReportHtml` at `generate-report/index.ts:7322` is sync. T2.4 REWRITTEN: build markdown in caller scope at `index.ts:5045-5046` BEFORE `renderIBReportHtml`, assign to `allOutputs["attorney-discipline"]`, add slot in sections array. Caller has natural access to `intake.state`, `phase2.attorney_name`, `supabaseUrl`, `supabaseKey`. Single fix resolves CRIT #1, CRIT #6 (jurisdiction not in scope), and WARN section_outputs persistence.
>   - **Code CRIT #2 (POST→GET)**: confirmed PostgREST treats POST on table URL as INSERT. T1.2 events fetch now uses GET matching `supabaseSelect()` pattern at index.ts:107.
>   - **Code CRIT #3 (eval_results path)**: confirmed `eval_results.teams.upl.failed` is the real shape (evaluate-report/index.ts:443-453 + 549-557). SC #12 + T3.1.2 corrected.
>   - **Code CRIT #4 (cases NOT NULL)**: confirmed migrations/00001_initial_schema.sql:202-204 require `order_id`, `email`, `tier`. T3.1.2 INSERT now includes all three.
>   - **Code CRIT #5 (operator_tasks dead code)**: confirmed evaluate-report uses Resend `sendEmail()` directly (line 463-481), no operator_tasks writes. T3.1.2 cleanup drops operator_tasks DELETE; gates Resend off via env in test.
>   - **Code CRIT #6**: resolved by CRIT #1 fix (caller-scope build).
>   - **Code CRIT #7 (unaccent schema)**: T0a now `CREATE EXTENSION ... WITH SCHEMA extensions`; `immutable_unaccent` body uses `extensions.unaccent('extensions.unaccent', $1)`; pre-flight assertion `SELECT extensions.unaccent('café')` returns `'cafe'` BEFORE index build.
>   - **Code CRIT #8 (Deno can't import BANNED_PHRASES_LIST)**: confirmed prompts.ts:15 imports `@/lib/tiers` Next.js alias. T3.3 RESHAPED: canonical lives at `supabase/functions/generate-report/lib/banned-phrases-list.ts` (Deno-readable, no aliases); prompts.ts re-exports it via relative path. Both runtimes import the same canonical file.
>   - **Sec CRIT #1 (XSS centralization)**: T2.3 adds `safeCell(v) = escapeMarkdownPipe(escapeHtml(String(v ?? '')))`; T2.4 + T2.2 require all defendant + scraper-sourced free-text values flow through it. T4.4b lint test greps `render-attorney-discipline.ts` for `${...}` interpolations not routing through safeCell/safeHttpUrl/formatShortDate.
>   - **Sec CRIT #2 (CV probe pollution)**: T3.1.2 now uses `e2e-attorney-discipline-${Date.now()}@example.com` (matches CV `e2e-%` allowlist), pre-sets `eval_results = {sentinel: true}` BEFORE evaluate-report invocation (so even if function 500s, row never matches `eval_results.is.null`), and adds `scripts/reap-attorney-discipline-fixtures.mjs` running at CI job end regardless of test exit.
>   - **17 WARNINGs** absorbed: anchor brittle (use `IB_SECTION_ANCHORS.YOUR_PLAN` + `BRADY_GIGLIO` constants pinned to literal H2 markdown forms), formatShortDate explicit null guard, mixed test runner directory (Deno tests pinned to specific files not dir glob), 'Not provided' added to garbage regex, T3.4 bidirectional parity, RPC `WHERE counted.n = 1` (server-side ambiguity policy + LIMIT 1), T4.6 add `pg_policies` zero-rows assertion, T0c race window documented, control-char regex extended to `  `, Resend gating in test env, review_reminder_sent=true on cases fixture, service-role key redact + artifact scrub + explicit `--allow-env` allowlist, common-name silent-no-match documented in cascade, jurisdiction guard ↔ fair-report memo coupling enforced via `FAIR_REPORT_MEMO_PATHS` map + lint, Dreyer no-match copy reframe (own the methodology), Dreyer disclaimer adds bar_number + pull date + "every CA IB" framing.
>   - **10 SUGGESTIONs** absorbed: bar_number URL encode, input-contract ordering rationale documented, 'should' word-boundary regex, FIXTURE-% defense-in-depth RLS deny policy NOW, RPC server-side ambiguity, FIXTURE-008 pipe edge case fixtures, structured no-match logging (no PII), Dreyer matched-multi-event neutral framing sentence, Dreyer indexed `/attorney/ca/...` URL pattern (deferred to Phase 1.1c follow-on, NOT v2 scope), Dreyer rehabilitation node (deferred to Phase 1.1d follow-on, NOT v2 scope).
> - **Round 0 v4 (2026-04-25 late):** spec-critic v2.3 PASSED first-shot (40/40 gradeable). Round 0 v4 swarm returned 16 new findings: 5 CRIT, 7 WARN, 4 SUG. Many were v3-fix-induced regressions. NOT pristine.
> - **v2.4 (this revision)** absorbs v4 CRITs + key WARNs:
>   - **Code CRIT #1 (orders.amount_cents)**: confirmed `orders` schema (00001_initial_schema.sql:877) has column `amount integer NOT NULL`, NOT `amount_cents`. T3.1.2 + SC #12 corrected to use `amount`.
>   - **Code CRIT #2 (tsconfig excludes supabase)**: confirmed `tsconfig.json:33` has `"exclude": ["node_modules", "supabase", ...]`. Re-export pattern in T3.3 broken. Fix: T3.2 Node test imports `BANNED_PHRASES_LIST` DIRECTLY from canonical Deno-side file via vitest's runtime resolver (no path alias, no compile-time TS resolution); prompts.ts re-export DROPPED. Vitest resolves runtime imports outside src/.
>   - **Code CRIT #3 (SC #11 anchor mismatch)**: confirmed prompt at `index.ts:7102` says `Output: ## Section 6` (no ': Your Plan' suffix). SC #11 v2.4 REWRITTEN to assert against `allOutputs` map keys + array index ordering BEFORE md2html runs (deterministic) instead of substring-grepping rendered HTML.
>   - **Sec CRIT #1 (sentinel eval_results bypass)**: confirmed `/api/deliver` reads `eval_results.gate_passed` and treats `undefined === false` as `false` → renders "PASSED" + allows delivery. Fix: sentinel changed to `'{"sentinel": true, "gate_passed": false}'` so any pre-evaluate-report state correctly blocks delivery; `gate_passed: true` only ever set by evaluate-report itself. Plus reaper runs `if: always()`.
>   - **Sec CRIT #2 (safeFetch redaction incomplete)**: redact regex extended to also match `apikey: [^\s,;]+` and `eyJhbGc[A-Za-z0-9._-]+` (JWT prefix anywhere) in addition to `Bearer [^\s"']+`.
>   - **Code WARN absorbed**: T1.4 + T4.2a explicit file lists now include `attorney-discipline-fair-report-paths.test.ts` + `attorney-discipline-common-name.test.ts` (v2.3 added them in worktree boundary but forgot to add to runner lists).
>   - **Code WARN (cite-tag-strip comment)**: T2.4 caller-scope INSERT POINT moved to BEFORE line 5037's strip loop so the comment is now accurate (`allOutputs['attorney-discipline']` is set BEFORE the cite-strip loop iterates `Object.keys(allOutputs)`).
>   - **Code WARN (U+0085 regex gap)**: T1.2 input contract regex extended to `/[\x00-\x1f  ]/`.
>   - **Code WARN (RPC permission status)**: SC #26 accepts `r.status === 401 || r.status === 403 || r.status === 404` (PostgREST returns 404 for missing-EXECUTE on RPC).
>   - **Dreyer WARN #1 (bar-lookup-url ambiguous)**: T2.2 matched-state copy now interpolates `BAR_LOOKUP_URLS.CA.detail(bar_number)` (deep link); T2.2 no-match uses `BAR_LOOKUP_URLS.CA.base` (generic search). SC #41 NEW asserts both URL patterns appear in the right states.
>   - **Dreyer WARN #2 (fair-report-memo no public route)**: NEW T2.6 — create public-facing route at `src/app/legal/fair-report-privilege/page.tsx` that renders the T0b memo body (sanitized for public). T2.2 disclaimer uses absolute URL `https://imnotanattorney.com/legal/fair-report-privilege`. SC #42 NEW asserts the route file exists + renders.
>   - **Code WARN (test_run_id rule compliance)**: per `~/.claude/rules/drafts/test-isolation.md`, T3.1.2 fixture writes are exempt via marker `// test-isolation-justified: e2e fixture uses CV-allowlisted email pattern + sentinel eval_results + reaper safety net; test_run_id column not present in cases/orders schema in this branch yet (test-isolation infra is on a separate worktree)`. Marker added to test files; hook accepts.
> - **Deferred to Phase 5 acceptance criteria** (documented in Out of Scope as known follow-ons, NOT silent drops):
>   - Code SUG (cleanup transactional): wrap DELETE-cases + DELETE-orders in single BEGIN/COMMIT block at execution time.
>   - Code SUG (SC #38 runtime verify): execution agent confirms migration apply success in addition to file-text grep.
>   - Code WARN (report_html construction): execution agent uses hand-crafted fixture HTML for the e2e UPL smoke (cheaper, isolates test scope to UPL gate, NOT producer fidelity); T2.4 caller-scope wiring is verified separately by SC #11 + #28 lint.
>   - Dreyer SUG (visual count callout): bold "{N} public discipline event(s) on file" prepended to attribution sentence at execution time.
>   - Dreyer SUG (DISCLAIMER 'CA' lint coupling): T4.5e adds at execution — Deno test asserts DISCLAIMER_VERBATIM hardcoded jurisdiction matches the SINGLE key in FAIR_REPORT_MEMO_PATHS.
> - **Phase 5 begins now.** Plan converged enough; remaining items are execution-time polish, not architectural.

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
- **T0a (RLS + unaccent + match RPC migration)** — Create `supabase/migrations/20260425c_attorney_discipline_rls.sql` (renumbered from `20260425a` to dodge collision with PR #133):
  ```sql
  -- 1. Enable RLS deny-by-default. service_role bypasses RLS; no SELECT policy = no anon access.
  ALTER TABLE public.attorneys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attorney_discipline_events ENABLE ROW LEVEL SECURITY;

  -- 2. Enable unaccent for Unicode-folded matching (José ↔ Jose ↔ JOSÉ).
  --    Pin schema to `extensions` per Supabase convention (existing extensions
  --    pg_trgm / pgcrypto / moddatetime / uuid-ossp all live there per
  --    migrations/00001_initial_schema.sql:14-16). Without WITH SCHEMA, install
  --    location varies across Supabase versions and the immutable_unaccent
  --    wrapper below would fail with `dictionary "..." does not exist` at
  --    index-build time.
  CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

  -- 2a. Pre-flight smoke (Code CRIT #7 + Sec WARN). MUST succeed BEFORE the
  --     index in step 3 fires the wrapper for the first time. If this fails,
  --     the migration aborts and step 3 never runs.
  DO $$
  DECLARE folded text;
  BEGIN
    SELECT extensions.unaccent('extensions.unaccent', 'café') INTO folded;
    IF folded <> 'cafe' THEN
      RAISE EXCEPTION 'unaccent dictionary lookup failed: got % (expected ''cafe'')', folded;
    END IF;
  END $$;

  -- 3. Functional index supports the case-folded + accent-folded equality lookup.
  --    IMMUTABLE wrapper required because unaccent() is STABLE not IMMUTABLE by default,
  --    and CREATE INDEX rejects non-IMMUTABLE expressions.
  --    Body references the dictionary as `'extensions.unaccent'` (regdictionary
  --    is schema-resolved at parse time; pinning the FQN is required because
  --    SET search_path inside the function body cannot retroactively rebind a
  --    regdictionary literal).
  CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
    $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

  CREATE INDEX IF NOT EXISTS idx_attorneys_jurisdiction_lower_unaccent_full_name
    ON public.attorneys (jurisdiction, LOWER(public.immutable_unaccent(full_name)));

  -- 3a. Future-proof RLS deny policies for FIXTURE-* rows (Sec SUG defense-in-depth).
  --     These are no-ops today (RLS is already deny-by-default with no SELECT
  --     policy) but stay in place if a future migration accidentally adds a
  --     permissive `FOR SELECT TO anon USING (true)` policy. Postgres ANDs
  --     policies, so this overlay survives accidentally-permissive additions.
  CREATE POLICY deny_anon_test_fixtures_attorneys
    ON public.attorneys FOR SELECT TO anon
    USING (bar_number NOT LIKE 'FIXTURE-%');
  CREATE POLICY deny_anon_test_fixtures_events
    ON public.attorney_discipline_events FOR SELECT TO anon
    USING (NOT EXISTS (
      SELECT 1 FROM public.attorneys a
      WHERE a.id = attorney_discipline_events.attorney_id
        AND a.bar_number LIKE 'FIXTURE-%'
    ));

  -- 4. RPC for the match path. Returns the matched attorney row + their discipline events.
  --    SECURITY DEFINER so the RPC runs as table owner (bypasses caller's RLS posture
  --    consistently); explicit grant restricts who can CALL it.
  CREATE OR REPLACE FUNCTION public.match_attorney(p_name text, p_jurisdiction text)
  RETURNS TABLE (
    attorney_id BIGINT,
    bar_number TEXT,
    full_name TEXT,
    admission_date DATE,
    current_status TEXT,
    last_seen_at TIMESTAMPTZ,
    match_count INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, extensions
  AS $$
    WITH candidates AS (
      SELECT id, bar_number, full_name, admission_date, current_status, last_seen_at
      FROM public.attorneys
      WHERE jurisdiction = p_jurisdiction
        AND LOWER(public.immutable_unaccent(full_name))
            = LOWER(public.immutable_unaccent(p_name))
    ),
    counted AS (SELECT COUNT(*)::int AS n FROM candidates)
    -- Server-side ambiguity policy (Code SUG + Sec): when match_count > 1,
    -- return ZERO rows. Caller now treats zero-rows uniformly as no-match
    -- regardless of cause (no candidate vs ambiguous), eliminating the
    -- comment-only "policy" that future callers would skip.
    SELECT c.id, c.bar_number, c.full_name, c.admission_date,
           c.current_status, c.last_seen_at, counted.n
    FROM candidates c CROSS JOIN counted
    WHERE counted.n = 1
    LIMIT 1;
  $$;

  REVOKE ALL ON FUNCTION public.match_attorney(text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.match_attorney(text, text) TO service_role;
  ```
  Apply via Supabase Management API. Verify post-apply: (a) `relrowsecurity=t` on both tables, (b) anon SELECT returns `200 + []` (NOT 401 — RLS-blocked-anon = empty), (c) service-role `POST /rest/v1/rpc/match_attorney` with body `{"p_name":"José Smith","p_jurisdiction":"CA"}` returns rows when accent variant exists.
- **T0b (fair-report memo)** — Write `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` documenting CA Civ. Code § 47 coverage of accurate republication of CA State Bar discipline records inside our reports. Cite source: triangulated .01% media/defamation expert OR cached `~/.claude/experts/eugene-volokh.md` (TBD-triangulate if uncached). Reference memo path in section footer disclaimer (T2.3).
- **T0c (sibling-PR pre-flight)** — Run `gh pr list --repo rahim0kapadia/ImNotAnAttorney-web --state open --json number,headRefName,files --limit 50` immediately BEFORE creating the worktree. Parse `files[].path` for any open PR. Abort with named conflict if ANY open PR's `files[]` contains:
  - `supabase/functions/generate-report/index.ts` (the production renderer wired by T2.4 — sibling edits would silent-merge-conflict)
  - `src/lib/intelligence-brief/prompts.ts` (re-exporting `BANNED_PHRASES_LIST` per T3.3)
  - `src/lib/intelligence-brief/render.ts` (parallel dev mirror per T2.4 optional)
  - `supabase/functions/generate-report/lib/banned-phrases-list.ts` (canonical T3.3 file, NEW v2.3)
  - `supabase/migrations/20260425c_*.sql` or `supabase/migrations/20260425d_*.sql` (rename higher if taken)
  Verified 2026-04-25 baseline: PR #102 (score) and PR #133 (NYPD CCRB depth) — neither touches the five blocking paths above. Re-run this check immediately before `git worktree add` to catch new sibling PRs opened between plan ship and execution.

  **Race window (Code WARN #18)**: between `gh pr list` returning clean and `git worktree add` running, another session may open a PR. Mitigation: (a) wrap pre-flight + worktree-add in a single shell block running `gh pr list` → save JSON → `git worktree add` immediately (one operator action), (b) AFTER `git worktree add` completes, re-run pre-flight; if a new sibling PR appeared touching any blocking path, abort the worktree (`git worktree remove`) and surface to user. The artifact required by SC #25 is the BEFORE-worktree pre-flight JSON; SC #25b (NEW v2.3) requires an AFTER-worktree pre-flight JSON proving the post-creation race window held clean.

### T1 — DB layer (CA-only, exact match)
- **T1.1** — Schema confirmed (per `supabase/migrations/20260422e_attorney_discipline.sql`):
  - `attorneys`: `(id BIGSERIAL, jurisdiction CHAR(2), bar_number TEXT, full_name TEXT, first_name TEXT, last_name TEXT, admission_date DATE, current_status TEXT, last_seen_at TIMESTAMPTZ, ...)`. UNIQUE `(jurisdiction, bar_number)`.
  - `attorney_discipline_events`: `(id BIGSERIAL, attorney_id BIGINT FK→attorneys, jurisdiction CHAR(2), bar_number TEXT, full_name TEXT, order_date DATE, effective_date DATE, discipline_type TEXT, discipline_raw TEXT, violation_summary TEXT, order_url TEXT, source_url TEXT, scraped_at TIMESTAMPTZ)`. UNIQUE `(jurisdiction, bar_number, order_date, discipline_type)`.
  - Note: there is NO column called `date`/`type`/`outcome`. Render template (T2.2) MUST use the literal column names: `order_date`, `discipline_type`, `violation_summary` (or `discipline_raw` as fallback for human-readable type), `order_url` (preferred for the bar-document link) with fallback to `source_url`. (Sec v2 CRIT #2.)
- **T1.2** — Write Deno-compatible query helper at `supabase/functions/generate-report/lib/attorney-discipline.ts` (Deno-side, not src/lib) using raw `fetch` to PostgREST matching the `supabaseSelect()` pattern at `generate-report/index.ts:107`. Signature: `getAttorneyDiscipline(attorneyName: string, jurisdiction: string): Promise<{ attorney: AttorneyRow | null, events: DisciplineEvent[], status: 'matched' | 'no-match' }>`.
  - **Jurisdiction guard via FAIR_REPORT_MEMO_PATHS map** (v2.3 — supersedes hard-coded `=== 'CA'`): see Match strategy below.
  - **Input contract** (v2.3: ordering rationale documented + Unicode line separators + 'Not provided' added):
    1. `trim()` whitespace.
    2. **Reject all control chars + Unicode line/paragraph separators** (one regex, no redundant step): `/[\x00-\x1f  ]/` → return `no-match`. Single regex replaces the prior split. Regex content (v2.4 explicit codepoints): control chars `\x00-\x1f` AND `` (NEXT LINE — codepoint 0x85, OUTSIDE the `\x00-\x1f` range) AND ` ` (LINE SEPARATOR) AND ` ` (PARAGRAPH SEPARATOR). Code WARN v4: prior v2.3 regex had U+2028+U+2029 as literals but missed U+0085; v2.4 explicit codepoint enumeration closes the audit-log injection class fully.
    3. Cap 200 chars (BEFORE garbage-name guard — see ordering note below).
    4. Empty after sanitization → `no-match`.
    5. Garbage-name guard via `isAttorneyNameRenderable()` (T2.3 helper, exported, single source of truth for both T1.2 entry and T2.4 renderer): predicate returns false (caller returns `no-match`) for empty / whitespace-only / `length<3` / no internal space (single-token like `'Smith'`) / matches `/^(n\/?a|none|tbd|unknown|skip|pending|asdf|test|not[ -]?provided)$/i` (note: `not[ -]?provided` catches the renderer's `'Not provided'` fallback at index.ts:5174 — Code WARN #14).
  - **Ordering rationale (Code SUG)**: cap (step 3) deliberately runs BEFORE garbage-regex (step 5) because the regex is `^...$`-anchored and a 300-char `'A'.repeat(300)` is still single-token after trim (no spaces) so it falls into the no-space branch and returns `no-match` regardless of cap-vs-regex order. The cap is purely a defense-in-depth bound on payload size for downstream JSON serialization. SC #20 covers `'A'.repeat(300)` to verify ordering invariance.
  - **Match strategy** (v2.3 corrected verbs + jurisdiction-memo coupling):
    - Step A: `POST ${SUPABASE_URL}/rest/v1/rpc/match_attorney` (POST is correct for RPC) with `Authorization: Bearer ${service_role_key}` + `apikey: ${service_role_key}` headers and JSON body `{"p_name": <sanitized name>, "p_jurisdiction": "CA"}`. Response: array of rows. 0 rows = no candidate OR ambiguous (RPC enforces n=1 server-side); branch identical: `{ attorney: null, events: [], status: 'no-match' }`.
    - Step B: 1 row returned → fetch discipline events via **GET** (not POST — POST against a table URL is INSERT, not SELECT, per Code CRIT #2): `GET ${SUPABASE_URL}/rest/v1/attorney_discipline_events?attorney_id=eq.${row.attorney_id}&order=order_date.desc.nullslast` matching the `supabaseSelect()` pattern at `generate-report/index.ts:107`. Return `{ attorney: row, events, status: 'matched' }`.
  - **Why RPC, not raw `?ilike=`**: PostgREST cannot apply `LOWER(unaccent(...))` in a query-string `WHERE`. RPC moves the predicate into SQL where the functional index is usable. Side benefit: removes the wildcard-injection class entirely (`p_name` is a parameterized text arg, not a URL substring).
  - **Jurisdiction–fair-report-memo coupling (Sec WARN)**: helper imports a `FAIR_REPORT_MEMO_PATHS` map from `attorney-discipline.ts`:
    ```ts
    export const FAIR_REPORT_MEMO_PATHS: Record<string, string> = {
      CA: 'docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md',
    };
    ```
    The jurisdiction guard is replaced with `if (!FAIR_REPORT_MEMO_PATHS[jurisdiction]) return { attorney: null, events: [], status: 'no-match' };`. Adding a new state to the allowlist requires creating its memo path entry in the SAME edit. Lint test (T4.5c) parses the file and asserts every key in `BAR_LOOKUP_URLS` (T2.3) has a matching key in `FAIR_REPORT_MEMO_PATHS`.
  - **Structured no-match logging (Sec SUG)**: every silent no-match decision logs one structured JSON line to console (no PII):
    ```ts
    console.log(JSON.stringify({
      component: 'attorney-discipline',
      reason: 'jurisdiction-guard' | 'control-chars' | 'garbage-name'
            | 'rpc-status-non-200' | 'rpc-error' | 'no-rows',
      jurisdiction, name_length: name?.length ?? 0,
    }));
    ```
    Edge Function logs are queryable in Supabase dashboard. Closes the silent-product-regression visibility gap.
- **T1.3** — Synthetic test fixtures: create `supabase/migrations/20260425d_attorney_discipline_test_fixtures.sql` (renumbered from `20260425b` to dodge PR #133 collision) inserting all 7 fixture attorneys + their events using actual schema column names (`order_date`, `discipline_type`, `violation_summary`, `discipline_raw`, `order_url`, `source_url`):
  ```sql
  INSERT INTO public.attorneys
    (jurisdiction, bar_number, full_name, first_name, last_name, admission_date, current_status, last_seen_at)
  VALUES
    ('CA', 'FIXTURE-001', 'Fixture Cleanrecord',  'Fixture', 'Cleanrecord',  '2010-01-15', 'active',     '2026-04-25 00:00:00+00'),
    ('CA', 'FIXTURE-002', 'Fixture Disciplined',  'Fixture', 'Disciplined',  '2005-06-20', 'suspended',  '2026-04-25 00:00:00+00'),
    ('CA', 'FIXTURE-003', 'Fixture Cleanrecord',  'Fixture', 'Cleanrecord',  '2012-08-10', 'active',     '2026-04-25 00:00:00+00'),  -- ambiguous duplicate of -001 (same full_name)
    ('CA', 'FIXTURE-004', 'Fixture Hostile',      'Fixture', 'Hostile',      '2008-04-01', 'suspended',  '2026-04-25 00:00:00+00'),
    ('CA', 'FIXTURE-005', 'Fixture Pipechar',     'Fixture', 'Pipechar',     '2008-04-01', 'suspended',  '2026-04-25 00:00:00+00'),
    ('CA', 'FIXTURE-006', 'José García',          'José',    'García',       '2014-09-01', 'active',     '2026-04-25 00:00:00+00'),  -- accented (T4.5a forward direction)
    ('CA', 'FIXTURE-007', 'Jose Garcia',          'Jose',    'Garcia',       '2014-09-01', 'active',     '2026-04-25 00:00:00+00'),  -- ASCII (T4.5a reverse direction)
    ('CA', 'FIXTURE-008', 'Fixture Pipeedge',     'Fixture', 'Pipeedge',     '2008-04-01', 'suspended',  '2026-04-25 00:00:00+00');  -- pipe-edge case fixture (Sec SUG)

  -- DISCIPLINED multi-event (FIXTURE-002, count = 2)
  INSERT INTO public.attorney_discipline_events
    (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, violation_summary, discipline_raw, order_url, source_url)
  SELECT id, 'CA', bar_number, full_name, '2018-03-12'::date, 'Suspension', '90-day suspension stayed pending probation', '90-day suspension stayed', 'https://example.com/fixture-002-order-1', 'https://example.com/fixture-002-source-1'
    FROM public.attorneys WHERE bar_number = 'FIXTURE-002';
  INSERT INTO public.attorney_discipline_events
    (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, violation_summary, discipline_raw, order_url, source_url)
  SELECT id, 'CA', bar_number, full_name, '2020-11-04'::date, 'Reproval', 'Failure to communicate with client', 'public reproval', 'https://example.com/fixture-002-order-2', 'https://example.com/fixture-002-source-2'
    FROM public.attorneys WHERE bar_number = 'FIXTURE-002';

  -- HOSTILE-INPUT (FIXTURE-004, single event, XSS payloads embedded so render-time escaping is testable end-to-end)
  INSERT INTO public.attorney_discipline_events
    (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, violation_summary, discipline_raw, order_url, source_url)
  SELECT id, 'CA', bar_number, full_name, '2019-07-22'::date, '<script>alert(1)</script>', 'Failure & misappropriation <evil>', 'misappropriation', 'javascript:alert(1)', 'https://example.com/fixture-004-source'
    FROM public.attorneys WHERE bar_number = 'FIXTURE-004';

  -- PIPE-CHAR (FIXTURE-005, raw markdown-pipe in cell values — covers escapeMarkdownPipe path)
  INSERT INTO public.attorney_discipline_events
    (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, violation_summary, discipline_raw, order_url, source_url)
  SELECT id, 'CA', bar_number, full_name, '2017-02-08'::date, 'Suspension | 90 days', 'Failure to file | client funds | trust account', '90-day suspension', 'https://example.com/fixture-005-order', 'https://example.com/fixture-005-source'
    FROM public.attorneys WHERE bar_number = 'FIXTURE-005';

  -- PIPE-EDGE (FIXTURE-008, multiple consecutive pipes + literal backslash-pipe — Sec SUG)
  INSERT INTO public.attorney_discipline_events
    (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, violation_summary, discipline_raw, order_url, source_url)
  SELECT id, 'CA', bar_number, full_name, '2016-05-15'::date, '\|', '|||', 'edge case', 'https://example.com/fixture-008-order', 'https://example.com/fixture-008-source'
    FROM public.attorneys WHERE bar_number = 'FIXTURE-008';
  ```
  Test-only marker: bar_numbers all start with `FIXTURE-`. T0a's `deny_anon_test_fixtures_*` policies (added v2.3) keep them invisible to anon SELECT even if a future migration adds a permissive policy.
- **T1.4** — Deno unit tests at `supabase/functions/generate-report/__tests__/attorney-discipline.test.ts`. **Pinned runner + explicit file list** (Code WARN #4 + WARN #13):
  ```
  deno test \
    --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY,ANTHROPIC_API_KEY,RESEND_API_KEY \
    --allow-net=jxjbjmgdukwkoclydqdr.supabase.co,api.anthropic.com \
    supabase/functions/generate-report/__tests__/attorney-discipline.test.ts \
    supabase/functions/generate-report/__tests__/upl-regex-panel.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-guard.test.ts \
    supabase/functions/generate-report/__tests__/render-attorney-discipline-lint.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-fair-report-paths.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-common-name.test.ts \
    supabase/functions/__tests__/rls-attorney-discipline.test.ts
  ```
  Specific file list (NOT directory glob) avoids collision with the existing vitest test at `supabase/functions/generate-report/__tests__/no-mandatory-min-fallback.test.ts` which `import { describe, it, expect } from 'vitest'` and would fail under Deno. Explicit `--allow-env` allowlist (Sec WARN service-role key leak) makes the secret surface auditable; `--allow-net` allowlist pins the only two outbound hosts the tests need. The Node-side `BANNED_PHRASES_LIST` parity test in T3.2 is a SEPARATE Node-side vitest under `src/lib/intelligence-brief/__tests__/`.

  **Test coverage** (each as own `Deno.test()` block):
  - matched-clean (`FIXTURE_CLEAN_BAR_NUMBER`)
  - matched-disciplined-multi-event (`FIXTURE_DISCIPLINED_BAR_NUMBER`)
  - no-match (`'Zzzzz Nonexistent'`)
  - ambiguous (RPC server-side now returns 0 rows when n>1 per T0a `WHERE counted.n = 1`; test verifies behavior matches `no-match` shape; no fetch to events endpoint occurs)
  - garbage-name skip 8-input matrix (per SC #20)
  - control-character input (`"\r\nSmith"`, `" John"`, `"Doe"`)
  - 300-char input (`'A'.repeat(300)` — SC #20 cap-vs-regex ordering invariance)
  - unaccent forward (`'Jose Garcia'` returns FIXTURE-006 with `full_name='José García'`)
  - unaccent reverse (`'José García'` returns FIXTURE-007 with `full_name='Jose Garcia'`)
  - jurisdiction guard (`getAttorneyDiscipline('Anyone', 'NY')` returns no-match without ANY fetch)
  - injection input (`"' OR 1=1 --"` returns no-match without error)

  Mock `fetch` via test-scoped `globalThis.fetch` override; assert exact request URL (HTTP verb included — GET vs POST per Code CRIT #2), body shape, and that no fetch is made when garbage-name guard or jurisdiction guard fires (`fetch.mock.calls.length === 0`).

  **Failure-message redaction (Sec WARN service-role key leak)**: the test file's top-level `safeFetch` wrapper redacts `Bearer [^\s"']+` patterns from any thrown error. Pattern:
  ```ts
  const REDACT_PATTERNS: Array<[RegExp, string]> = [
    [/Bearer [^\s"',;]+/g, 'Bearer [REDACTED]'],
    [/apikey[:=][\s]*[^\s,;}\)"']+/gi, 'apikey: [REDACTED]'],
    [/eyJhbGc[A-Za-z0-9._-]+/g, '[REDACTED-JWT]'],
  ];
  const redact = (s: string): string =>
    REDACT_PATTERNS.reduce((acc, [re, sub]) => acc.replace(re, sub), s);
  const safeFetch = async (url: string, init?: RequestInit) => {
    try { return await fetch(url, init); }
    catch (e) {
      if (e instanceof Error) e.message = redact(e.message);
      throw e;
    }
  };
  ```
  v2.4 fix per Sec CRIT #2: redact extended beyond just `Bearer` to also catch `apikey:` header form (PostgREST sends both `Authorization: Bearer ...` AND `apikey: ...` with the service-role key — only redacting one was insufficient) AND any JWT-prefix substring (`eyJhbGc`) wherever it appears. Used for all real-network calls.

### T2 — IB section (mechanical render only)
- **T2.1** — New file: `supabase/functions/generate-report/lib/section-anchors.ts` (Deno-side, NOT `src/lib/...` — Code v2 CRIT #2: src/lib is import-orphaned in Deno runtime). Export `IB_SECTION_ANCHORS = { ... }` with literal H2 heading strings used by the production IB renderer at `supabase/functions/generate-report/index.ts:7322` (`renderIBReportHtml`, sections array at lines 7429-7450). Read existing strings from `index.ts:7429-7450` and from each `buildXxx()` static appendix builder, pin them here. The Edge Function renderer + Deno-side tests both import from this file. Optional parallel mirror at `src/lib/intelligence-brief/section-anchors.ts` for Node-side dev tools (`scripts/test-ib-pipeline.ts`, `render-ib-test.mjs`) with a parity test (mirror pattern from `src/lib/report/__tests__/whitelist-parity.test.ts`).
- **T2.2** — New section builder in `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (Deno-side, factual mechanical render). Inputs: result of T1.2. Outputs: markdown string (NOT raw HTML — see T2.3a). Heading is always `## Attorney Bar Record Check` (markdown, SUG #12).

  **`last_seen_at` format (SUG #13):** render as short date `YYYY-MM-DD`, never raw timestamptz. Helper: `formatShortDate(ts: string | null): string` returning `new Date(ts).toISOString().slice(0,10)` or `'unknown'` for null. Applied wherever the spec below says `{last_seen_at}`.

  **`admission_date` years-of-practice:** compute via `Math.floor((Date.now() - admission_date) / (365.25 * 24 * 60 * 60 * 1000))` and display as integer.

  **Disclaimer (Atti voice + UPL-safe + methodology proof, Dreyer WARN #2 v3 + WARN #1 v4 disambiguation):**
  `DISCLAIMER_VERBATIM` is built per-call (NOT a single constant) because it interpolates `bar_number` + pull date. The disclaimer template lives at `attorney-discipline-disclaimer.ts`:
  ```ts
  export const buildDisclaimer = (barNumber: string, pullDate: string): string =>
    `CA State Bar #${barNumber} — pulled from the official State Bar discipline registry on ${pullDate}. Public record. You can pull it yourself at ${BAR_LOOKUP_URLS.CA.detail(barNumber)}; we pulled it as part of every CA Intelligence Brief.`;
  export const DISCLAIMER_TEMPLATE_VERBATIM = `CA State Bar #{bar_number} — pulled from the official State Bar discipline registry on {pull_date}. Public record. You can pull it yourself at {bar_lookup_detail_url}; we pulled it as part of every CA Intelligence Brief.`;
  ```
  v2.4 fix per Dreyer WARN #1: matched-state interpolations explicitly use `BAR_LOOKUP_URLS.CA.detail(bar_number)` (deep link to that licensee — preserves "we pulled it" methodology proof). The DISCLAIMER_TEMPLATE_VERBATIM string with placeholders is what T3.2 + T3.4 BANNED_PHRASES tests assert against (substituted-out form would have variable bar numbers, breaking deterministic comparison).

  States:
  - **`matched` + `current_status='active'` + `events.length === 0`:**
    ```
    ## Attorney Bar Record Check

    **Status (per CA State Bar as of {safeCell(last_seen_at-date)}):** Active
    **Licensed in CA since {safeCell(YYYY)}** — {N} years of practice
    **Public discipline record:** none on file.

    {DISCLAIMER_VERBATIM}

    [Why we can show this](https://imnotanattorney.com/legal/fair-report-privilege)
    ```
  - **`matched` + `events.length >= 1`:**
    ```
    ## Attorney Bar Record Check

    **Status (per CA State Bar as of {safeCell(last_seen_at-date)}):** {safeCell(current_status)}
    **Licensed in CA since {safeCell(YYYY)}** — {N} years of practice

    The CA State Bar's public registry lists {events.length} discipline event(s) on this licensee's record:

    | Date | Type | Summary | Source |
    |------|------|---------|--------|
    | {safeCell(formatShortDate(order_date))} | {safeCell(discipline_type)} | {safeCell(violation_summary \|\| discipline_raw)} | [CA Bar order]({safeHttpUrl(order_url \|\| source_url)}) |

    {DISCLAIMER_VERBATIM}

    [Why we can show this](https://imnotanattorney.com/legal/fair-report-privilege)
    ```
    Column-name source per T1.1: `order_date`, `discipline_type`, `violation_summary` (fallback to `discipline_raw`), `order_url` (fallback to `source_url`). EVERY interpolation MUST flow through one of: `safeCell()` (free text), `safeHttpUrl()` (URLs), `formatShortDate()` (dates), or be a literal/structural template piece. The neutral framing sentence "The CA State Bar's public registry lists..." (Dreyer SUG) attributes the data to the State Bar's registry rather than INAA's editorial choice — keeps the section pro-defendant-not-anti-attorney.
  - **`no-match` (RPC returned 0 rows: includes ambiguous-match collapsed server-side):**
    ```
    ## Attorney Bar Record Check

    No exact match for "{safeCell(attorney_name)}" in the California State Bar's public roster.

    We only render bar records on exact name match — fuzzy matching against an attorney's identity is how false accusations happen, and we don't ship that. If the spelling on the State Bar's roster differs from what was entered (initials, hyphenation, married name), the lookup link below resolves it in one click.

    [California State Bar attorney lookup →]({BAR_LOOKUP_URLS.CA.base})
    ```
    No-match copy (Dreyer WARN #1 v3) reframes the limitation as INAA's deliberate methodology, NOT a user error. Removes "verify spelling and bar admission state" (burden-shifting per brand-voice.md DO-NOT list). Uses `bar-lookup-base-url` (no bar_number — defendant doesn't know it).
- **T2.3** — Helpers in the Deno-side `render-attorney-discipline.ts` file (Deno cannot import from `src/lib/intelligence-brief/render.ts` which imports from `../email`):
  - `escapeHtml(s: string): string` — 5-line, covers `& < > " '`
  - `safeHttpUrl(u: string | null | undefined): string` — explicit null guard FIRST: `if (!u) return '#'`; then return `u` if matches `/^https?:\/\//i` else `'#'`
  - `escapeMarkdownPipe(s: string): string` — `s.replace(/\|/g, '\\|')` (Code WARN #6)
  - `formatShortDate(ts: string | null | undefined): string` — **explicit null/undefined guard FIRST** (Code WARN #11): `if (!ts) return 'unknown'; const d = new Date(ts); if (isNaN(d.getTime())) return 'unknown'; return d.toISOString().slice(0,10);`. Closes the silent `1970-01-01` leak from `new Date(null) || ...`.
  - `safeCell(v: string | null | undefined): string` — **canonical interpolation gate (Sec CRIT #1)**: `escapeMarkdownPipe(escapeHtml(String(v ?? '')))`. EVERY defendant-supplied AND scraper-fed free-text value in the rendered output flows through this single helper. Lint test (T4.4b) regex-greps `render-attorney-discipline.ts` for any `${...}` inside a markdown table cell or copy block that does NOT route through `safeCell` / `safeHttpUrl` / `formatShortDate` and fails the build.
  - `isAttorneyNameRenderable(name: string | null | undefined): boolean` — predicate (Code WARN #9 + #14): returns false for `null` / `undefined` / empty after trim / `length<3` / no internal space (single-token) / matches `/^(n\/?a|none|tbd|unknown|skip|pending|asdf|test|not[ -]?provided)$/i` (the `not[ -]?provided` clause catches the renderer's `'Not provided'` fallback at index.ts:5174). Single source of truth — T1.2 helper guard + T2.4 caller-scope guard both import.
  - `BAR_LOOKUP_URLS: Record<string, { base: string; detail: (barNumber: string) => string }>` — typed structure with URL-encoded detail builder:
    ```ts
    export const BAR_LOOKUP_URLS = {
      CA: {
        base: 'https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch',
        detail: (barNumber: string) => `https://apps.calbar.ca.gov/attorney/Licensee/Detail/${encodeURIComponent(barNumber)}`,
      },
    } as const;
    ```
    `encodeURIComponent` (Code SUG) prevents URL-injection if a future state's bar numbers contain `+`, `&`, or spaces. CA's numeric bar numbers don't need it today — defense-in-depth.
  - `FAIR_REPORT_MEMO_PATHS: Record<string, string>` (Sec WARN coupling): single map binding jurisdiction code to its memo path. Adding a new key requires the same edit to also write the memo file (or the lint at T4.5c fails).
  - `BANNED_PHRASES_LIST` (re-exported): see T3.3 — canonical lives at `supabase/functions/generate-report/lib/banned-phrases-list.ts`; this file re-exports for convenient single-import in tests.
  - **'should' word-boundary handling (Code SUG)**: BANNED_PHRASES_LIST contains literal `'should'` for substring match. Today's `DISCLAIMER_VERBATIM` does NOT contain 'shoulder' / 'shouldered' / 'should\'ve'. To future-proof, T3.2 test wraps each phrase ending with `should` (or starting with `should`) in regex form `\bshould\b` for the assertion: `if (phrase === 'should') new RegExp('\\bshould\\b', 'i').test(disclaimer) === false; else disclaimer.toLowerCase().includes(phrase.toLowerCase()) === false`. Surfaces only the exception in code, not in the BANNED_PHRASES_LIST data.

  EVERY interpolation in T2.2 routes through one of the helpers above. Lint test enforces.
- **T2.3a** — Section builder MUST emit **markdown**, not raw HTML — the `md2html` pass at `supabase/functions/generate-report/index.ts:7450` (`.map((s) => md2html(s))`) and its `|`-pipe regex would shred a pre-built `<tr>` block. Output the markdown table per T2.2 (column headers `Date | Type | Summary | Source`, using actual schema column names `order_date / discipline_type / violation_summary || discipline_raw / order_url || source_url` per T1.1). Cell-value pipeline (per T2.2): every free-text scraped value flows through `escapeMarkdownPipe(escapeHtml(v))` BEFORE markdown render. `escapeHtml` runs first to neutralize `< > & " '` from CA Bar HTML; `escapeMarkdownPipe` runs second to neutralize raw `|` characters that would shred the table column count. Order: html-escape THEN pipe-escape so `escapeHtml` does not later double-escape `\|`. (Dreyer v2 WARN #1 + Code v2 WARN #6.)
- **T2.4 (REWRITTEN v2.3 — caller-scope wiring per Code CRIT #1 + #6 + WARN section_outputs)** — `renderIBReportHtml` at `supabase/functions/generate-report/index.ts:7322` is **synchronous** (`function renderIBReportHtml(...)`, NOT `async function`). Adding `await` inside the sections array fails compilation. The renderer also takes only `(sectionOutputs, meta)` — no `jurisdiction`, no `supabaseUrl`, no `supabaseKey` are in scope. Wire the section in **caller scope** at `index.ts:5045-5046` instead, BEFORE `renderIBReportHtml` is called. This single move resolves CRIT #1, CRIT #6, AND the WARN about section_outputs JSONB persistence.

  **Caller-scope build (insert at line 5036, BEFORE the cite-strip loop at lines 5037-5039):** v2.4 fix per Code WARN — placing the build BEFORE the `for (const key of Object.keys(allOutputs)) { ... stripInvalidCiteTags(...) }` loop means `attorney-discipline` IS iterated by the strip loop (the comment about cite-tag alignment is now true; mechanically harmless since the section has no `<cite>` tags but the load-bearing claim is no longer false).
  ```ts
  // Phase B: build attorney-discipline section (mechanical render, no LLM, fail-open empty).
  // Lives in allOutputs so it persists to cases.section_outputs JSONB (audit trail)
  // and gets cite-tag-stripped through the same loop as Claude-authored sections.
  const attorneyDisciplineMd = await buildAttorneyDisciplineSection({
    attorneyName: phase2.attorney_name,
    jurisdiction: intake.state || '',
    supabaseUrl,
    serviceRoleKey: supabaseKey,
  });
  if (attorneyDisciplineMd) {
    allOutputs['attorney-discipline'] = attorneyDisciplineMd;
  }
  ```

  **Section slot (add to sections array at line 7438, BETWEEN `sectionOutputs["your-plan"]` and `buildBradyGiglioChecklist()`):**
  ```ts
  sectionOutputs["your-plan"] || "",
  sectionOutputs["attorney-discipline"] || "",  // NEW v2.3 slot
  buildBradyGiglioChecklist(),
  ```
  The renderer stays sync — the slot just reads from `sectionOutputs` like every sibling. Empty-string filtering at line 7450 (`.filter((s) => s.trim())`) drops the slot cleanly when guard-skipped.

  **`buildAttorneyDisciplineSection()` signature (Deno-side, in `lib/render-attorney-discipline.ts`):**
  ```ts
  export async function buildAttorneyDisciplineSection(args: {
    attorneyName: string | null | undefined;
    jurisdiction: string;
    supabaseUrl: string;
    serviceRoleKey: string;
  }): Promise<string>;
  ```
  Returns `''` (empty) for guard-skip OR no-match-with-no-section-render-decision (currently always renders no-match copy on real no-match per T2.2; only returns `''` on guard skips for cleanest behavior).

  **Caller-scope guards (in order, FAIL-FAST returns empty string from helper):**
  1. `if (!isAttorneyNameRenderable(args.attorneyName)) return '';` — garbage-name skip (Code WARN #9). Skips the whole section if defendant didn't enter a real attorney name OR the renderer fallback `'Not provided'` is in play.
  2. `if (!FAIR_REPORT_MEMO_PATHS[args.jurisdiction]) return '';` — jurisdiction-memo coupling guard (Sec WARN). Adding a new state requires writing both a `BAR_LOOKUP_URLS` entry AND a `FAIR_REPORT_MEMO_PATHS` entry; the lint at T4.5c enforces co-modification.

  Both guards run in the helper itself (caller scope) BEFORE any DB call; T1.2's `getAttorneyDiscipline` re-applies them as defense-in-depth (so future direct callers also benefit).

  **Heading + md2html flow:** the helper returns markdown starting `## Attorney Bar Record Check` per T2.2; that string sits in `allOutputs['attorney-discipline']` until line 7450's `.map((s) => md2html(s))` converts it (same path as Claude-authored sections). SC #24 asserts the pre-md2html string starts with `## Attorney Bar Record Check\n`.

  **Optional parallel edit** to `src/lib/intelligence-brief/render.ts` for dev-tool parity (only if `scripts/test-ib-pipeline.ts` or `render-ib-test.mjs` need it; not blocking — production path is the Edge Function).
- **T2.5** — Skip Case Decoder integration (deferred to Phase 1.1b). v2 = IB-only.
- **T2.6 (NEW v2.4 per Dreyer WARN #2)** — Create public-facing route at `src/app/legal/fair-report-privilege/page.tsx` (Next.js Server Component) rendering the T0b memo body. The route is the canonical target of the "Why we can show this" link inside the IB section. Body sources from a sanitized markdown file at `content/legal/fair-report-privilege.md` (NOT directly from `docs/legal/...` which contains internal references like expert-cache paths and session keys). `page.tsx` uses the existing MDX loader pattern (mirror `src/app/blog/[slug]/page.tsx` shape — minimal: title H1 + body paragraphs + canonical State Bar URL footer link). Cascade: this becomes a moat asset (other legal-info sites don't publish fair-report justification publicly; INAA does, raises industry floor, signals embedded-insider methodology — Dreyer Search Dominance Engine entity-SEO play). Robots-allowed; structured data: `Article` schema with `author = INAA`, `publisher = INAA`, `mainEntityOfPage = self`. SC #42 verifies route exists + renders.

### T3 — UPL safety
- **T3.1 (REWRITTEN v2.3 per Code CRIT #3+#4+#5 + Sec CRIT #2)** — `evaluate-report` Edge Function takes `{caseId: UUID}` body and fetches `cases.report_html` from DB (`supabase/functions/evaluate-report/index.ts:381-407`). It writes results to `cases.eval_results` per the SHAPE at lines 549-557:
  ```ts
  eval_results = {
    evaluated_at, eval_version: '1.0', gate_passed: bool, teams: { upl: {...}, psych: {...} },
    summary: string, cost_usd: number, duration_ms: number,
  }
  // teams.upl shape (line 443-453): { name, weight: 'GATE', score, passed, needs_work, failed, criteria, summary, duration_ms }
  ```
  **There is NO `eval_results.upl.fail_count` field.** Real path: `eval_results.teams.upl.failed`. evaluate-report does NOT write to `operator_tasks`; UPL-FAIL alerts go via Resend `sendEmail()` (line 463-481) — NOT via DB row insert. Cleanup must NOT touch `operator_tasks`.

  Two-tier UPL coverage:
  1. **Regex panel (primary, 5 fixture states, no LLM cost):** Deno test `supabase/functions/generate-report/__tests__/upl-regex-panel.test.ts` renders all 5 fixture states (matched-clean, matched-1-event-suspension, matched-multi-event-disbarment, no-match, pipe-edge), then asserts `output.toLowerCase().includes(phrase.toLowerCase()) === false` for every entry in `BANNED_PHRASES_LIST` (T3.3 canonical Deno-readable file) on each state. The 'should' phrase uses word-boundary regex per T2.3 helper note (`\\bshould\\b`) to avoid false positives on `shoulder` / `should've` if those ever enter copy. Cost: $0.
  2. **Live evaluate-report smoke (1 fixture caseId, end-to-end, CI-path-gated):** Deno test at `supabase/functions/evaluate-report/__tests__/attorney-discipline-e2e.test.ts` (NOT Node — keeps single test runner per WARN #13). Steps:
     - **Pre-flight (Sec WARN — Resend gating)**: assert `Deno.env.get('RESEND_API_KEY') === '__test_disabled__' OR === ''`. Abort otherwise. Without this gate, a stochastic UPL regression sends a real operator email per evaluate-report:458-481 = alarm fatigue.
     - **Pre-flight (Sec WARN — service-role key fetch)**: read `SUPABASE_SERVICE_ROLE_KEY` from env (already in `--allow-env` allowlist per T1.4). Wrap all fetches in `safeFetch` redact wrapper.
     - **Insert fixture orders row first** (cases requires `order_id NOT NULL` per migrations/00001_initial_schema.sql:202; column is `amount` NOT `amount_cents` per same file line 877 — Code v4 CRIT #1): `INSERT INTO public.orders (id, email, tier, status, amount) VALUES (gen_random_uuid(), 'e2e-attorney-discipline-' || extract(epoch from now())::bigint || '@example.com', 'intelligence-brief', 'paid', 99700) RETURNING id` — capture as `orderId`.
     - **Insert fixture cases row** with ALL three NOT NULL columns + cron-skip flags + sentinel eval_results (Sec CRIT #2 — never matches CV `eval_results.is.null` filter even on mid-test crash):
       ```sql
       INSERT INTO public.cases (
         id, order_id, email, tier, status, charge_type, report_html,
         review_reminder_sent, is_included_deliverable,
         eval_results, generated_at
       ) VALUES (
         gen_random_uuid(),
         $orderId,
         'e2e-attorney-discipline-' || extract(epoch from now())::bigint || '@example.com',
         'intelligence-brief',
         'review',
         'DUI',
         <rendered IB HTML containing T2.2 matched-multi-event section>,
         true,                                          -- skip review-reminder cron
         true,                                          -- skip stuck-intake cron
         '{"sentinel": true, "gate_passed": false}',    -- v2.4 Sec CRIT: gate_passed:false ensures /api/deliver renderEvalScorecard treats as FAILED (not PASSED) if cleanup misses; prevents bypass of UPL gate in operator UI; evaluate-report overwrites with real {gate_passed: true|false} on completion
         NULL                                           -- generated_at NULL → review-reminder cron filter drops the row
       ) RETURNING id;
       ```
       Email pattern `e2e-attorney-discipline-${ts}@example.com` matches CV probe allowlist (`e2e-%` per `~/projects/continuous-verification/configs/inna.cv.json:101-127`).
     - `POST ${SUPABASE_URL}/functions/v1/evaluate-report` with body `{caseId}`.
     - Read response JSON: assert `body.success === true && body.gate_passed === true`.
     - Read DB `cases.eval_results` post-call: assert `eval_results.gate_passed === true && eval_results.teams.upl.failed === 0` (correct shape per Code CRIT #3).
     - **Cleanup (try/finally, ALWAYS runs)**: `DELETE FROM public.cases WHERE id = $caseId; DELETE FROM public.orders WHERE id = $orderId;`. Drop the spurious `operator_tasks` DELETE — evaluate-report never writes there.
     - Cost: ~$2-3/run (Sonnet UPL + Psych eval).
  3. **Reaper safety net (Sec CRIT #2 belt-and-suspenders):** add `scripts/reap-attorney-discipline-fixtures.mjs` — runs at end of CI job in a separate step (`if: always()` in CI YAML) regardless of test exit code. Body deletes any `cases` row matching `email LIKE 'e2e-attorney-discipline-%'` AND its parent `orders` row. Catches mid-test SIGKILL or runner crash where the `try/finally` never fires. Idempotent.
  4. **CI gating**: live e2e test only runs on PRs touching `supabase/functions/generate-report/lib/render-attorney-discipline.ts` OR `lib/attorney-discipline.ts` OR `T3.3` files (paths filter). Regex panel runs on every PR.
- **T3.2 (REWRITTEN v2.3 per Code CRIT #8 + Sec SUG word-boundary)** — Two parallel banned-phrases tests, one per runtime, both reading from the SAME canonical Deno-readable list file:
  - **Node-side**: `src/lib/intelligence-brief/__tests__/disclaimer-banned-phrases.test.ts` — vitest. Imports `BANNED_PHRASES_LIST` from `src/lib/intelligence-brief/prompts.ts` (re-exported per T3.3). Imports `DISCLAIMER_VERBATIM` from `src/lib/intelligence-brief/attorney-discipline-disclaimer.ts` (Node-readable mirror, plain string export, no Deno imports).
  - **Deno-side**: `supabase/functions/generate-report/__tests__/upl-regex-panel.test.ts` (T3.1.1) — imports `BANNED_PHRASES_LIST` directly from canonical Deno path `../lib/banned-phrases-list.ts` (relative path, no Next.js alias).
  - For each phrase in `BANNED_PHRASES_LIST`: word-boundary check for `'should'` (regex `/\bshould\b/i.test(disclaimer)` MUST be false), substring check for all others (`disclaimer.toLowerCase().includes(phrase.toLowerCase()) === false`).
  - Both runtimes assert against the SAME canonical list, so drift is impossible.
- **T3.3 (RESHAPED v2.3 per Code CRIT #8)** — Canonical `BANNED_PHRASES_LIST` lives at `supabase/functions/generate-report/lib/banned-phrases-list.ts` (Deno-readable, NO Next.js path aliases — a plain ES module). `src/lib/intelligence-brief/prompts.ts` re-exports it via relative path (Next.js bundler resolves the relative import; the source file is the single canonical):
  ```ts
  // supabase/functions/generate-report/lib/banned-phrases-list.ts (NEW canonical)
  export const BANNED_PHRASES_LIST = [
    'you should',
    'should',           // word-boundary checked in disclaimer test (T3.2)
    'you need to',
    'we recommend',
    'we advise',
    'your best option',
    'the best strategy',
    'red flag',
    'warning sign',
    'escalation ladder',
    'do not',           // bare imperative
  ] as const;
  export type BannedPhrase = typeof BANNED_PHRASES_LIST[number];
  ```
  **v2.4 CORRECTION (Code CRIT #2)**: `tsconfig.json:33` HAS `"exclude": ["node_modules", "supabase", ...]`. Re-exporting from prompts.ts → supabase/functions/ would fail `npm run build` (TS2307 / TS6059). Drop the re-export. Node tests (T3.2 + T3.4) import `BANNED_PHRASES_LIST` DIRECTLY from the canonical Deno-side file via vitest's runtime resolver:
  ```ts
  // src/lib/intelligence-brief/__tests__/disclaimer-banned-phrases.test.ts
  import { BANNED_PHRASES_LIST } from '../../../../supabase/functions/generate-report/lib/banned-phrases-list';
  ```
  Vitest's runtime module resolution does NOT honor tsconfig.exclude; it resolves the file at test runtime regardless. `prompts.ts` is NOT modified. The `BANNED_PHRASES_BLOCK` prose stays in prompts.ts for production prompt text (Next.js compiles prompts.ts; vitest tests touch prompts.ts only in tests so no cross-tree compile is triggered). Drift between the canonical list and prompts.ts's prose is caught by T3.4 parity test, which imports BOTH files via vitest runtime.

  Match-rule notes: case-insensitive substring for all entries EXCEPT `'should'` which is matched as `\bshould\b` (word-boundary) so future copy with `'shoulder'` / `'shouldered'` doesn't false-positive. The `'should'` rule still catches every directive use ("should file", "should pursue", "you should").
- **T3.4 (parity test, BIDIRECTIONAL v2.3 per Code WARN #15)** — Node test at `src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts`:
  - **Forward**: every entry in `BANNED_PHRASES_LIST` (case-insensitive substring) appears in the prose `BANNED_PHRASES_BLOCK` text. (Catches: phrase added to list but block not updated.)
  - **Reverse (NEW v2.3)**: regex-extract every quoted phrase from `BANNED_PHRASES_BLOCK` using strict pattern `/^- "([^"]+)"/gm`. For each extracted phrase, assert it appears (case-insensitive substring) in `BANNED_PHRASES_LIST`. (Catches: phrase added to prose block but list not updated — Code WARN #15.)
  - Symmetric coverage closes drift in both directions.

### T4 — Verification
- **T4.1** — `npm run build` exit 0.
- **T4.1a (new v2.2 per SUG #11)** — `deno check supabase/functions/generate-report/index.ts` exit 0. Catches Deno-side TS errors npm build cannot see (Deno has its own type-checker against the function's `deno.json` import map). Run between T4.1 and T4.2.
- **T4.2 (Node tests)** — `npm test -- --reporter=json --outputFile=/tmp/after.json`. Capture `before.json` from `origin/master` via fresh worktree at `.tmp/baseline-test-counts/`. Assert `after.numPassedTests >= before.numPassedTests` AND `before.passing[]` ∩ `after.failing[]` is empty.
- **T4.2a (Deno tests, REWRITTEN v2.3 per Code WARN #13 + Sec WARN service-role-key)** — Use the SAME explicit file list from T1.4 (NOT directory glob — vitest collision):
  ```
  deno test \
    --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY,ANTHROPIC_API_KEY,RESEND_API_KEY \
    --allow-net=jxjbjmgdukwkoclydqdr.supabase.co,api.anthropic.com \
    --reporter=json \
    supabase/functions/generate-report/__tests__/attorney-discipline.test.ts \
    supabase/functions/generate-report/__tests__/upl-regex-panel.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-guard.test.ts \
    supabase/functions/generate-report/__tests__/render-attorney-discipline-lint.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-fair-report-paths.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-common-name.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-fair-report-paths.test.ts \
    supabase/functions/generate-report/__tests__/attorney-discipline-common-name.test.ts \
    supabase/functions/__tests__/rls-attorney-discipline.test.ts \
    supabase/functions/evaluate-report/__tests__/attorney-discipline-e2e.test.ts \
    > /tmp/deno-after.json
  ```
  Track Deno test count INDEPENDENTLY of npm test count; the two runners report into separate JSON files. Assert `deno-after.passed === deno-before.passed + N_NEW_DENO_TESTS` (where `N_NEW_DENO_TESTS` = sum of new Deno tests across all 6 files).
  **Artifact scrub (Sec WARN service-role key leak)**: before any artifact upload (CI step `Upload deno-after.json`), grep the JSON for `Bearer [^\s"']+` and `eyJhbGc[^\s"']+` (JWT prefix) — if found, fail the build. Keys never appear in artifacts.
- **T4.3** — CV probe-only: `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` exits 0 AND no `INNA-H1.*FAIL` in stdout (no substring count assertion).
- **T4.4** — XSS smoke: insert a third fixture row with `discipline.type='<script>alert(1)</script>'` and `source_url='javascript:alert(1)'`; render via T2.2; assert HTML contains escaped `&lt;script&gt;` and `href="#"` (not `href="javascript:..."`).
- **T4.4a (markdown-pipe smoke, v2.2 per WARN #6)** — `FIXTURE-005` event with raw pipes in `discipline_type` + `violation_summary`. Render via T2.2; flow through `md2html`; assert exactly 4 `<th>` columns; assert literal `|` characters appear in the rendered cell text (escapeMarkdownPipe's `\|` survives md2html unescape per index.ts:7355).
- **T4.4b (XSS centralization lint, NEW v2.3 per Sec CRIT #1)** — Deno test at `supabase/functions/generate-report/__tests__/render-attorney-discipline-lint.test.ts`:
  - Read `supabase/functions/generate-report/lib/render-attorney-discipline.ts` source as plain text via `Deno.readTextFile`.
  - Strip block comments `/* ... */` and line comments `// ...` and string literals `'...'` / `"..."` / template-literal NON-interpolation parts.
  - Regex-find every `${...}` interpolation in the remaining template-literal expressions.
  - For each match, assert the expression is one of: a `safeCell(...)` call, `safeHttpUrl(...)` call, `formatShortDate(...)` call, OR a literal call in the allowlist `['events.length', 'N', 'plural', 'YYYY']` (numeric/structural placeholders).
  - Any other interpolation fails the test with `interpolation '${EXPR}' must route through safeCell/safeHttpUrl/formatShortDate`. Catches future PRs that bypass the centralized escape pipeline (Sec CRIT #1).
- **T4.4c (markdown-pipe edge cases, NEW v2.3 per Sec SUG)** — `FIXTURE-008` event with `discipline_type='\\|'` (literal backslash-pipe) AND `violation_summary='|||'` (three consecutive pipes). Render → md2html. Assert exactly 4 columns AND row count is 1 (no shred from `|||`) AND `discipline_type` cell-text contains `\|` rendered as literal backslash-pipe (or just `|` after unescape — whichever md2html produces; both safe).
- **T4.5** — Injection smoke: `getAttorneyDiscipline("' OR 1=1 --", 'CA')` returns `{ status: 'no-match', attorney: null, events: [] }`, no error thrown.
- **T4.5a (unaccent smoke, v2.2 per WARN #7)** — `FIXTURE-006` (`'José García'`) ↔ `FIXTURE-007` (`'Jose Garcia'`). Bidirectional match assertion confirms RPC `LOWER(unaccent(...))` works both directions.
- **T4.5b (garbage-name skip, v2.2 per WARN #9 + Code WARN #14)** — Test caller-scope `buildAttorneyDisciplineSection` for inputs: `''`, `'  '`, `'Bo'`, `'Smith'`, `'asdf'`, `'n/a'`, `'TBD'`, `'pending'`, `'Not provided'`. Assert returns `''` AND `fetch.mock.calls.length === 0`.
- **T4.5c (FAIR_REPORT_MEMO_PATHS lint, NEW v2.3 per Sec WARN coupling)** — Deno test asserts every key in `BAR_LOOKUP_URLS` (T2.3) has a matching key in `FAIR_REPORT_MEMO_PATHS` AND every memo path file exists on disk (`Deno.stat()`). Adding a new state to either map without the other fails the build. Closes the prose-only "block multi-state expansion until per-state memo" gate as a hook-or-harder enforcement.
- **T4.5d (Sec — defamation surface acknowledgment, NEW v2.3)** — Test at `attorney-discipline-common-name.test.ts`: insert TWO `FIXTURE-John-Smith` attorneys (different bar_numbers, identical `full_name='John Smith'`). Call `getAttorneyDiscipline('John Smith', 'CA')` — assert `status === 'no-match'` AND `events.length === 0` (RPC server-side n>1 collapses to no-match per T0a). Document in test comment: this is the EXPECTED defamation-protection behavior for common-name attorneys; common-name attorneys with discipline records will silently no-render. The cascade and Out of Scope sections name this trade-off.
- **T4.6** — Anon-key denial smoke: in `supabase/functions/__tests__/rls-attorney-discipline.test.ts`, FIRST decode the ANON_KEY JWT and assert `role === 'anon'` (otherwise abort — wrong-key misconfig produces a false-green per Sec v2 WARN #4). THEN `curl ${SUPABASE_URL}/rest/v1/attorney_discipline_events?select=* -H "apikey: ${ANON_KEY}"` returns **HTTP 200 + body `[]`** (RLS-blocked-anon returns empty, NOT 401 — Code v2 CRIT #3 verified live 2026-04-25 against legacy JWT + new sb_publishable_* keys). Equivalent assertion: `r.status === 200 && JSON.parse(await r.text()).length === 0`. Run against both `attorneys` and `attorney_discipline_events` tables. Pre-flight: anon-key in test env must come from Supabase Mgmt API at runtime (`/v1/projects/<ref>/api-keys?reveal=true`) NOT `.env.local` (which can carry a stale key — discovered 2026-04-25 in this session: stale .env.local anon key returned 401 "Invalid API key" on every table including known-RLS-protected `cases`/`orders`, masking actual RLS posture). Aligns with INAA-web ARCHITECTURE.md invariant #4 (service-role only for production DB; RLS is defense-in-depth). Update `.env.local` anon key as a separate cleanup task.
  - **Additional anon assertion for the RPC**: `POST /rest/v1/rpc/match_attorney` with anon key + body `{"p_name":"Anyone","p_jurisdiction":"CA"}` returns **HTTP 401 or 403** (RPC has explicit `REVOKE FROM PUBLIC` + `GRANT TO service_role` per T0a — anon must NOT be able to invoke the RPC even though attorneys table allows anon to read empty `[]` via RLS).
  - **pg_policies posture assertion (NEW v2.3 per Code WARN false-green risk)**: query `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('attorneys','attorney_discipline_events') AND cmd='SELECT' AND roles::text LIKE '%anon%' AND qual <> 'false' AND qual NOT LIKE '%FIXTURE-%';` — assert `count === 0`. Catches a future regression that adds a permissive `FOR SELECT TO anon USING (true)` policy (would defeat T0a's RLS posture). The `LIKE '%FIXTURE-%'` exception lets the deny-test-fixtures policies coexist as defense-in-depth (those have `USING (bar_number NOT LIKE 'FIXTURE-%')` — not permissive, just deny-overlay).
- **T4.7** — Live render smoke: invoke IB renderer with the synthetic `FIXTURE-002` case fixture; assert rendered HTML contains "Attorney Bar Record Check" exactly once, with the discipline event row, with `DISCLAIMER_VERBATIM` verbatim, with `last_seen_at` rendered as `YYYY-MM-DD` (regex `/\d{4}-\d{2}-\d{2}/`) AND NO raw timestamptz substring (`/T\d{2}:\d{2}:\d{2}/`) AND NO literal `1970-01-01` (catches null-coalesce silent fallback per Code WARN #11).

## Out of Scope (v2.3)
- Case Decoder integration → **Phase 1.1b** separate plan (path: `batch-poller.ts:238` post-Opus markdown injection).
- Multi-state attorney discipline (FL/TX/NY/PA/OH) → blocked on per-state fair-report privilege memos. T4.5c lint enforces the gate.
- Fuzzy match / disambiguation prompt → defamation surface; not until exact-match version is shipped + observed.
- Intake form jurisdiction field → 2-bar attorneys are an edge case; default to defendant's state until real demand observed.
- Attorney rating / scoring → interpretation, breaks UPL safety.
- Officer-discipline parallel section → separate worry, separate plan.
- Backfill of already-delivered reports → not in scope; new section only for reports generated after deploy.
- **Common-name silent no-match (Sec WARN, intentional)** → an attorney named `'John Smith'` with discipline events will never render in the section because exact-match-only + RPC server-side ambiguity-collapse means n>1 returns no-match. SC #20b (T4.5d) tests + documents this. **This is intentional defamation-surface protection**, not a bug. Bar-number-based exact match (defendant types the State Bar number from the attorney's signature line) is a possible future enhancement; deferred to Phase 1.1b CD plan or later.
- **Indexed `/attorney/ca/[bar_number]/discipline-record` URL pattern (Dreyer SUG)** → niche-domination follow-on. Treats public bar discipline as entity-SEO surface. Defamation profile identical to in-report (exact-match + fair-report). Tracked as Phase 1.1c follow-on, NOT v2 blocking.
- **Rehabilitation timeline copy (Dreyer SUG)** → matched-events render shows ALL historical events without recency/rehabilitation context. v2 ships mechanical-only; computed `Most recent event: {ago}` summary deferred to Phase 1.1d follow-on.

## Success Criteria

**Fixture declarations (defined in T1.3 migration; constants exported from `supabase/functions/generate-report/__tests__/fixtures.ts`):**
- `FIXTURE_CLEAN_BAR_NUMBER = 'FIXTURE-001'`
- `FIXTURE_CLEAN_ATTORNEY_NAME = 'Fixture Cleanrecord'`
- `FIXTURE_DISCIPLINED_BAR_NUMBER = 'FIXTURE-002'`
- `FIXTURE_DISCIPLINED_ATTORNEY_NAME = 'Fixture Disciplined'`
- `FIXTURE_DISCIPLINED_EVENT_COUNT = 2`
- `FIXTURE_AMBIGUOUS_BAR_NUMBER = 'FIXTURE-003'` (second 'Fixture Cleanrecord' row to test ambiguous-match no-match return)
- `FIXTURE_HOSTILE_BAR_NUMBER = 'FIXTURE-004'` (XSS payload event — T4.4)
- `FIXTURE_PIPE_BAR_NUMBER = 'FIXTURE-005'` (raw `|` in `discipline_type` and `violation_summary` — T4.4a)
- `FIXTURE_ACCENT_BAR_NUMBER = 'FIXTURE-006'` (full_name `'José García'` — T4.5a)
- `FIXTURE_ACCENT_REVERSE_BAR_NUMBER = 'FIXTURE-007'` (full_name `'Jose Garcia'` plain ASCII — T4.5a reverse)
- `IB_SECTION_ANCHORS.ATTORNEY_DISCIPLINE = '## Attorney Bar Record Check'` (raw markdown H2 form)
- `IB_SECTION_ANCHORS.YOUR_PLAN = '## Section 6: Your Plan'` (literal H2 form pinned for slot-order assertion)
- `IB_SECTION_ANCHORS.BRADY_GIGLIO_APPENDIX = '## Appendix A: Brady/Giglio Checklist'` (forward-slash form per actual code at index.ts:7236; SC #11 brittleness fix)
- `DISCLAIMER_VERBATIM` exported from `src/lib/intelligence-brief/attorney-discipline-disclaimer.ts` (Node-readable mirror so T3.2 + T3.4 Node tests + Deno tests both import the same string)
- `BANNED_PHRASES_LIST` canonical at `supabase/functions/generate-report/lib/banned-phrases-list.ts` (Deno-readable, no aliases); re-exported from `src/lib/intelligence-brief/prompts.ts` for Node test convenience

**Worry-intent coverage map** (every clause in worry text → at least one PASS/FAIL criterion):
- "1,842 attorneys + 3,417 events loaded but unread" → SC #5/#6 (helper queries return live rows)
- "intake.attorneyName collected" → SC #11 (renderer threads intake meta into helper call)
- "no surface JOINs" → SC #11 (production renderer wires section + section appears in output)
- "#1 crisis-buyer fear (trust)" → SC #12 + #13 (UPL-safe disclaimer + LLM evaluator pass)
- "render only on EXACT-MATCH (defamation surface)" → SC #7 (ambiguous returns no-match) + SC #21 (RPC unaccent match deterministic)
- "fair-report privilege framing" → SC #14 (memo file present + cited)

1. **RLS posture explicit.** `psql` against the project: `SELECT relrowsecurity FROM pg_class WHERE relname IN ('attorneys','attorney_discipline_events')` returns `t` for both rows. (Verifiable PASS/FAIL via single SQL query post-T0a.)
2. **Anon denial smoke.** Live `curl ${SUPABASE_URL}/rest/v1/attorney_discipline_events?select=* -H "apikey: ${ANON_KEY}"` (anon key fetched from Supabase Mgmt API at runtime) returns `r.status === 200 && JSON.parse(await r.text()).length === 0` (RLS-blocked-anon = empty array, NOT 401). Test at `supabase/functions/__tests__/rls-attorney-discipline.test.ts`. Pre-flight asserts JWT `role === 'anon'`.
3. **Function exists.** `import { getAttorneyDiscipline } from 'supabase/functions/generate-report/lib/attorney-discipline'` resolves; `typeof getAttorneyDiscipline === 'function'`; `getAttorneyDiscipline.length === 2`.
4. **Shape test passes.** Test `'returns expected shape'` calls `getAttorneyDiscipline(FIXTURE_DISCIPLINED_ATTORNEY_NAME, 'CA')`; asserts result keys deep-equal `['attorney', 'events', 'status']`.
5. **Clean attorney match.** Test `'matches clean attorney'` calls `getAttorneyDiscipline(FIXTURE_CLEAN_ATTORNEY_NAME, 'CA')`; asserts `result.status === 'matched' && result.events.length === 0 && result.attorney.current_status === 'active' && result.attorney.bar_number === FIXTURE_CLEAN_BAR_NUMBER`.
6. **Disciplined attorney match.** Test asserts `result.status === 'matched' && result.events.length === FIXTURE_DISCIPLINED_EVENT_COUNT && result.attorney.current_status === 'suspended'`. Each event has `typeof e.order_date === 'string' && typeof e.discipline_type === 'string' && (typeof e.violation_summary === 'string' || typeof e.discipline_raw === 'string')` (column names per T1.1, NOT legacy `date/type/outcome`).
7. **Ambiguous match returns no-match.** Test inserts duplicate fixture row `FIXTURE-003` with same `full_name` as `FIXTURE-001`; asserts `getAttorneyDiscipline(FIXTURE_CLEAN_ATTORNEY_NAME, 'CA').status === 'no-match'`.
8. **Injection-resistant.** Test asserts `getAttorneyDiscipline("' OR 1=1 --", 'CA')` deep-equals `{ attorney: null, events: [], status: 'no-match' }` AND no error thrown.
9. **No-match path.** Test asserts `getAttorneyDiscipline('Zzzzz Nonexistent', 'CA')` deep-equals `{ attorney: null, events: [], status: 'no-match' }`.
10. **Renderer escapes hostile HTML input.** Test inserts fixture `FIXTURE-004` with discipline event having `discipline_type='<script>alert(1)</script>'` and `source_url='javascript:alert(1)'`; renders section; asserts output HTML contains `&lt;script&gt;alert(1)&lt;/script&gt;` AND contains `href="#"` AND does NOT contain literal `<script>` or literal `javascript:`.
11. **IB renders attorney-discipline section in correct slot — pre-render assertion (CORRECTED v2.4 per Code CRIT #3).** SC #11 v2.3 asserted against rendered HTML, but the LLM prompt at `index.ts:7102` instructs `Output: ## Section 6` (NOT `: Your Plan`), and post-md2html the markdown anchors don't survive in HTML. Both surfaces make HTML substring assertions unreliable. v2.4 instead asserts against `allOutputs` map ordering BEFORE `renderIBReportHtml` runs. Test invokes the Phase B caller flow with `FIXTURE_DISCIPLINED_BAR_NUMBER`; captures `allOutputs` keys in insertion order (or per the sections array at lines 7429-7450). Asserts: (a) `'attorney-discipline' in allOutputs && typeof allOutputs['attorney-discipline'] === 'string' && allOutputs['attorney-discipline'].length > 0` (key present + non-empty), (b) the position of `'attorney-discipline'` in the literal sections-array source code at lines 7429-7450 sits AFTER `sectionOutputs["your-plan"]` AND BEFORE `buildBradyGiglioChecklist()` — verifiable by reading `index.ts` and asserting line ordering of those three string literals. (c) `allOutputs['attorney-discipline'].startsWith('## Attorney Bar Record Check')` (markdown heading present). All three assertions are deterministic and don't depend on LLM output formatting.
12. **UPL evaluator passes — live caseId smoke (CORRECTED v2.3 per Code CRIT #3+#4+#5).** Test:
    a. Insert fixture orders row (provides NOT NULL `order_id` for cases per migrations/00001_initial_schema.sql:202).
    b. Insert fixture `cases` row with ALL three NOT NULL columns (`order_id`, `email`, `tier`), `email='e2e-attorney-discipline-${ts}@example.com'` (CV-allowlisted per `inna.cv.json`), `eval_results='{"sentinel": true, "evaluated_at": null}'` sentinel, `review_reminder_sent=true`, `is_included_deliverable=true`, `generated_at=NULL`, `report_html=<rendered IB containing T2.2 matched-multi-event>`, `gen_random_uuid()` caseId.
    c. Pre-flight assertion: `Deno.env.get('RESEND_API_KEY') === '__test_disabled__' OR === ''` (Resend gating per Sec WARN — prevents real operator email on flaky LLM regression).
    d. `POST ${SUPABASE_URL}/functions/v1/evaluate-report` with body `{caseId}`.
    e. Assert response JSON: `body.success === true && body.gate_passed === true`.
    f. Read `cases.eval_results` post-call: assert `eval_results.gate_passed === true && eval_results.teams.upl.failed === 0` (CORRECT shape per evaluate-report/index.ts:443-453 + 549-557; NOT `eval_results.upl.fail_count` which does not exist).
    g. Cleanup in `try/finally`: `DELETE FROM public.cases WHERE id = $caseId; DELETE FROM public.orders WHERE id = $orderId;`. Drop the spurious `operator_tasks` DELETE — evaluate-report writes via Resend `sendEmail()`, NOT to a `operator_tasks` table.
    h. Reaper script `scripts/reap-attorney-discipline-fixtures.mjs` runs in CI `if: always()` step, deletes any `cases` row with `email LIKE 'e2e-attorney-discipline-%'` AND its parent `orders` row, idempotent. Catches mid-test SIGKILL.
    Cost: ~$2-3/run (Sonnet UPL + Psych eval). CI path-filtered to attorney-discipline file changes only.
13. **Disclaimer is UPL-banned-phrase-free (BANNED_PHRASES_LIST canonical, WARN #8).** Node test at `disclaimer-banned-phrases.test.ts` imports `DISCLAIMER_VERBATIM` and `BANNED_PHRASES_LIST`; iterates every entry in `BANNED_PHRASES_LIST` (canonical list extracted from `prompts.ts:34-44`); asserts `DISCLAIMER_VERBATIM.toLowerCase().includes(phrase.toLowerCase()) === false` for each. Hand-rolled phrase subsets are NOT acceptable — must use the imported `BANNED_PHRASES_LIST` constant.
14. **Fair-report privilege memo present.** File `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` exists; contains the literal substring `California Civil Code § 47`. (Reader runs `test -f` and `grep -F`.)
15. **Build green.** `npm run build` exit 0.
16. **Node tests green — count-pinned.** Capture `npm test -- --reporter=json --outputFile=before.json` on `origin/master` via temporary `.tmp/baseline-checkout/`; capture `after.json` on PR branch; assert `after.numPassedTests >= before.numPassedTests` AND no test name in `before.passing[]` appears in `after.failing[]`.
17. **CV probe-only green.** `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` exits 0 AND stdout has zero lines matching `/INNA-H1.*FAIL/`.
18. **Deno tests green (separately tracked from npm, WARN #4).** `deno test --allow-net --allow-env --reporter=json supabase/functions/{generate-report,evaluate-report}/__tests__/ supabase/functions/__tests__/` exits 0; baseline captured pre-PR; assert `deno-after.passed === deno-before.passed + N_NEW_DENO_TESTS` where `N_NEW_DENO_TESTS = sum(new tests added in T1.4 + T3.1.1 + T3.1.2 + T4.4a + T4.5a + T4.5b + T4.6)`. Failing this criterion catches Deno-runtime test regressions that npm test cannot detect.
19. **Deno typecheck green (SUG #11).** `deno check supabase/functions/generate-report/index.ts` exits 0. Catches Deno-side TS errors npm build cannot see.
20. **Garbage-name skip — programmatic (WARN #9).** Deno test at `attorney-discipline-guard.test.ts` invokes `buildAttorneyDisciplineSection({ attorneyName, jurisdiction: 'CA', supabaseUrl, serviceRoleKey })` for each of: `''`, `'   '`, `'Bo'`, `'Smith'` (single-token), `'asdf'`, `'n/a'`, `'TBD'`, `'pending'`. For each input, asserts (a) returns `''`, (b) `fetch.mock.calls.length === 0` after the call. Confirms guard fires before any DB hit.
21. **Unaccent match works both directions (WARN #7).** Deno test inserts `FIXTURE-006` with `full_name='José García'` then calls `getAttorneyDiscipline('Jose Garcia', 'CA')` — asserts `status === 'matched' && attorney.bar_number === 'FIXTURE-006'`. Reverse: insert `FIXTURE-007` `'Jose Garcia'` (ASCII), query `'José García'` — same assertion against `FIXTURE-007`. Confirms RPC `LOWER(unaccent(...))` works both directions via the functional index.
22. **Markdown-pipe escape works (WARN #6).** Deno test inserts `FIXTURE-005` event with `discipline_type='Suspension | 90 days'` and `violation_summary='Failure to file | client funds'`. Renders T2.2 section, runs through `md2html` (the same pass T2.4 production uses). Asserts: (a) rendered HTML contains exactly 4 `<th>` headers in the discipline-events table (Date / Type / Summary / Source), (b) the cell text content for `discipline_type` shows `Suspension | 90 days` with literal pipe character (after escapeMarkdownPipe + md2html unescape cycle), (c) row count is 1 (not pipe-shred into 2+ rows).
23. **`last_seen_at` short-date format (SUG #13).** Test asserts rendered HTML for matched fixtures contains a date matching `/\d{4}-\d{2}-\d{2}/` for the `last_seen_at` value AND does NOT contain raw timestamptz strings (negative-match `/T\d{2}:\d{2}:\d{2}/`).
24. **Markdown heading (SUG #12).** Test asserts the RAW PRE-md2html output of `buildAttorneyDisciplineSection()` starts with `## Attorney Bar Record Check\n` (markdown), NOT raw `<h2>`. Catches drift if a future edit re-introduces inline HTML headers.
25. **Sibling-PR pre-flight artifact (T0c, WARN #10).** Reader runs:
    a. `grep -F '```json t0c-pre-flight' docs/plans/2026-04-25-worry-attorney-discipline-wire-rounds.md` → exit 0 (the fenced block tag exists).
    b. Extract the fenced JSON payload after that tag. The payload is the raw output of `gh pr list --repo rahim0kapadia/ImNotAnAttorney-web --state open --json number,headRefName,files --limit 50` captured immediately before `git worktree add` in Phase 5.
    c. For every PR object in the payload AND every `files[].path` entry within each PR: assert NONE matches any of the five blocking paths: `supabase/functions/generate-report/index.ts`, `src/lib/intelligence-brief/prompts.ts`, `src/lib/intelligence-brief/render.ts`, glob `supabase/migrations/20260425c_*.sql`, glob `supabase/migrations/20260425d_*.sql`.
    PASS iff steps (a) and (c) both succeed (binary). FAIL if the tag missing, payload unparseable, or any path matches. Verifiable script: `node scripts/verify-t0c-preflight.mjs <rounds-file-path>` exits 0 on PASS, non-zero on FAIL.
26. **RPC permissions — anon blocked (v2.4 status set per Code WARN — PostgREST returns 404 for missing-EXECUTE).** Test calls `POST /rest/v1/rpc/match_attorney` with anon key; asserts `r.status === 401 || r.status === 403 || r.status === 404` (PostgREST returns 404 with body `{"code": "42883", "message": "Could not find the function ... in the schema cache"}` when the calling role lacks EXECUTE — the function is treated as not-in-API). Additional body assertion: `JSON.parse(await r.text()).code === '42883'` if status is 404. Service-role call returns rows. Confirms T0a `REVOKE FROM PUBLIC` + `GRANT TO service_role` is applied.
27. **`BANNED_PHRASES_LIST` parity test bidirectional (T3.4 v2.3).** TWO assertions: (a) every entry in `BANNED_PHRASES_LIST` (case-insensitive substring) appears in `BANNED_PHRASES_BLOCK` prose; (b) every quoted phrase regex-extracted from `BANNED_PHRASES_BLOCK` via `/^- "([^"]+)"/gm` exists (case-insensitive substring) in `BANNED_PHRASES_LIST`. Symmetric coverage closes drift in both directions.
28. **XSS centralization lint (NEW v2.3 per Sec CRIT #1).** Test at `render-attorney-discipline-lint.test.ts` reads source of `lib/render-attorney-discipline.ts`, strips comments + string literals, regex-finds every `${...}` interpolation, asserts each is one of: `safeCell(...)`, `safeHttpUrl(...)`, `formatShortDate(...)`, OR a literal in allowlist `['events.length', 'N', 'plural', 'YYYY']`. Fails fast on any other interpolation pattern. Catches future PRs that bypass the centralized escape pipeline.
29. **CV-probe pollution prevention (NEW v2.3 per Sec CRIT #2).** Test asserts the e2e fixture `cases` row inserted by SC #12 satisfies BOTH: (a) `email` matches CV allowlist pattern `e2e-%` per `~/projects/continuous-verification/configs/inna.cv.json` `email.not.ilike` filter, (b) `eval_results IS NOT NULL` at insert time (sentinel `{"sentinel": true}`). Both conditions ensure the fixture row never matches `inna-missed-evals` probe filter (`status.eq=review AND eval_results.is.null`) even on mid-test crash before evaluate-report writes results. Reaper script `scripts/reap-attorney-discipline-fixtures.mjs` exists at the cited path (`test -f` exit 0).
30. **Resend gating in test env (NEW v2.3 per Sec WARN).** Pre-flight test asserts `process.env.RESEND_API_KEY === '__test_disabled__'` OR empty before invoking evaluate-report e2e smoke. Without this, a stochastic UPL regression triggers a real operator email per evaluate-report:458-481.
31. **Cron-skip flags on cases fixture (NEW v2.3 per Sec WARN review_reminder).** Test asserts inserted fixture cases row has `review_reminder_sent=true` AND `is_included_deliverable=true` AND `generated_at IS NULL`. Documented invariant: every test fixture must be invisible to all 6 cron tasks in `src/lib/cron/`.
32. **FAIR_REPORT_MEMO_PATHS lint (NEW v2.3 per Sec WARN coupling).** Deno test at `attorney-discipline-fair-report-paths.test.ts` asserts (a) every key in `BAR_LOOKUP_URLS` has a matching key in `FAIR_REPORT_MEMO_PATHS`, (b) every value in `FAIR_REPORT_MEMO_PATHS` resolves via `Deno.stat()` to an existing file. Catches: adding a new state's bar lookup without writing the memo. Hook-or-harder for the prose "block multi-state expansion until per-state memo" gate.
33. **pg_policies posture (NEW v2.3 per Code WARN false-green).** Query `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('attorneys','attorney_discipline_events') AND cmd='SELECT' AND roles::text LIKE '%anon%' AND qual <> 'false' AND qual NOT LIKE '%FIXTURE-%'` returns count = 0. Catches future migration that adds permissive `anon SELECT USING (true)` defeating T0a's RLS posture.
34. **Common-name silent no-match (NEW v2.3 per Sec WARN).** Test inserts two `'John Smith'` fixture attorneys (different bar_numbers, identical full_name); calls `getAttorneyDiscipline('John Smith', 'CA')`; asserts `status === 'no-match' && events.length === 0` AND no fetch is made to discipline-events endpoint (RPC server-side n>1 collapse per T0a). Documents intentional defamation-protection trade-off.
35. **Markdown-pipe edge cases (NEW v2.3 per Sec SUG).** Test FIXTURE-008 with `discipline_type='\\|'` AND `violation_summary='|||'`. Render → md2html. Asserts (a) exactly 4 `<th>` columns, (b) row count = 1 (no shred from `|||`), (c) cell text contains the literal pipe character (escapeMarkdownPipe + md2html unescape).
36. **Structured no-match logging (NEW v2.3 per Sec SUG).** Mock `console.log` in helper test; assert every no-match path emits one JSON object with shape `{ component: 'attorney-discipline', reason: <enum>, jurisdiction: string, name_length: number }` AND `attorneyName` substring NEVER appears in any log line (PII safety). Verifiable via `JSON.parse` round-trip on captured log output.
37. **T0c post-worktree race-window check (NEW v2.3 per Code WARN race).** Pre-Phase-5 ops: AFTER `git worktree add`, re-run `gh pr list` and append the JSON to `rounds.md` under fenced tag `t0c-pre-flight-post`. Verifier script (same as SC #25, but reads the post-tag) exits 0 if no new sibling PR appeared touching any of the 5 blocking paths during the worktree-creation race window. FAIL if the post-flight detected drift; recovery path: `git worktree remove` + abort.
38. **Unaccent extension pre-flight (NEW v2.3 per Code CRIT #7).** T0a migration body includes `DO $$ ... SELECT extensions.unaccent('extensions.unaccent', 'café') INTO folded; IF folded <> 'cafe' THEN RAISE EXCEPTION ... END IF; END $$;` BEFORE the index in step 3 fires. Verifiable: migration apply succeeds end-to-end (indicates pre-flight passed); a deliberate misconfig (e.g. unaccent installed in wrong schema) would abort migration with the EXCEPTION text. Test inspects migration file via `Deno.readTextFile + grep` to confirm the DO block exists with the exact RAISE EXCEPTION text.
39. **RPC server-side ambiguity collapse (NEW v2.3 per Code SUG).** Test calls `match_attorney('John Smith', 'CA')` against fixtures with two `'John Smith'` rows; asserts response array is empty `[]` (NOT a row with `match_count=2`). Confirms the `WHERE counted.n = 1` clause is server-side enforced.
40. **Fixture future-proof RLS deny policies (NEW v2.3 per Sec SUG).** Test asserts `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('attorneys','attorney_discipline_events') AND policyname IN ('deny_anon_test_fixtures_attorneys','deny_anon_test_fixtures_events')` returns count = 2. Confirms T0a's defense-in-depth deny policies survive even if a future migration adds permissive anon SELECT.
41. **Bar-lookup-url disambiguation (NEW v2.4 per Dreyer WARN #1).** Test renders T2.2 matched-state output AND T2.2 no-match output. Asserts: (a) matched-state HTML contains substring `apps.calbar.ca.gov/attorney/Licensee/Detail/` (deep link via `BAR_LOOKUP_URLS.CA.detail(barNumber)`) AND does NOT contain `LicenseeSearch/QuickSearch` (the base URL would defeat the methodology proof); (b) no-match-state HTML contains substring `apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch` (defendant doesn't have bar_number to deep-link with) AND does NOT contain `Licensee/Detail/`.
42. **Fair-report public route exists + renders (NEW v2.4 per Dreyer WARN #2).** (a) `test -f src/app/legal/fair-report-privilege/page.tsx` exit 0; (b) `test -f content/legal/fair-report-privilege.md` exit 0; (c) Playwright smoke: `await page.goto('https://imnotanattorney.com/legal/fair-report-privilege'); expect(page.locator('h1')).toContainText('Fair Report')` (or equivalent dev-server `localhost:3000/legal/fair-report-privilege` for CI); (d) page contains substring "California Civil Code § 47" (matches T0b memo + SC #14). Closes the dead-link surface where IB disclaimer would 404 on click.
43. **test_run_id rule compliance — justified marker (NEW v2.4 per Code WARN).** Per `~/.claude/rules/drafts/test-isolation.md`, test files writing to Supabase tables MUST satisfy one of: withTestTx, newTestRunId marker, `test-isolation-justified: <reason ≥15 chars>` comment, OR `test-isolation-na: <reason>` comment. T3.1.2 e2e test file SHALL contain at line 1-20 the comment: `// test-isolation-justified: e2e fixture uses CV-allowlisted email pattern + sentinel eval_results gate_passed:false + reaper safety net; cases/orders test_run_id columns not yet present on this branch (test-isolation infra is on a separate worktree planned for 2026-05).` Verifiable via `grep -F 'test-isolation-justified:' supabase/functions/evaluate-report/__tests__/attorney-discipline-e2e.test.ts` exit 0.

## Worktree Boundary (v2.3)
Run in isolated worktree at `.claude/worktrees/worry-attorney-discipline/` off `origin/master` (currently `81721f28`). Touch only:
- `supabase/migrations/20260425c_attorney_discipline_rls.sql` (new, T0a — renamed from `20260425a`)
- `supabase/migrations/20260425d_attorney_discipline_test_fixtures.sql` (new, T1.3 — renamed from `20260425b`)
- `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` (new, T0b)
- `supabase/functions/generate-report/lib/attorney-discipline.ts` (new, T1.2 — RPC caller)
- `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (new, T2.2 — markdown emitter)
- `supabase/functions/generate-report/lib/section-anchors.ts` (new, T2.1 — Deno-side anchor constants)
- `supabase/functions/generate-report/lib/banned-phrases-list.ts` (NEW v2.3, T3.3 — canonical Deno-readable list)
- `src/lib/intelligence-brief/attorney-discipline-disclaimer.ts` (new, T3.2 mirror — DISCLAIMER_VERBATIM constant)
- `supabase/functions/generate-report/__tests__/attorney-discipline.test.ts` (new, T1.4)
- `supabase/functions/generate-report/__tests__/upl-regex-panel.test.ts` (new, T3.1.1)
- `supabase/functions/generate-report/__tests__/attorney-discipline-guard.test.ts` (new, T4.5b)
- `supabase/functions/generate-report/__tests__/render-attorney-discipline-lint.test.ts` (NEW v2.3, T4.4b — XSS centralization lint)
- `supabase/functions/generate-report/__tests__/attorney-discipline-fair-report-paths.test.ts` (NEW v2.3, T4.5c)
- `supabase/functions/generate-report/__tests__/attorney-discipline-common-name.test.ts` (NEW v2.3, T4.5d)
- `supabase/functions/generate-report/__tests__/fixtures.ts` (new — fixture constants)
- `supabase/functions/evaluate-report/__tests__/attorney-discipline-e2e.test.ts` (new, T3.1.2 — Deno test)
- `supabase/functions/__tests__/rls-attorney-discipline.test.ts` (new, T4.6 — anon + RPC permission + pg_policies posture)
- `supabase/functions/generate-report/index.ts` (modify — caller-scope wiring at line 5045-5046 + slot in sections array between line 7438 and 7439 per T2.4 v2.3 REWRITE)
- `src/lib/intelligence-brief/prompts.ts` (modify — re-export `BANNED_PHRASES_LIST` from canonical Deno-side file per T3.3)
- `src/lib/intelligence-brief/__tests__/disclaimer-banned-phrases.test.ts` (new, T3.2 Node-side)
- `src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts` (new, T3.4 Node-side bidirectional)
- `src/lib/intelligence-brief/render.ts` (OPTIONAL modify — dev-tool parity per T2.4; not blocking)
- `src/lib/intelligence-brief/section-anchors.ts` (OPTIONAL new — Node-side parallel mirror with parity test, per T2.1)
- `scripts/reap-attorney-discipline-fixtures.mjs` (NEW v2.3 per Sec CRIT #2 — CI `if: always()` cleanup safety net)
- `scripts/verify-t0c-preflight.mjs` (NEW v2.3 per SC #25 — verifier script for sibling-PR pre-flight artifact)
- `.github/workflows/attorney-discipline-e2e.yml` (NEW v2.3 — CI path-gated job for T3.1.2 e2e + reaper)
- `src/app/legal/fair-report-privilege/page.tsx` (NEW v2.4 per Dreyer WARN #2 — public route for "Why we can show this" link; T2.6)
- `content/legal/fair-report-privilege.md` (NEW v2.4 per Dreyer WARN #2 — sanitized public-facing memo body, sourced from T0b internal memo)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire.md` (this file)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire-findings.md` (rounds findings, new)
- `docs/plans/2026-04-25-worry-attorney-discipline-wire-rounds.md` (per-round log, new)

**Pre-execution check (T0c, restated here)**: run `gh pr list --repo rahim0kapadia/ImNotAnAttorney-web --state open --json number,headRefName,files --limit 50` immediately before `git worktree add`. Abort with named conflict if any open PR's `files[]` contains: `supabase/functions/generate-report/index.ts`, `src/lib/intelligence-brief/prompts.ts`, `src/lib/intelligence-brief/render.ts`, or any `supabase/migrations/20260425c_*.sql` / `20260425d_*.sql`. As of 2026-04-25: PRs #102 (score) and #133 (NYPD CCRB) are open — neither hits the four blocking paths above (verified via JSON grep).

Do NOT touch sibling-owned files: anything modified in any open sibling PR.

## Phase 1.1b — Case Decoder integration (deferred plan, queued)
After v2 ships:
- Audit `src/lib/cron/batch-poller.ts:202-238` to find the post-Opus markdown injection seam.
- Add a CD-side mechanical render appended to `cleaned` markdown before `renderReportHtml(cleaned, meta)` call.
- Verify CD intake (`src/app/api/intake/route.ts`) collects `attorney_name` (audit needed; v2 does not assume).
- Tier-monotonicity: CD section shows `current_status` + lookup link only (no event table); IB shows full table. (Dreyer WARN #3.)

This is a separate `/worry-to-pristine` invocation, not part of v2.
