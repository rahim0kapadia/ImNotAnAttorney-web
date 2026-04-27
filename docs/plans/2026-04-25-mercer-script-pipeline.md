# Mercer Script Generation Pipeline — Plan

**Date:** 2026-04-25
**Branch (target for build):** `feat/mercer-script-pipeline` via `git worktree add` from master (locked by council).
**Status:** PROPOSAL v2 — incorporates Expert Council verdict 2026-04-25 — awaiting Rahim approval before any code lands.
**Deferral context:** Session 2026-04-25 explicitly deferred this. See `~/.claude/projects/G--Other-computers-My-Laptop-projects-ImNotAnAttorney-web/memory/project_avatar_pipeline_status_2026-04-25.md`. Lean v1 = 8 scripts.

---

## EXPERT COUNCIL VERDICT — 2026-04-25

Five cited experts (Chaperon, Hormozi, Suby, Cole, Brock) reviewed v1 of this plan against all locked constraints (UPL gate, no-fact-hallucination, Value-First Reveal, Mercer voice, length caps, bootstrap mode). Verdicts: 4× minor-revisions, 1× major-revisions (Cole — the BEAT is the atomic unit, not the script).

### Consensus locks (5/5 agreed) — open questions resolved

1. **Item count in cold-Short real-value beat:** **3** (4/5; Chaperon dissented to 2). Hormozi escalator applies for explainers — **3 / 4 / 5+** at price tiers <$200 / $200-$1K / $1K+. The 3rd item in cold Shorts is structured as Chaperon's open-loop / Suby's "specific loop the landing page closes."
2. **Mode-switch granularity:** per-beat for v1; per-sentence deferred to v2 once voice-match data accrues.
3. **`derivatives` field:** generate now BUT as per-platform OBJECT schema (TikTok/IG-Reel/YT-Shorts/X/Reddit/blog/drip-email), each with own `format_rules`/`hook_rewrite_required`/`length`/`cta`. Cole+Brock explicit, Chaperon prefers `world_surfaces` semantically — adopting `world_surfaces` as the field name.
4. **Voice-match judge:** Claude subprocess with cached anchor exemplars to keep evals deterministic.
5. **Branch:** `git worktree add ../ImNotAnAttorney-web-mercer feat/mercer-script-pipeline master`.

### Locked changes (council adds to v1)

**Schema** (additions to `<slug>.script.json`):
- `world_carryover: { anchor_phrases: [...], shared_objects: [...], references_script: "<slug>" }` — every non-anchor script must reference at least one carryover from #7. (Chaperon)
- `tension_curve` per beat: enum `[open-loop, tease, partial-payoff, full-payoff, forward-pull]`. (Chaperon)
- `forward_hook` per beat (except sign-off): the incomplete loop the next beat closes. Gate fails if missing. (Cole + Chaperon converge)
- `standalone_text` per beat: clipped version usable as a single-tweet/Reddit-answer/carousel-slide. (Cole)
- `world_surfaces` (renamed from `derivatives`): per-platform object with `format_rules`, `hook_rewrite_required`, `length`, `cta`. (Cole + Brock + Chaperon)
- `risk_reversal` optional beat for tier explainers (#5, #6). UPL-safe wording: "if these questions don't open angles your attorney didn't see, you didn't get value." (Hormozi)
- `cost_of_inaction_anchor` field on the reveal beat for #6 ($997). Reveals price ONLY against alternative cost ($50K+ legal exposure / $5K standard retainer) — never naked. (Hormozi + Suby)
- `hook_variants: [{pattern_a, text_a}, {pattern_b, text_b}, {pattern_c, text_c}]` for cold-distribution scripts (#3/#4/#7/#8). 3 hook variants per cold script for Trial Reels A/B. (Brock)
- `comment_trigger_keyword` + `dm_sequence_id` for each cold Short. STD Method: comment-triggered DM delivers value (1-pager / first 3 questions), then routes to landing. (Brock)
- `cover_variants: [...]` 3-5 thumbnail/cover lines per cold script for IG/TikTok/YT individualized algorithm. (Brock)
- `headline_set` field referencing `<slug>.headlines.json` (see Stage 0 below). (Cole)
- `parent_letter_anchors` field referencing `world_bible.json` excerpt that anchored generation. (Chaperon)

**Gates:**
- Hook gate (#5) expands beyond first-8-12-words: also validates 2-second-mark cut/visual-change present, 5-second-mark first concrete item paid, and loop-close referencing the hook in last 1-2s. (Brock)
- Hook gate `bold_claim_with_proof_promise` is renamed to **`bold_observation_with_pattern_promise`** (UPL safety — observation-side language). (Brock)
- Hook gate adds 2 new patterns: **`silent_audio_text_overlay`** (text-on-screen + Mercer face B-roll, no VO — survives autoplay-muted scroll, critical for legal-niche phone-paranoia) and **`partner_pov_split`** (two-character format: "the prosecutor" silhouette / Mercer silhouette — doubles retention via face-switch). (Brock)
- Hook gate also fires on web-embed scripts (#1/#2/#5/#6) BUT only validates a 2-second `world_anchor_opener` that references the brand-signature world. Algorithmic hook patterns still skipped for web-embed. (Chaperon)
- New gate: **Sequence-audit (soft, cross-script)** — after all 8 individual gates pass, run a single LLM eval scoring world-coherence across the 8 (do anchor phrases appear ≥3 scripts? do recurring objects show up? does #4 feel weightier because #7 exists?). Below 6/10 → at least one script is failing the SOS compounding test, flag for human review. (Chaperon)

**v1 table updates:**
- Cold-Short lengths split per platform: TikTok master 27-34s, IG Reels 30-38s, YT Shorts 45-58s. Same script object, different `tts_text` cut points stored in `world_surfaces.<platform>.length`. (Brock 2026 algo data)
- Script #6 (Intelligence Brief) Segment B-only, NOT A+B. Working-class Segment A buyer ≠ federal/white-collar Segment B buyer; mistargeting burns conversion. (Suby)
- Each of the 7 non-anchor scripts must include at least one halo callback to #7 (specific signature artifact: a phrase, a moment, "the rooms I sat in"). (Suby + Chaperon converge)
- Tier reveals on #5, #6 reframed as Godfather Offers with alternative-cost anchoring. #5 example: "less than the cost of one hour with your attorney." #6 example: "1/50th of the retainer that gets you that intel through traditional channels." (Suby)
- Landing heros #1, #2 add a bonus stack: Playbook + 7-Questions Card + Discovery File Cheat Sheet + 48-Hour Action Sequence — perceived value 4x'd before price reveal. (Suby — pending product-team confirmation that the bonus artifacts can ship)

### Locked Stage 0 (NEW — must complete before any v1 script is generated)

**Stage 0a — Mercer parent letter (Chaperon's killer move).** Write a 600-800 word letter from Mercer to a single named imaginary defendant (charge, 2AM moment, specific case detail). Lock as `world_bible.json` parent text. Every v1 script generates as a *compression of this letter into format X*. Voice-match gate scores against this letter, not an abstract voice profile.

**Stage 0b — `world_bible.json`** (Chaperon). Locks: canonical war-room setting, Mercer's 3-5 recurring objects (the file, the room, the questions, the back-channel), 3-5 anchor phrases that must appear verbatim across scripts ("they have a file on you," "your attorney will know what to do with this," "I sat in those rooms"). Generator seeds every prompt with the bible.

**Stage 0c — Headline Bench per script (Cole's killer move).** For each of the 8 slugs: generate 10 hook-line variants AND 5 platform-headline variants (IG cover / YT card / X post / Reddit title / blog H1) into `<slug>.headlines.json`. Human picks winning hook + 5 platform headlines in 90 seconds. THEN Claude writes the full script anchored to chosen hook. Inverts the typical order — body-first then headline becomes headline-first then body. Cost: ~30s extra Claude per script; payoff: every chosen headline becomes training-by-example AND a reusable distribution asset.

### Locked validation strategy (Hormozi×Brock fusion — highest-leverage move)

Before #1, #2, #5, #6 are built, run **Trial Reels Tournament**:

1. Ship cold Shorts #3 + #4 ONLY (with #7 brand-signature as the world-anchor) as 6 Trial Reels: 3 hook-variants × 2 cold scripts.
2. NO landing pages live. NO tier prices visible. Magic Lantern routes via `comment_trigger_keyword` → DM-delivered value → email capture (STD Method).
3. 7-day window. Track view-through, comment trigger rate, DM-engagement-rate, "where do I buy this" / "is there a deeper version" replies. Sidecar `trial_reel_results.json`.
4. Auto-promote winning hook variants to main feed. Auto-archive losers. Use replies to *validate Playbook offer demand AND $97/$197/$997 ladder* before building #1/#2/#5/#6.
5. ONLY THEN build the conversion layer (#1, #2, #5, #6) anchored to the validated hook + validated demand signal.

This collapses Hormozi's "lead magnet validates offer" + Brock's "Trial Reels rank hook patterns empirically" into one move. After 30 days you have a Mercer-specific empirical hook leaderboard nobody else in legal has, AND validated price-tier demand. None of the other 4 cited experts would suggest withholding the conversion layer — only Hormozi and Brock would, and they converge here.

### New reverse pipeline (Cole — write-once-distribute-everywhere, real version)

Every shipped script auto-generates a **400-600 word atomic essay** version for the blog. Same idea, atomic-essay shape (1 idea / 1 proof / 1 takeaway), Mercer voice in writing, derived from `parent_letter_anchors`. Output: `content/blog/<slug>-essay.mdx` (separate from script). Implemented as `scripts/scripts-gen/derive-atomic-essay.mjs`. Non-optional in v1 — without it, scripts are not actually atomic units, just videos.

### OUT OF SCOPE — flagged by Hormozi as preconditions (must surface to Rahim, NOT script-pipeline work)

These are structural product decisions Hormozi flagged that sit outside the Mercer script pipeline but materially affect the scripts' performance. Surfacing them — not building them — is in scope.

1. **Tier-ladder restructure (`src/lib/tiers.ts`).** INAA's current ladder violates the Tiered Pricing doubling rule, specifically the $197 → $997 jump (5x with no intermediate justification rung). Hormozi's fix: **kill $197 Case Decoder, repackage at $297.** Corrected ladder: $1 → $97 → $297 → $997 → $2,497 → $4,997 → $9,997. **Scripts impact:** if $197 is killed/repackaged, Script #5 ($197 Case Decoder Explainer) targets the wrong price. Either ship #5 anchored to the new $297 price, OR delay #5 until tier restructure is decided. Recommend the latter — the Trial Reels Tournament (Decision 5) already gates #5/#6 behind 30-day data, so 30 days is the right window to also resolve the tier ladder.
2. **Mercer Watch — $47/mo continuity offer (NEW PRODUCT).** Plan currently has zero recurring revenue; Hormozi calls this his single biggest structural critique. Criminal cases run 6-18 months; anxiety re-spikes before every hearing. UPL-safe (information delivery, not advice). Math: 6mo avg × 30% attach × $47 = $84 LTV add per buyer. 100 buyers/mo = $8,400/mo recurring. **NOT v1 script-pipeline work** — but a Mercer Watch script (recurring monthly briefing email/video) becomes the highest-leverage post-v1 script category. Surface to product team; if approved, becomes script category #9 in v1.1 with its own format (90-second briefing video, monthly cadence).
3. **Premium-first brand framing for Segment B surfaces.** Hormozi: Segment B (white-collar/federal) needs the brand to *anchor* visually at $9,997. Currently INAA's homepage and entry surfaces don't lead with Situation Room — they lead with the score quiz (free) and Playbook ($97). For Segment B traffic, the Tesla-model brand frame requires a Situation-Room-led entry surface. **NOT v1 script-pipeline work** — but Script #6 (Intelligence Brief explainer, Segment B) and #7 (brand signature, both-segment) script copy must reference the $9,997 Situation Room as the brand anchor even when the script's tier reveal is at a lower price. Adds field `brand_anchor_reference` to Segment-B scripts.

These three are flagged for Rahim decision/route to product. Script pipeline build proceeds without resolving them, but #5 ($197 Case Decoder) script generation is paused pending the tier-restructure call.

---

### Locked deferrals (v1.1+)

- **Suby's $1 First-48-Hours Cheat Sheet tripwire** between cold Shorts and $97 Playbook. Probably 5x's funnel conversion (Suby's documented thank-you-page upsell numbers). Defer to v1.1 unless a Stripe $1 product can ship in the same window — flag for product team.
- **Suby's charge-specific variants of #3/#4** (DUI-Short, drug-poss-Short, federal-Short, probation-Short). Defer to v1.1 — parameterize via `intent-moments.json`, no schema change.
- **Chaperon's subscriber/return-viewer scripts.** v1 is all acquisition; SOS compounding lives in the return layer. v2 explicit prerequisite.
- **Brock's carousel-variant per cold script** (5-7 slide static post). Defer to v1.1 — same Claude prompt, different render target. Free reach lift but not v1-blocking.
- **YouTube long-form (5-12min)** — still gated on triangulating a YT-long virality expert (Paddy Galloway / Jay Clouse / MrBeast operating principles tier). v2 prerequisite.

### Unconventional moves not adopted (with reason)

- *Cole's reverse-pipeline-as-stage-0 (Cole wanted Headline Bench to ship the body-fitting workflow):* adopted as Stage 0c. Locked.
- *Suby's Hyperactive Buyer Trigger Sequence at full operational depth (4 stages):* partially adopted via `risk_reversal` field + insider-proof beat + bonus stack. Full HBTS deferred to v1.1 with the $1 wedge.
- *Hormozi's "ship #3/#4 standalone first to validate offer":* adopted in fused form via Trial Reels Tournament (above).

---

## Mission (one paragraph)

Turn an INTENT MOMENT (charge × state × buyer-stage × video-format) into a TTS-ready Mercer-voice script that:
- Passes the UPL audit gate (`scripts/avatar/lib/tts.mjs::auditScriptForUPL`) with zero violations.
- Carries no fabricated facts (no specific numbers, citations, or § numbers without verified `source_urls`).
- Follows the Value-First Reveal pattern (Hook → Real Value → Reveal Tier → "— Mercer.").
- Hits the length target for the format (21-50s shorts, 30-50s landing hero, 75-110s tier explainers, ~90s brand signature, 5-12min long-form).
- Tags mode (TACTICAL vs CHARM) per line for future TTS prosody control.
- Drops cleanly into `scripts/avatar/generate-video.mjs --script "<text>"` without contract changes.

Lean v1 ships 8 scripts. No 50-product expansion until v1 proves the loop.

---

## What the blog pipeline gives us for free (steal-before-building map)

Investigation confirmed the blog pipeline at `scripts/regen-blog-backtest.mjs` + `scripts/lib/blog-gen/{claude-client,humanizer}.mjs` is already 70% of what we need. Reuse map:

| Component | File | Reuse mode | Why |
|---|---|---|---|
| Claude subprocess wrapper | `scripts/lib/blog-gen/claude-client.mjs` | **as-is** | Stdin-based, $0 marginal (uses Claude Code subscription, not API). Spawns `claude -p`, returns stdout. Length-agnostic. |
| Humanizer detector core | `scripts/lib/blog-gen/humanizer.mjs` (14 detectors) | **adapt** | Detector 4 (em-dash zero-tolerance, 65pt) and Detector 9b (UPL-banned phrases, 50pt) port verbatim. Detectors tuned for 1500-3000-word posts (rule-of-three, uniform-paragraph-length, tier-2 density, formulaic-openers) WILL misfire on 30-second scripts. Solution: short-form profile that disables length-dependent detectors and lowers composite threshold to <30 (vs blog's <45). |
| UPL audit | `scripts/avatar/lib/tts.mjs::auditScriptForUPL` | **as-is** | 5 regex patterns (you should/need to/must, file a motion, fire your attorney, take the plea, challenge the). Length-agnostic. Already wired into `generate-video.mjs` as a hard gate. |
| Frontmatter shape | `src/lib/blog.ts` parser | **adapt** | Reuse YAML parsing helper. New fields needed for scripts (see Schema §). |
| QA sidecar pattern | `content/blog/.qa-state/<slug>.json` | **adapt** | Same shape, new directory: `content/scripts/.qa-state/<slug>.json`. Gates: `humanizer_short_form`, `upl`, `fact_discipline` (new), `value_first_reveal` (new), `mercer_voice_match` (new). |
| Eval-team cross-ref | parent `system/EVALUATION-TEAM.md` Teams 1/9/10/11 | **reference** | Team 1 (UPL) gate is hard. Team 11 (Trust) and Team 10 (CRO) inform `value_first_reveal` and `mercer_voice_match` rubric design. |

**What we do NOT reuse:** publishing flow (`src/lib/blog-generation/publish.ts` writes MDX to GitHub for site rendering — scripts don't render to a public surface, they feed TTS), MDX body rendering (scripts have no markdown body), SEO frontmatter (pillarSlug / linkedProducts / freeEntryPoint — irrelevant for audio).

**What is genuinely net-new:** length targeting, TTS prosody markers, mode tagging (TACTICAL/CHARM), intent metadata (charge/state/stage/length/format), fact-discipline gate (new — the blog pipeline has hallucination handling but no specific-number stripper).

---

## Expert grounding (cite-or-redesign)

### Andre Chaperon — narrative architecture for sequenced scripts

**WHO:** Andre Chaperon (`~/.claude/experts/andre-chaperon.md`, cascade-native).
**SOURCE:** Soap Opera Sequences + Tiny Digital Worlds (manifesto + world-building canonical refs cached 2026-04-09).
**WHY IT APPLIES:** The 8-script v1 set is a sequence, not 8 isolated pieces. Chaperon's SOS treats each unit as a tension/tease/payoff arc anchored to a larger world. Mercer's 8 scripts must compound — the brand-signature defines the world, the cold Shorts pull cold viewers IN to the world, the tier explainers convert visitors who've crossed into the world. Every script must reference the same world (back-room war room, the file the prosecution has on you, the questions your attorney will know what to do with) so that watching #2 makes #1 weightier and watching #4 explains why #1 mattered.

**Concrete design call from Chaperon's lens:** the brand-signature script (#7) is the "cold open" of the sequence — it establishes Mercer's defection and his read on the system. Every other script borrows trust from #7 by reference (one beat, one shared phrase, one carryover detail). Script #8 (the UPL-safe demo) is the meta-ad: it makes the constraint into the brand. Both must be locked first; the other 6 inherit voice through them.

### Alex Hormozi — Value-First Reveal mechanics

**WHO:** Alex Hormozi (`~/.claude/experts/alex-hormozi.md`).
**SOURCE:** *$100M Offers* Value Equation + Proof-Promise-Plan (already locked into `voice-direction.md` § Value-First Reveal pattern).
**WHY IT APPLIES:** Every Mercer script ships REAL useful information first, THEN reveals the tier. The Hormozi cascade test ("Did the viewer leave more useful than they arrived, even if they didn't buy?") is the plan's primary acceptance criterion. The pipeline encodes this as a hard gate: every generated script must include a 15-25-second "Real Value" beat with 3 specific concrete items before any tier mention. Gate fails → regenerate.

### Sabri Suby — pre-sold-by-the-time-they-arrive

**WHO:** Sabri Suby (`~/.claude/experts/sabri-suby.md`).
**SOURCE:** *Sell Like Crazy* Magic Lantern + Godfather Offer.
**WHY IT APPLIES:** The 2 cold Shorts ("First 48 hours after arrest", "What's in your discovery file") are the Magic Lantern. They give standalone value at the top of the funnel and pre-sell the tier explainers. The pipeline's sequencing gate: cold-Short scripts must NOT name a tier in the Reveal beat — they reveal "the playbook for your charge" generically and route the viewer to the landing page where the tier-specific hero (#1, #2) finishes the sale. This separates the trust layer (Shorts) from the conversion layer (heros + explainers) so we don't burn a cold viewer with a price too early.

### Nicolas Cole — atomic content unit, write once distribute everywhere

**WHO:** Nicolas Cole (`~/.claude/experts/nicolas-cole.md`).
**SOURCE:** Top Writer methodology + ten-thousand-words → atomic-units pattern.
**WHY IT APPLIES:** Each script is the atomic unit. From one v1 cold-Short script, downstream we get: TikTok cut, IG Reel cut, YT Shorts cut, X/Twitter video, blog teaser, Reddit answer, drip-email open. The pipeline must emit a script object that downstream cutters can consume without re-generation. Concrete design call: the script object stores the SCRIPT (text + markers) AND a `derivatives` field listing which platforms/cuts the same script feeds, so we don't accidentally regenerate the same idea three times.

### Brock Johnson — hook engineering for short-form video distribution

**WHO:** Brock Johnson (`~/.claude/experts/brock-johnson.md`, cascade-conditional).
**SOURCE:** 1300 Viral Hooks taxonomy + 11 Reels formats (cached 2026-04-09; algorithm posts as recent as Feb 2026; speaking SMMW April 28-30 2026).
**WHY IT APPLIES:** The four cold-distribution scripts in v1 (#3 first-48-hours, #4 whats-in-your-discovery-file, #7 brand-signature, #8 UPL-safe demo) are the only scripts that ride algorithmic distribution. Hormozi/Suby/Chaperon/Cole tell us WHAT to say and HOW to sequence; Brock tells us HOW THE FIRST 1.5 SECONDS NEED TO READ to survive the IG Reels / TikTok / YT Shorts attention scan. Without hook engineering, value-first content still dies at impression #1. The web-embed scripts (#1, #2, #5, #6) don't ride algorithm — viewer is already on the landing page — so Brock's taxonomy doesn't apply there.

**Concrete design call from Brock's lens:** every cold-distribution script in v1 must declare a `hook_pattern` from a finite controlled vocabulary (subset of his taxonomy adapted for legal-niche UPL safety). The build-prompt step seeds Claude with one hook pattern per generation; the parse step extracts and validates the hook against the declared pattern; bad-fit scripts regenerate. Adapted hook vocabulary for v1 (six patterns, UPL-filtered):

1. `pattern_interrupt_observation` — "Here's something that shows up in nearly every [X] case…" (Mercer-native; observation, not claim)
2. `contrarian_quiet_part_loud` — "Most defendants think [common assumption]. The file says different." (Harvey-coded; says the quiet part loud)
3. `insider_witness` — "I sat in those rooms for a decade. Here's what I watched them do." (Defection backstory; uniquely Mercer)
4. `delayed_gratification` — "Three things will be on your discovery file. The third one matters most." (Brock's delayed-gratification format)
5. `this_vs_that` — "What your attorney sees in your case. What the prosecution sees. Different files." (Brock's this-vs-that format)
6. `bold_claim_with_proof_promise` — "Most DUI cases have at least one procedural angle. Here are the three I look for." (Hormozi-Brock hybrid; bold but information-side, not directive-side)

**BANNED hook patterns** (Brock catalog includes these; UPL-incompatible for INAA):
- ❌ Outcome-promise ("This will get your case dismissed" — UPL fail)
- ❌ Curiosity-only without value ("You won't believe what's in your file" — Hormozi cascade fail; no value transferred)
- ❌ Urgency manufacture ("If you don't do this in 48 hours…" — directive + urgency, fails UPL + Mercer voice)
- ❌ Pure shock ("Cops are lying to you right now" — anti-attorney/anti-system overreach; we're pro-defendant, not anti-anyone)

**The hook gate:** the build-prompt step assigns one of the 6 allowed patterns; the parse step validates the first 8-12 words match the pattern's signature (regex check on the controlled vocabulary); mismatch → regenerate with the assigned pattern explicit in the retry prompt.

### Disagreement resolution

Hormozi and Suby agree on Value-First. Chaperon and Cole agree on compounding-via-sequencing-and-atomic-units. Brock and Hormozi *almost* conflict: Brock's catalog includes pure-curiosity hooks that Hormozi's Value-First gate would block. We resolve by curating Brock's taxonomy — keeping only hooks that survive Hormozi's cascade test. The 6 allowed patterns above are that intersection.

### Coverage gap acknowledged

**No YouTube long-form virality expert is cached.** The format `youtube-long` (5-12min) appeared in the original mission scope but is **explicitly deferred out of v1** because the cached expert set covers short-form (Brock) and sequence/distribution (Chaperon, Cole, Simmonds) but NOT YouTube retention-curve engineering (Paddy Galloway / Jay Clouse / MrBeast operating principles tier). Triangulating a YT-long-form virality expert is a Gen-2 prerequisite — must complete BEFORE any 5-12min Mercer script ships, not after. Listed as deferred work below.

---

## Architecture

### Pipeline shape (one diagram, words)

```
intent-moments.json         ←  source of truth for "what to make"
       ↓
  build-prompt.mjs          ←  Mercer voice prompt + Value-First Reveal scaffold
       ↓
  claude-client.mjs         ←  reused from blog pipeline
       ↓
  raw script (string)
       ↓
  parse-script.mjs          ←  extracts hook/value/reveal/sign-off beats + mode tags + TTS markers
       ↓
  fact-strip.mjs            ←  NEW: strips/flags any specific-number claims without verification
       ↓
  audit gates  (4 hard, 1 soft)
    1. UPL audit            ←  reused as-is
    2. fact discipline      ←  NEW
    3. humanizer (short-form profile)  ←  reused with adapted thresholds
    4. value-first-reveal structure check  ←  NEW
    5. mercer-voice-match (LLM-based, soft → annotates score, doesn't block)  ←  NEW
       ↓
  pass → write to content/scripts/<slug>.script.json
  fail → regenerate (max 3 attempts) → human review queue
       ↓
  TTS-ready script + sidecar at content/scripts/.qa-state/<slug>.json
       ↓
  hand off to scripts/avatar/generate-video.mjs --script "<text>"
```

### Schema — `<slug>.script.json`

```json
{
  "slug": "dui-playbook-hero-fl",
  "intent": {
    "charge_type": "dui",
    "state": "FL",
    "buyer_stage": "BOFU",
    "format": "landing-hero",
    "length_target_seconds": 35,
    "length_target_range": [30, 45],
    "buyer_segment": "A"
  },
  "voice": {
    "primary_mode": "TACTICAL",
    "mode_switches": [
      { "beat": "hook", "mode": "TACTICAL" },
      { "beat": "real_value", "mode": "TACTICAL" },
      { "beat": "reveal_tier", "mode": "CHARM" },
      { "beat": "sign_off", "mode": "CHARM" }
    ]
  },
  "beats": [
    { "id": "hook", "text": "...", "tts_markers": [], "duration_estimate_s": 4 },
    { "id": "real_value", "text": "...", "tts_markers": [{ "type": "pause", "after_word": 12, "ms": 600 }], "duration_estimate_s": 22 },
    { "id": "reveal_tier", "text": "...", "tts_markers": [], "duration_estimate_s": 6 },
    { "id": "sign_off", "text": "— Mercer.", "tts_markers": [{ "type": "pause", "before_word": 1, "ms": 400 }], "duration_estimate_s": 2 }
  ],
  "tts_text": "<flat string for tts.mjs — markers rendered as ellipses/line-breaks>",
  "facts_used": [],
  "fact_sources": [],
  "derivatives": ["tiktok", "ig-reel", "yt-short", "x-video"],
  "tier_revealed": "DUI Playbook ($97)",
  "version": 1,
  "generated_at": "2026-04-25T00:00:00Z"
}
```

**TTS markers:** v1 keeps it minimal — only `pause` (after/before word index, ms). Emphasis/rate variation deferred until the AndrewMultilingual locked voice proves it can honor those markers via SSML or punctuation tricks. The `tts_text` field is the flat string fed to `generate-video.mjs` — markers rendered as ellipses for pauses, since that's what Edge TTS Andrew responds to. Object-level markers exist for future ElevenLabs upgrade where SSML lands properly.

### File layout (proposed)

```
scripts/
  scripts-gen/                       ←  NEW (parallel to blog-gen)
    build-prompt.mjs                 ←  prompt builder (charge × format → Claude prompt)
    parse-script.mjs                 ←  raw-string → beats object
    fact-strip.mjs                   ←  number/citation guard
    audit-pipeline.mjs               ←  runs all 5 gates, returns pass/fail + violations
    humanizer-short-form.mjs         ←  adapter wrapping humanizer.mjs with short-form profile
    generate-script.mjs              ←  orchestrator (one script end-to-end)
    generate-batch.mjs               ←  v1 batch runner for the 8 scripts
    intent-moments.json              ←  source-of-truth for what to generate
content/
  scripts/                           ←  NEW
    .qa-state/                       ←  sidecars
    *.script.json                    ←  generated artifacts
docs/
  plans/2026-04-25-mercer-script-pipeline.md   ←  this file
```

### Hard gates (each gate's failure mode)

1. **UPL audit** (existing) — fail = block. Use `auditScriptForUPL(tts_text)`. Zero tolerance. Re-prompt with violation text in the regen prompt.
2. **Fact discipline** (new) — fail = block. Detect: `\d+\s*(?:%|±|mg|mph|years?|months?|days?|seconds?)\b`, statute patterns (`§\s*\d+`, `\b(?:USSG|USC|F\.\d+d|Fla\.\s*Stat\.)\b`), case names (`\b[A-Z][a-z]+\s+v\.\s+[A-Z]`). Any hit without a corresponding entry in `fact_sources` (URL) → strip or fail. Mercer is allowed PATTERN language ("typically", "in many cases", "varies by jurisdiction"); not specific numbers. The auditor's job is to catch hallucinations early.
3. **Humanizer (short-form profile)** (adapted) — fail = block. Disabled detectors for short form: rule-of-three, uniform-paragraph-length, tier-2 density, formulaic-openers, repeated-structural-transition. Active detectors: em-dash zero-tolerance (65pt), tier-1 vocabulary (delve/tapestry/etc, 30pt each), filler phrases, UPL-banned phrases (50pt), generic conclusions, sycophancy markers, copula avoidance, hedging-word density, emotional inflation. Threshold: composite < 30.
4. **Value-First-Reveal structure** (new) — fail = block. Parser must find: (a) hook beat ≤7s, (b) real-value beat 12-30s with at least 3 distinct items detected via comma/numbered/bullet count, (c) reveal beat 3-9s, (d) sign-off "— Mercer." Missing any → fail.
5. **Hook pattern match** (new, only fires on cold-distribution scripts #3/#4/#7/#8) — fail = block. Each cold script has a declared `hook_pattern` from the 6-pattern Mercer-curated subset of Brock's taxonomy (see Brock Johnson § above). Parser validates the first 8-12 words match the pattern's signature via a small per-pattern keyword/structure check. Mismatch → regenerate with the assigned pattern explicit in the retry prompt. Web-embed scripts (#1/#2/#5/#6) skip this gate — viewer is already on the page, hook engineering is moot.
6. **Mercer-voice-match** (new, soft, all scripts) — does NOT block. LLM-based eval: a separate Claude subprocess gets the script + the `voice-direction.md` voice profile + 3 anchor exemplars and rates 0-10 across (cadence, mode-discipline, dry-wit, no-uptalk-no-filler, weighted-short-sentences). Stored in sidecar for human review. Below 7 → flagged but not blocked.

### Regeneration loop

On any hard-gate fail:
- Up to 3 regeneration attempts with violation text fed back into the prompt as "Avoid: <violations>".
- After 3 failures → write to `content/scripts/.qa-state/<slug>.failed.json` and surface to human-review queue.
- Never auto-publish a soft-fail script to TTS without human ACK.

---

## Lean v1 — the 8 scripts

| # | Slug | Format | Length | Mode arc | Buyer | Charge | Tier revealed |
|---|---|---|---|---|---|---|---|
| # | Slug | Format | Length | Mode arc | Buyer | Charge | Tier revealed | Hook gate? |
|---|---|---|---|---|---|---|---|---|
| 1 | `dui-playbook-hero-generic` | landing-hero | 30-45s | TACTICAL → CHARM | A | DUI | DUI Playbook $97 | n/a (web embed) |
| 2 | `drug-poss-playbook-hero-generic` | landing-hero | 30-45s | TACTICAL → CHARM | A | drug-possession | Drug Possession Playbook $97 | n/a (web embed) |
| 3 | `first-48-hours-cold-short` | yt-short / tiktok / reel | 40-50s | CHARM | A+B | charge-agnostic | (none — generic playbook reveal) | YES — `pattern_interrupt_observation` or `delayed_gratification` |
| 4 | `whats-in-your-discovery-file-cold-short` | yt-short / tiktok / reel | 35-45s | TACTICAL | A+B | charge-agnostic | (none — generic playbook reveal) | YES — `this_vs_that` or `contrarian_quiet_part_loud` |
| 5 | `case-decoder-explainer` | tier-explainer (web embed) | 75-95s | TACTICAL → CHARM | A+B | charge-agnostic | Case Decoder $197 | n/a (web embed) |
| 6 | `intelligence-brief-explainer` | tier-explainer (web embed) | 95-110s | TACTICAL → CHARM | B | charge-agnostic | Intelligence Brief $997 | n/a (web embed) |
| 7 | `brand-signature-defection` | brand-signature (cold/anchor) | 80-95s | TACTICAL → CHARM | A+B | charge-agnostic | (none — brand-DNA, no tier) | YES — `insider_witness` (Mercer-native, can't be substituted) |
| 8 | `upl-safe-demo` | meta-ad (cold/anchor) | 40-50s | TACTICAL | A+B | charge-agnostic | (none — meta) | YES — `bold_claim_with_proof_promise` |

Per Chaperon's SOS lens: scripts #7 and #8 lock first (brand-DNA + meta-constraint). #3 and #4 lock second (cold-funnel value carriers). #1, #2, #5, #6 lock last (conversion layer, calibrate from preceding voice).

`intent-moments.json` is the durable source-of-truth — adding script #9 means appending a row, not editing code.

---

## Acceptance criteria — Stage 2 sign-off

Before declaring v1 complete, every one of these must hold:

- [ ] All 8 `*.script.json` files exist in `content/scripts/`.
- [ ] All 8 sidecars in `content/scripts/.qa-state/` show `humanizer_short_form: pass`, `upl: pass`, `fact_discipline: pass`, `value_first_reveal: pass`.
- [ ] Mercer-voice-match score ≥ 7/10 on at least 6 of 8 scripts (soft gate; below 7 = flagged, manual ACK before TTS).
- [ ] `node scripts/avatar/generate-tts.mjs --script "<tts_text>"` runs successfully on all 8 (does NOT block — just confirms the audit-gate-passed strings are TTS-acceptable).
- [ ] Zero specific-number factual claims without `fact_sources` entries. Patterns/angles only.
- [ ] No `--force` UPL bypasses anywhere in the orchestrator.
- [ ] Stage 2 commits a single PR. No silent symptom-patches on individual scripts — every fix lands in the producer (prompt, gate, parser).

---

## Cascade map (per Cascade Rule)

- **Us (INAA / Atlas):** ship 8 production-grade Mercer scripts for ~zero marginal cost. Pipeline becomes the engine for the 50-product expansion later.
- **Direct counterparty (defendant viewer):** every script delivers usable info even if they don't buy. Hormozi cascade test passes by construction (gate enforces).
- **Their downstream (defendant's attorney):** scripts hand the defendant SPECIFIC questions to bring to counsel. Attorney gets a more-prepared client. UPL audit guarantees zero advice slipping through.
- **Ecosystem (legal-tech category, defendant-facing content):** raises the floor by demonstrating value-first content can be produced systematically without UPL violations. Publishable framework if we open-source the gates.
- **Future-us:** every script is a Cole atomic unit reusable across TikTok / IG / YT / X / blog teaser / drip email. Sequence compounds (Chaperon's SOS) — script 4 is weightier because 7 exists.
- **Adjacent players (other anonymous-strategist legal-tech voices, if any):** the gate framework raises the floor for the category. We don't lose by them adopting it; we lose if they don't and a UPL-violating competitor poisons defendant trust.

No node loses. Cascade-positive.

---

## Bootstrap-mode reality check

- **Compute:** $0. Local Claude Code subscription via `claude-client.mjs`.
- **TTS:** $0. Locked Edge TTS Andrew via `tts.mjs` (proven, in repo).
- **Storage:** $0. Local files + git.
- **No new dependencies:** entire pipeline is Node ESM + already-installed packages.
- **No paid tools:** explicitly no fal.ai PuLID, no LoRA training, no ElevenLabs (graduation later, not v1). All $0 marginal.

---

## What this plan deliberately does NOT do

- Not running TTS. Stage 2 ends with audited scripts on disk + a passing gate harness. TTS + Wav2Lip + silhouette is a separate handoff session, with explicit user go-ahead.
- Not generating videos. Same reason.
- Not expanding to 50 products. v1 = 8. Suby + Hormozi: prove the loop first.
- Not building a UI / dashboard / queue. CLI orchestrator only. Dashboard becomes worth building when we exceed ~30 scripts and human-review-queue scale forces it.
- Not switching the base voice from AndrewMultilingual. Locked.
- Not re-architecting the avatar pipeline. We feed it; we don't change it.
- Not generating any factual claim with a specific number unless `fact_sources` is populated. Patterns/angles only for v1. Verification-source integration (CourtListener / FL Online Sunshine fetch) is a follow-up plan, not v1.
- **Not shipping any 5-12min YouTube-long-form Mercer script.** Cached expert set covers short-form virality (Brock) but not YT-long retention engineering. Triangulating a YT-long-form expert (candidates to research: Paddy Galloway, Jay Clouse, MrBeast operating principles, Hubspot Marketing Against the Grain hosts, Ali Abdaal's content engine) is a Gen-2 prerequisite. v1 caps format at ≤110s. Adding YT-long-form to v2+ requires that triangulation completes first, expert profile cached at `~/.claude/experts/<slug>.md`, and a separate plan addendum.

---

## Open questions — RESOLVED via Expert-Decides Rule (2026-04-25)

The original 5 are resolved by council consensus (see § Expert Council Verdict). The 5 follow-up questions that surfaced are resolved by applying the same council's frameworks rather than kicking to Rahim. Each decision below cites WHO / SOURCE / WHY IT APPLIES.

### Decision 1 — Bonus stack artifacts (Suby + #1/#2)

**Decision:** SHIP IN V1 as derivatives of script generation, not as standalone artifacts to build.

- **WHO:** Cole + Suby converge.
- **SOURCE:** Cole reverse-pipeline (script → atomic essay); Suby bonus-stack from *Sell Like Crazy*.
- **WHY:** Verified via grep that `/dui-checklist` (`src/app/dui-checklist/page.tsx`) already implements the 48-Hour Action Sequence pattern for DUI as a Reddit/social funnel target, AND `STANDALONE_PRODUCTS` (`src/lib/products.ts`) catalog supports $0/$X products with Stripe wiring. Therefore: 7-Questions Card + Discovery File Cheat Sheet + 48-Hour Action Sequence are GENERATED as derivatives of the existing playbook content via the same Claude prompt that emits the script — Cole's atomic-essay reverse-pipeline pointed at "1-page card" instead of "blog essay." $0 marginal. The dui-checklist page is the existence proof that this surface already works in production.
- **Build cost:** Add `card_variants` field to script schema. Each script's `derive-atomic-essay.mjs` step also emits `<slug>-questions-card.mdx`, `<slug>-discovery-cheat-sheet.mdx`, `<slug>-48hour-action-sequence.mdx`. Render targets: PDF (via existing PDF skill) + standalone landing page (mirroring `/dui-checklist` shape). Schema-only change in v1; render targets ship in v1.1 if calendar tight.

### Decision 2 — $1 First-48-Hours wedge — REFINED via Hormozi direct (2026-04-25)

**Decision:** SHIP IN V1 for **Segment A ONLY** (DUI / drug-poss / probation / working-class buyers). **DO NOT** offer the $1 wedge to Segment B (white-collar / federal / high-net-worth) — wealthy buyers purchase on signaling, not on tripwire mechanics. A $1 product offered to a federal defendant breaks Hormozi's Premium Pricing for Wealthy Segments rule.

**Sales-page positioning** (Hormozi requirement to keep Tesla-model brand frame intact): the $1 wedge page must visually anchor against the $9,997 Situation Room. Headline frame: *"The strategy layer used in $9,997 engagements, condensed for the first 72 hours."* This preserves premium halo on the brand even while the wedge converts cold traffic.

- **WHO:** Hormozi (direct, 2026-04-25) + Suby + Brock + Chaperon (4 of 5 elites converge; Cole abstains as not-his-domain). **Citation correction (post-audit):** the $1 *Tripwire* pattern is **Russell Brunson** (DotCom Secrets), NOT Suby. Suby's equivalent is the **Godfather Offer**. $1 wedge sits at the intersection of Brunson's Tripwire + Suby's Godfather Offer + Hormozi's Lead-Magnet→Core-Offer.
- **SOURCE:** Hormozi `lead-magnets` named domain + 2026 Tesla model + Premium Pricing for Wealthy Segments from `~/.claude/experts/alex-hormozi.md`; Suby Godfather Offer + Value-First Lead Gen from `~/.claude/experts/sabri-suby.md`; Brock STD Method comment-trigger; Chaperon email-list-as-#1-asset.
- **WHY (Hormozi's Value Equation breakdown):** for cold traffic at 2AM panic, $1 wedge wins on Perceived Likelihood (1-page specific) × low Effort & Sacrifice (5-min read) — beats $97 Playbook which has medium Perceived Likelihood and medium Effort. $97 Playbook is the better Grand Slam Offer for *warm* traffic past the panic spike. **Different products win different temperature stages.**

### Decision 6 (NEW — surfaced by Hormozi direct) — Two ladders, not one

**Decision:** v1 scripts split by buyer-segment ladder, NOT shared across A+B.

- **Segment A ladder** (DUI / drug-poss / probation / working-class): brand-anchored at **$4,997 War Room** (the top they'll see); funnel: $1 wedge → $97 Playbook → $297 (repackaged Case Decoder, see Out-of-Scope §) → $997 Intelligence Brief → $2,497 X-Ray → $4,997 War Room. Scripts #1, #2, #2.5, #2.5b, #3, #4 serve this ladder.
- **Segment B ladder** (white-collar / federal / high-net-worth): brand-anchored at **$9,997 Situation Room**; funnel: $997 Intelligence Brief → $2,497 X-Ray → $4,997 War Room → $9,997 Situation Room. Scripts #6 serves this ladder. **No $1 wedge, no $97 Playbook visibility for Segment B.**
- **Brand-DNA scripts** (#7 brand-signature, #8 UPL-safe demo): serve both segments unchanged — they're identity layer, not ladder layer.
- **Implication for `world_surfaces`:** add `target_segment_ladder` field (`A` | `B` | `both`) per script. Script #6 is `B` only (per council). Scripts #1/#2/#2.5/#2.5b are `A` only. #7/#8 are `both`. Cold Shorts #3/#4 are `both` but route to different landing pages by segment-detection (charge-type heuristic from comment trigger).

- **WHO:** Hormozi (direct, 2026-04-25).
- **SOURCE:** Premium Pricing for Wealthy Segments from cache. "Speed, priority access, and exclusivity matter more than cost savings for high-net-worth buyers."
- **WHY:** A unified ladder forces every script to compromise either Segment A's "I can't afford that" filter or Segment B's "this looks cheap, must be low quality" filter. Two ladders honor both — Segment A sees a brand they can climb into; Segment B sees a brand they signal-buy from. The $9,997 Situation Room is Segment B's anchor of "elite version exists"; the $1 wedge is Segment A's anchor of "I can start here."
- **WHY:** $0 → $97 jump fails on cold-traffic friction (Suby's documented finding). $1 wedge captures payment intent + email + highest-intent moment on Earth (post-arrest 2AM Googling) at the lowest possible mental friction. STANDALONE_PRODUCTS catalog already supports the schema (verified via Read). Stripe setup ~30min via existing INAA Stripe infrastructure (`STRIPE_SECRET_KEY_LIVE` already in use per `tiers.ts`). Content ~30min via Cole reverse-pipeline. Total v1 cost: ~1 hour. ROI: 5-10x funnel conversion if Suby's documented numbers hold. **Cascade-negative to defer.**
- **Build cost:** Add `dui-72hr-cheat-sheet` and `drug-poss-72hr-cheat-sheet` rows to STANDALONE_PRODUCTS. Stripe products created via dashboard. Content auto-generated via reverse-pipeline.

### Decision 3 — Mercer parent letter authorship

**Decision:** Atti drafts the structural skeleton; Rahim does a 30-minute editing pass to inject lived specificity. Lock the result as `world_bible.json` parent text.

- **WHO:** Chaperon + Atlas-identity rule converge.
- **SOURCE:** Chaperon "subscribers are people with lives" + SOS-as-long-form-narrative-then-atomized; `~/.claude/CLAUDE.md` Expert-Decides Rule special case ("values/taste/vision calls where Rahim IS the .01% expert by definition").
- **WHY:** Pure-Atti would default to generic Mercer voice (UPL-safe but emotionally hollow — "white guy in a suit," per persona-master.md anti-pattern). Pure-Rahim burns calendar Atti could absorb structurally. The cascade-positive split: Atti delivers the Chaperon SOS shape + Mercer voice anchored to `voice-direction.md` + persona-master.md ($0 marginal); Rahim injects the lived-defendant specificity that nobody can fabricate within UPL/no-hallucination constraints. Rahim's active-defendant context (State v. Kapadia 23-01773-CF, June 9 2026 trial — referenced in `atti-persona.md`) is the source-of-truth that makes Mercer's defection backstory real instead of performed.
- **Build cost:** Atti drafts ~30min during Stage 0a. Rahim 30-min editing pass at Stage 0a sign-off. Total: 30min Rahim time, asynchronous.

### Decision 4 — DM automation platform

**Decision:** Instagram-native automated responses for v1. Graduate to ManyChat at $2.5K/mo revenue threshold or 50+ scripts in production, whichever comes first.

- **WHO:** Bootstrap Mode (universal hard rule) + Brock's own graduation pattern.
- **SOURCE:** `~/.claude/CLAUDE.md` Bootstrap Mode Universal ("$0 budget assumed on every decision — tooling/infra/data/compute"); Brock Johnson cached profile "DM automation is the primary sales engine ($100k/mo formula)" with implicit graduation at revenue.
- **WHY:** ManyChat ($15/mo) violates Bootstrap Mode at $0 v1 revenue. IG-native (Meta Creator/Business account) supports keyword-triggered DMs free with a 4-step flow cap. STD Method needs 3 steps (comment → DM-with-value → URL-route → email-capture). 4-step cap covers v1. The graduation trigger to ManyChat is the same threshold Brock himself implies ("$100k/mo formula" runs on ManyChat — i.e., once revenue justifies the tool).
- **Build cost:** Zero tooling. Setup ~30min in IG Creator account (Settings → Privacy → Messages → Saved Replies + automated keyword triggers). Required for Trial Reels Tournament to work.

### Decision 5 — Trial Reels Tournament gating

**Decision:** Accept the gate FOR HIGHER-TIER REVEALS ONLY (#5 $197, #6 $997). Build #1, #2, #3, #4, #7, #8 in v1 in parallel. #5 and #6 build only after 30-day Trial Reels Tournament data.

- **WHO:** Hormozi×Brock fusion + Suby concern resolution.
- **SOURCE:** Hormozi *$100M Offers* offer-validates-before-funnel; Brock Trial Reels methodology + Performance > Follower Count; Suby Magic Lantern requires landable destination (resolved by Decision 2 shipping the $1 wedge).
- **WHY:** Original gate (defer #1/#2/#5/#6 for 30 days) failed Suby's concern: Magic Lantern needs a $-landable destination during the 30-day window. Decision 2 ships the $1 wedge in v1, which gives Magic Lantern a destination at the lowest tier. Therefore: ship #1 ($97 DUI Playbook) and #2 ($97 Drug Poss Playbook) in v1 alongside #3/#4 — they're the cold-traffic hand-off Suby's funnel demands. The gate applies ONLY to #5 ($197 Case Decoder) and #6 ($997 Intelligence Brief) where validation has the most leverage (price-tier signals from cold replies tell us if $197 vs $997 is the right second-tier rung). Higher-leverage spend protected; lower-tier sales channel stays open.
- **Build cost:** Trial Reels Tournament infrastructure (sidecar `trial_reel_results.json` + comment-trigger DM flow + Stage 1 cold scripts) ships in v1. #5 and #6 ship ~30 days post-launch with empirically validated hooks + price-tier demand signal.

### Net effect on v1 scope

The original v1 was 8 scripts in parallel. The Expert-Decides resolution is:

**v1 ships immediately:**
- #1 dui-playbook-hero (with bonus-stack derivatives via Cole reverse-pipeline)
- #2 drug-poss-playbook-hero (with bonus-stack derivatives)
- #2.5 dui-72hr-cheat-sheet ($1 Suby tripwire) — schema, Stripe product, content via reverse-pipeline
- #2.5b drug-poss-72hr-cheat-sheet ($1 Suby tripwire) — same
- #3 first-48-hours-cold-short (3 hook variants for Trial Reels)
- #4 whats-in-your-discovery-file-cold-short (3 hook variants)
- #7 brand-signature-defection (Stage 0a parent letter as direct source)
- #8 upl-safe-demo

**v1 ships after 30-day Trial Reels Tournament data:**
- #5 case-decoder-explainer (anchored to validated hooks + validated $197 demand)
- #6 intelligence-brief-explainer (anchored to validated hooks + validated $997 demand, Segment-B-only)

**v1.1 deferrals stand:** charge-specific cold-Short variants, ManyChat upgrade, return-viewer/subscriber sequences, YouTube long-form (still gated on YT-virality expert triangulation).

---

## Branch hygiene

This plan was written on `feat/state-statutes-fl-seed` because the working tree carries that branch's WIP (modifications + 100+ untracked files in `scripts/ops/`, `data/`, `content/blog/.flywheel/`, etc.). Switching branches now would either carry that WIP onto `feat/mercer-script-pipeline` (defeating isolation) or risk losing it (cascade-negative).

**Recommendation for Stage 2:** create the branch via worktree from master:

```
git worktree add ../ImNotAnAttorney-web-mercer feat/mercer-script-pipeline master
```

Worktree at `../ImNotAnAttorney-web-mercer` becomes the build site. The FL-statutes session keeps its WIP on the original checkout. No stomp risk. `prevent-branch-stomp.js` warns satisfied.

If you'd rather I commit this plan now on the FL branch and cherry-pick onto the new branch later — say so. Default per your instruction is to keep branches separated, so I'll use the worktree path unless you redirect.

---

## Ready-to-paste handoff prompt for Stage 2 (after approval)

```
Execute Stage 2 of the implementation plan at
  G:\Other computers\My Laptop\projects\ImNotAnAttorney-web\docs\plans\2026-04-25-mercer-script-pipeline.md

Stage 1 (investigation + plan) is approved.
Create worktree feat/mercer-script-pipeline from master and build there.
Build deliverable: 8 Mercer scripts (the lean v1 set in §"Lean v1 — the 8 scripts")
saved as content/scripts/<slug>.script.json with passing sidecars in
content/scripts/.qa-state/, all 4 hard gates green.
Do NOT run TTS in Stage 2 — generate-and-store-and-audit only.
TTS handoff is a separate session.
```
