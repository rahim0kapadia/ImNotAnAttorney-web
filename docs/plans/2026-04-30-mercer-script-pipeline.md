# Mercer Script Generation Pipeline — 2026-04-30 Status & Delta

**Date:** 2026-04-30
**Status:** Plan v2 (`2026-04-25-mercer-script-pipeline.md`) verified intact against current code. **Ready for Rahim approval to begin Stage 2 build.**
**This file:** delta against v2 — what changed in the last 5 days, what gaps were surfaced today, what Stage 0 prerequisites must land before any script generates.

---

## Master spec (do not redraft)

The architecture, expert grounding, schema, gates, regeneration loop, lean v1 8-script set, segment-A vs segment-B ladders, Trial Reels Tournament gating, and all 6 council-resolved decisions live in:

`G:\Other computers\My Laptop\projects\ImNotAnAttorney-web\docs\plans\2026-04-25-mercer-script-pipeline.md`

This 2026-04-30 file does **not** restate that plan. It records what changed since 2026-04-25 and what must happen before Stage 2 can begin.

---

## Verification today (2026-04-30) — current code matches v2 plan assumptions

| Plan claim (from v2) | Verified today | Status |
|---|---|---|
| `scripts/avatar/lib/tts.mjs::auditScriptForUPL` exists, 5 regex patterns, length-agnostic | Read file. `auditScriptForUPL` at line 38, 5 patterns: directive `you should/need to/must`, `file a motion`, `fire your attorney`, `take the plea`, `challenge the`. Returns `{clean, violations}`. | OK — As described |
| `scripts/lib/blog-gen/claude-client.mjs` reusable — stdin-based, $0 marginal | Read file. Spawns `claude -p` with stdin pipe; strips `ANTHROPIC_API_KEY` to use CLI subscription auth. 10-min default timeout. Contract `callClaude({systemPrompt, userPrompt, ...})` returns `{text, usage, cost, model, latencyMs}`. | OK — As described |
| `scripts/lib/blog-gen/humanizer.mjs` 14 detectors, `compositeScore < 45` for blog-length | Read file. 14 detectors confirmed (tier-1 vocab, tier-2 density, filler phrases, UPL-banned 50pt single occurrence, sycophancy, generic conclusions, copula avoidance, hedging, emotional inflation, vague authority, repeated structural transition, em-dash zero-tolerance 65pt, rule-of-three, uniform paragraph length). Threshold confirmed `< 45`. | OK — As described — short-form profile + threshold `< 30` adapter still required as plan calls out |
| `scripts/scripts-gen/` + `content/scripts/` not yet created | Both directories absent. | OK — Stage 2 has not started — clean slate |
| `scripts/avatar/generate-video.mjs --script` exists as the integration target | `scripts/avatar/generate-video.mjs` listed in dir. (Contract not re-verified line-level today; v2 plan treats it as locked.) | OK — Present |

**Conclusion:** the v2 plan's reuse map is accurate today. No code drift in the 5-day gap. Build can proceed against the v2 spec without architecture rework.

---

## Gap surfaced today (NEW — must resolve before Stage 2)

### Stage 0 prerequisite: persona docs do not exist on disk

The v2 plan and `.claude/rules/brand-voice.md` reference `docs/brand/persona/persona-master.md` and `docs/brand/persona/voice-direction.md` as canonical sources for Mercer voice + Value-First Reveal pattern + TACTICAL/CHARM mode rules + UPL guardrail. **Neither file exists in this repo or in the parent `ImNotAnAttorney/apps/web/` repo.** Confirmed via `ls` + `Grep` for "Value-First Reveal".

The phrase IS named in `.claude/rules/brand-voice.md` under "HARD principle — Value-First Reveal" (cites Hormozi + Suby + the cascade test) — so the pattern has a one-paragraph anchor in the rules layer. But the full spec the `mercer-voice-match` gate scores against (mode-switch rules per beat, 3 anchor exemplars, per-beat structural template, the script-audit UPL gate writeup) is still uncodified.

**Why this matters:** v2's `mercer-voice-match` soft gate is implemented as a Claude subprocess with cached anchor exemplars. The anchor exemplars come from `voice-direction.md`. Without that file, the voice-match gate has nothing to score against — it would either pass everything or be tuned ad-hoc per script.

**Resolution (Stage 0 prerequisite, before any script generation):**

1. **Stage 0-prereq-A: Author `docs/brand/persona/persona-master.md`.** Locks Mercer name + visual + archetype + the UPL guardrail table from `.claude/rules/brand-voice.md`. ~60-90 min of writing — most content is already in `brand-voice.md`; this is reorganization + the durable canonical home for it.
2. **Stage 0-prereq-B: Author `docs/brand/persona/voice-direction.md`.** Locks the Value-First Reveal pattern (Hook → Real Value → Reveal Tier → "— Mercer."), TACTICAL vs CHARM mode rules + pronoun shifts, the script-audit UPL gate writeup, the 3 anchor exemplars used as voice-match cached references. ~60-90 min.
3. **Stage 0-prereq-C: Confirm `tts.mjs` line 3 reference resolves.** Currently a dead link (`See docs/brand/persona/voice-direction.md`). Goes live the moment 0-prereq-B lands.

**Owner pattern (Decision 3 from v2 plan):** Atti drafts structural skeleton; Rahim 30-min editing pass for lived specificity. Both files are values/taste/vision artifacts where Rahim *is* the .01% expert.

**Sequencing:** Stage 0-prereq-A/B/C must complete BEFORE Stage 0a (parent letter), 0b (world_bible.json), 0c (headline benches) — the v2 plan's existing Stage 0 work depends on locked persona docs.

### Other deltas (none material)

- No new expert triangulation since 2026-04-25. Council verdict (Chaperon, Hormozi, Suby, Cole, Brock) stands.
- No INAA-side product changes that affect script targeting. $197 Case Decoder still in current `tiers.ts`; the Hormozi-flagged tier-restructure to $297 remains an out-of-scope item for product team, with #5 still gated on the 30-day Trial Reels Tournament regardless.
- No new YT-long-form virality expert cached. v1 cap at <=110s per format remains.

---

## Build scope reaffirmation (no change from v2)

Lean v1 ships:
- **Immediately:** #1 dui-playbook-hero, #2 drug-poss-playbook-hero, #2.5 dui-72hr-cheat-sheet ($1 wedge, Segment A only), #2.5b drug-poss-72hr-cheat-sheet ($1 wedge, Segment A only), #3 first-48-hours-cold-short (3 hook variants), #4 whats-in-your-discovery-file-cold-short (3 hook variants), #7 brand-signature-defection, #8 upl-safe-demo.
- **After 30-day Trial Reels Tournament:** #5 case-decoder-explainer, #6 intelligence-brief-explainer (Segment B only).

Hard gates: UPL audit (existing), fact-discipline (new), humanizer short-form profile (adapted from blog), value-first-reveal structure (new), hook-pattern match for cold scripts (new). Soft: mercer-voice-match. All as v2.

---

## Cascade map (per Cascade Rule)

Inherited from v2 plan §Cascade map. No changes today. Surfacing the persona-doc gap is itself cascade-positive: future-us can't build the voice-match gate against missing files; locking the docs first protects every downstream script.

---

## Branch hygiene

Per CLAUDE.md and the user prompt:
- Sibling session is on `feat/state-statutes-fl-seed`. Do not share that branch.
- Working tree on this checkout reports `git status -sb` returning `fatal: bad object HEAD` (corrupted ref) — **flag to Rahim before any branch operation.**
- v2 plan recommends a worktree `feat/mercer-script-pipeline` from master from a healthy checkout. Same recommendation today, conditional on resolving the bad-HEAD state.

**No worktree or branch operation performed in this session.** Plan-only.

---

## Deploy-scope note

Per CLAUDE.md (2026-04-28 cutover): production deploys from `C:\Users\email\projects\ImNotAnAttorney\apps\web\`, not this repo. Implications for the script pipeline:

- `scripts/scripts-gen/` is a local-CLI orchestrator — does NOT need to deploy. Stays in `ImNotAnAttorney-web` for v1.
- `content/scripts/*.script.json` is generated artifact — also local until TTS run produces audio + video assets.
- `scripts/avatar/*` is local-only (TTS + Wav2Lip + silhouette generation). Not deployed.
- **Net:** the script pipeline is entirely a local-build subsystem. No mirror-to-monorepo step is needed for v1. Revisit when/if scripts feed a CMS or deploy artifact path.

---

## Approval gate — what Rahim is being asked to approve

**Approve the v2 plan as-is** (`2026-04-25-mercer-script-pipeline.md`) **plus the Stage 0 persona-doc prerequisite added by this 2026-04-30 delta.** That unlocks:

1. Stage 0 prereqs A/B (persona-master.md, voice-direction.md) — Atti drafts, Rahim 30-min pass.
2. Stage 0a/b/c from v2 (parent letter into world_bible.json into headline benches per script).
3. Stage 1 build of `scripts/scripts-gen/*` infrastructure.
4. Stage 2 generation of the v1 immediate-ship subset (6 scripts: #1, #2, #2.5, #2.5b, #7, #8) + 2 cold-Short hook-variant batches (#3, #4 with 3 hooks each).
5. Audit-only — no TTS, no video, no publish in this batch.

**Or amend** — surface the change you'd like to v2 or to this delta, and the next session will re-issue.
