# Anti-Hallucination & Data Integrity Audit, INAA Ecosystem

**Date:** 2026-04-06
**Scope:** Every documented anti-hallucination safeguard across the INAA ecosystem (parent project, web project, engine, focus on what should be enforced in the WEB pipeline)
**Status:** Inventory + enforcement gap analysis

---

## Legend

- **DOCUMENTED**, exists as a rule, persona, or template in markdown
- **ENFORCED**, wired into web pipeline as runtime code (prompt injection, post-gen validator, build-time check)
- **NOT ENFORCED**, guidance exists but the web pipeline does not check it at runtime
- **CRITICAL**, failure ships fabricated legal claims to a paying defendant (lives, freedom, sanctions)
- **HIGH**, failure ships incorrect/misleading-but-non-fatal output that damages credibility
- **MEDIUM**, failure produces lower-quality output but no direct user harm

---

## Section 1, Universal Prompt-Time Safeguards (defensive prompt engineering)

### 1.1 ANTI_HALLUCINATION_BLOCK (universal injection)

| Field | Value |
|---|---|
| **Guards against** | Fabricated case law, statutes, statistics, court procedures |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts` (lines 279-292) |
| **Enforcement** | ENFORCED, concatenated to system prompt on every Claude call (CD + IB), see lines 3117, 3188, 3833, 3970 |
| **Priority** | CRITICAL |
| **Rules covered** | (1) only cite cases you are CERTAIN exist with full citation, (2) only cite statute numbers you are CERTAIN of for jurisdiction or add `[VERIFY]`, (4) NEVER fabricate conviction rates / suppression rates / plea percentages / sentencing ranges, (5) only describe court procedures you are certain apply, (6) `[VERIFY]` prefix for any claim below 90% confidence |
| **Notes** | Block claims "All citations are automatically verified against CourtListener's legal database", this is **ASPIRATIONAL**, not actually wired up in the web pipeline (see Section 4 gap). |

### 1.2 ANTI-HALLUCINATION, NO SPECIFIC PERCENTAGES

| Field | Value |
|---|---|
| **Guards against** | Made-up conviction rates, suppression success rates, acquittal percentages from training data |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts` (lines 65-70, `ANTI_HALLUCINATION_PERCENTAGES` constant) |
| **Enforcement** | DOCUMENTED in constant, but constant is defined and **NOT injected into any prompt**. The text only appears interpolated as inline anti-hallucination subsections (see 1.3, 1.4, 1.5 below). |
| **Priority** | CRITICAL |
| **Notes** | Constant exists at lines 65-70 but search shows no `${ANTI_HALLUCINATION_PERCENTAGES}` interpolation anywhere in the file. **Dead code** unless the inline IB section anti-hallucination blocks below cover the same ground. |

### 1.3 ANTI-HALLUCINATION, PLEA FRAMEWORK (IB Section 4c-4d)

| Field | Value |
|---|---|
| **Guards against** | Fabricated trial-vs-plea sentencing differentials, suppression motion success rates |
| **Where documented** | `prompts.ts` line 284-289 (inline in `buildLegalOptions`) |
| **Enforcement** | ENFORCED, inline in the IB Legal Options system prompt |
| **Priority** | CRITICAL |
| **Notes** | Mandates conversion to attorney questions ("Ask your attorney: 'What is the typical conviction rate...'") |

### 1.4 ANTI-HALLUCINATION, IMMIGRATION (IB Section 5b)

| Field | Value |
|---|---|
| **Guards against** | Definitive immigration consequence claims (e.g., "mandatory deportation with no waiver") |
| **Where documented** | `prompts.ts` line 393-394 (inline in `buildProtection` or equivalent section) |
| **Enforcement** | ENFORCED, inline prompt + post-gen validator (see 3.5 Padilla check) |
| **Priority** | CRITICAL |

### 1.5 ANTI-HALLUCINATION, REGULATORY CLAIMS (IB Section 5b)

| Field | Value |
|---|---|
| **Guards against** | Outdated FAFSA / professional licensing / firearms claims |
| **Where documented** | `prompts.ts` line 396-397 |
| **Enforcement** | ENFORCED, inline prompt only (no post-gen validator) |
| **Priority** | HIGH |
| **Notes** | Specific example cited: FAFSA Simplification Act 2021 changed drug-conviction rules, model training data may pre-date this. Requires "Check current rules at [official source]" inline disclaimer. |

### 1.6 ANTI-HALLUCINATION, OUTCOME MAP (IB Section 3a)

| Field | Value |
|---|---|
| **Guards against** | Fabricated "How Common in [County]" percentages |
| **Where documented** | `prompts.ts` line 630-635 |
| **Enforcement** | ENFORCED, inline prompt only |
| **Priority** | CRITICAL |
| **Notes** | Allowed values: qualitative buckets (Low/Moderate/Common/Rare) OR operator-researched data with cited sources. Otherwise: "Your attorney can assess this..." |

### 1.7 ANTI-HALLUCINATION, DA OFFICE PATTERNS (IB Section 3d)

| Field | Value |
|---|---|
| **Guards against** | Fabricated DA office plea/charging/cooperation patterns presented as confirmed fact |
| **Where documented** | `prompts.ts` line 637-638 |
| **Enforcement** | ENFORCED, inline prompt only |
| **Priority** | HIGH |

### 1.8 LEGAL_ACCURACY_RULES (jurisdiction-specific terminology)

| Field | Value |
|---|---|
| **Guards against** | Wrong charge name per state (Texas DWI vs DUI), unavailable outcomes (Texas DWI deferred adjudication is statutorily barred), legal terms of art that imply malpractice |
| **Where documented** | `prompts.ts` line 49-63 (`LEGAL_ACCURACY_RULES` constant) |
| **Enforcement** | ENFORCED, interpolated into many IB section prompts |
| **Priority** | HIGH |
| **Notes** | Three sub-rules: (a) jurisdiction-correct charge terminology, (b) outcome availability verification, (c) no legal terms of art ("standard of care", "ineffective assistance") |

### 1.9 BANNED_PHRASES_BLOCK (UPL guard)

| Field | Value |
|---|---|
| **Guards against** | Crossing UPL line into legal advice ("you should", "we recommend", "your best option", "red flag", "do not [bare imperative]") |
| **Where documented** | `prompts.ts` line 33-43 (`BANNED_PHRASES_BLOCK` constant) |
| **Enforcement** | ENFORCED, interpolated into every IB section prompt + post-gen validator (see 3.1) |
| **Priority** | CRITICAL |

### 1.10 NEW: no-hallucinated-legal-data emergency rule

| Field | Value |
|---|---|
| **Guards against** | Any fabricated case law, statute, holding, sentencing data, outcome claim |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\no-hallucinated-legal-data.md` |
| **Enforcement** | DOCUMENTED only, auto-loads into Claude Code sessions but is **NOT** wired into the runtime generation pipeline |
| **Priority** | CRITICAL |
| **Notes** | This is a *session-time* developer rule. It guides what *Claude (the agent)* writes when building features, NOT what the *runtime LLM calls* produce. Intent is correct; enforcement is asymmetric. |

---

## Section 2, Persona-Level Verification Frameworks (parent project, exist as PERSONAS, not as web code)

These are the elite attorney-personas designed for the discovery pipeline (X-Ray $2,497+). They live in `ImNotAnAttorney/system/Attorney-Personas/` and run inside the **engine** (`ImNotAnAttorney-engine`), NOT the web pipeline.

### 2.1 CASE, Case Law Validity & Applicability

| Field | Value |
|---|---|
| **Guards against** | Citing overruled, abrogated, or inapplicable case law; binding-vs-persuasive confusion; holding mismatch |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md` |
| **Enforcement in WEB** | NOT ENFORCED, entire persona lives in engine. Web tier reports (CD/IB) generate case law via raw Claude calls with no good-law check, no overrule check, no jurisdiction-binding check. |
| **Priority** | CRITICAL for IB ($997) + above |
| **Six validity levels** | VALID_STRONG, VALID_MODERATE, VALID_WEAK, VALID_REVIEW, INVALID, NOT_IN_DB |
| **Validity checks** | (1) good law (not overruled/abrogated/superseded), (2) URL works, (3) age/superseding authority, (4) jurisdiction binding |
| **Applicability checks** | (1) motion-type match, (2) holding match, (3) factual similarity, (4) condemnation score |
| **Web pipeline gap** | The IB ($997) tier discusses motion landscape and judge intelligence with case law citations. **No CASE-equivalent runtime guard exists.** The ANTI_HALLUCINATION_BLOCK warns the model, the model is the judge of "am I certain this case exists?" There is no second-pass validation. |

### 2.2 VERI, Citation Verification (Source Quote Verification)

| Field | Value |
|---|---|
| **Guards against** | Wrong page numbers, paraphrased "verbatim" quotes, wrong report numbers, wrong request numbers, out-of-context quotes |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\VERI-CITATION-VERIFICATION-PERSONA.md` |
| **Enforcement in WEB** | NOT APPLICABLE TO WEB, Veri verifies discovery citations against original PDFs (X-Ray+ tier feature). Web pipeline tiers (CD/IB) do not process discovery PDFs. |
| **Priority** | N/A for web; CRITICAL for X-Ray+ in engine |
| **Notes** | Source-of-truth = original PDF in `01-Raw/`, not database extract. Auto-correction (Soft Find v3.1) extracts verbatim text and replaces inaccurate quotes. **The VERI principle that applies to web: any quoted attorney dialogue must be flagged as example, not real verbatim.** |

### 2.3 GEMINI Case Verification Template

| Field | Value |
|---|---|
| **Guards against** | Invented decision dates, docket numbers, URLs, page citations, fabricated/paraphrased verbatim quotes |
| **Where documented** | `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-VERIFICATION-TEMPLATE.md` |
| **Enforcement in WEB** | NOT ENFORCED, manual template for human-in-the-loop case verification before motion filing. No analog in web pipeline. |
| **Priority** | CRITICAL pattern to import |
| **Key rules** | (a) "[NOT FOUND]" is required when uncertain, (b) MINIMUM 2-3 RAW DIRECT URLs per case from different sources, (c) no Google search wrappers, (d) verbatim quotes with page citations, (e) priority order: official court PDF > Justia > CourtListener > Google Scholar > FindLaw > Casetext, (f) explicit "It is BETTER to report '[NOT FOUND]' than to guess or fabricate" |
| **Web pipeline gap** | The "[NOT FOUND]" pattern is the strongest concrete safeguard. Web prompts say "if uncertain, describe the principle WITHOUT a case name" but don't enforce a structured null-output format the renderer can detect. |

---

## Section 3, Post-Generation Validators (web pipeline runtime)

The web pipeline runs a `validateUPLCompliance()` function (or equivalent) on the markdown output of every Claude call before delivery. Found in `supabase/functions/generate-report/index.ts` around lines 3240-3365.

### 3.1 Banned Phrase Detector

| Field | Value |
|---|---|
| **Guards against** | "you should", "we recommend", "your best option", "red flag", "warning sign", etc. |
| **Where documented** | `generate-report/index.ts` ~line 3245-3275 |
| **Enforcement** | ENFORCED, markdown scanned post-generation, exemptions for quoted attorney dialogue contexts |
| **Priority** | CRITICAL |

### 3.2 Unsourced Collateral Claims Detector

| Field | Value |
|---|---|
| **Guards against** | Sentences mentioning employment/housing/immigration/financial-aid/background-check/voting/firearms consequences without a citation marker |
| **Where documented** | `generate-report/index.ts` lines 3277-3300 |
| **Enforcement** | ENFORCED, sentence-level regex scan. Looks for `§`, `U.S.C.`, `F.S.`, `C.F.R.`, ` v. `, `\d{3} U.S.`, or `Padilla` in the sentence + neighbors. Exempt frames: "Good answer:", "Bad answer:", "ask your attorney". |
| **Priority** | CRITICAL |

### 3.3 Attorney Performance Scoring Detector (U3)

| Field | Value |
|---|---|
| **Guards against** | "Severely Deficient", "Defense Milestone Score", numeric attorney rating bands |
| **Where documented** | `generate-report/index.ts` lines 3303-3313 |
| **Enforcement** | ENFORCED, regex set |
| **Priority** | CRITICAL (UPL, implies attorney judgment) |

### 3.4 Padilla v. Kentucky Mandatory Citation (U6)

| Field | Value |
|---|---|
| **Guards against** | Immigration discussion without the controlling Supreme Court citation |
| **Where documented** | `generate-report/index.ts` lines 3315-3318, 3349-3352 |
| **Enforcement** | ENFORCED, two checks: (a) immigration content within 300 chars must include "Padilla", (b) every report must include "Padilla" somewhere |
| **Priority** | CRITICAL |

### 3.5 Florida Drug Trafficking Mandatory Citation (L9)

| Field | Value |
|---|---|
| **Guards against** | FL drug trafficking discussion without `F.S. § 893.135` |
| **Where documented** | `generate-report/index.ts` lines 3321-3326 |
| **Enforcement** | ENFORCED, regex |
| **Priority** | CRITICAL |
| **Gap** | Only Florida + only `893.135`. No equivalent for Texas Health & Safety Code 481.115, California H&S 11378, etc. As state expansion proceeds (44 states pending per memory `project-legal-pipeline-status.md`), this becomes a hole. |

### 3.6 Bar Complaint / Fire-Attorney Directive Detector (U8)

| Field | Value |
|---|---|
| **Guards against** | "file a bar complaint", "fire your attorney" |
| **Where documented** | `generate-report/index.ts` lines 3328-3332 |
| **Enforcement** | ENFORCED |
| **Priority** | CRITICAL |

### 3.7 Steps 6-8 Detector (U8)

| Field | Value |
|---|---|
| **Guards against** | Self-advocacy steps escalating beyond information-gathering (Steps 1-5 are the maximum) |
| **Where documented** | `generate-report/index.ts` lines 3344-3347 |
| **Enforcement** | ENFORCED, regex `\bStep\s+[678]\b` |
| **Priority** | CRITICAL |

### 3.8 Self-Verification Checklist (in-prompt)

| Field | Value |
|---|---|
| **Guards against** | Section drift, missing required elements |
| **Where documented** | `prompts.ts`, every IB section's `userPrompt` ends with a `SELF-VERIFICATION` checklist (e.g., line 158-165 in `buildCaseRoadmap`) |
| **Enforcement** | ENFORCED, instructs the model to self-check before output |
| **Priority** | MEDIUM |
| **Notes** | Standard items: county name appears 3+ times, charge type in every reference, "Zero banned phrases" |

---

## Section 4, Evaluation Team Gates (post-generation evaluation pipeline)

Source: `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md` (11 teams, 164 criteria)

The web pipeline runs **2 of the 11 teams** in production via the `evaluate-report` Edge Function: **Team 1 (UPL)** as GATE + **Team 2 (Psych)** as HIGH, on Sonnet 4.6 for cost.

### 4.1 Team 1, UPL Compliance (15 criteria)

| Field | Value |
|---|---|
| **Guards against** | Crossing the legal-information / legal-advice line; unsourced consequences; attorney judgment |
| **Where documented** | `EVALUATION-TEAM.md` lines 76-104 |
| **Enforcement in WEB** | ENFORCED via `supabase/functions/evaluate-report/index.ts`, GATE level, Sonnet 4.6, fire-and-forget after generation. Results saved to `cases.eval_results` JSONB. UPL FAIL = operator alert email. |
| **Priority** | CRITICAL |
| **Hallucination-relevant criteria** | U10 (collateral consequences sourced, cites statute/regulation/NICCC), U15 (state data reliance warnings, state-specific tables must be preceded by WARNING boxes) |
| **Notes** | This is the only "second-pass" anti-hallucination gate currently running in production. Only checks UPL surface, does NOT verify case citations exist, does NOT check statute correctness, does NOT verify percentage claims. |

### 4.2 Team 3, Legal Substance (10 criteria)

| Field | Value |
|---|---|
| **Guards against** | Wrong statute, wrong mandatory minimum, inapplicable defense theories, generic prosecution preview, fabricated outcome calibration |
| **Where documented** | `EVALUATION-TEAM.md` lines 144-171 |
| **Enforcement in WEB** | NOT ENFORCED in production, only run by `evaluate-report.mjs` dev tool when manually invoked |
| **Priority** | CRITICAL, biggest unenforced gap |
| **Hallucination-relevant criteria** | L1 (charge-specific accuracy: wrong statute/wrong mandatory minimum), L5 (outcome map calibration: actual data vs national averages), L6 (motion landscape specificity: motions actually exist in this state), L7 (collateral consequences match this state's actual statutes), L9 (statute citation accuracy: every section currently in force) |
| **Gap** | Team 3 catches the exact failure modes the new emergency rule warns against, but it does not run in production. |

### 4.3 Team 6, Rendering & Delivery (R1-R11)

| Field | Value |
|---|---|
| **Guards against** | Markdown-vs-HTML drift, missing methodology note, missing footer disclaimer, wrong upgrade CTA, missing required sections |
| **Where documented** | `EVALUATION-TEAM.md` lines 416-440 |
| **Enforcement in WEB** | NOT ENFORCED in production, manual via `render-ib-test.mjs` |
| **Priority** | HIGH |
| **Hallucination-relevant criteria** | R10 (content completeness, word budget within 20%) |

### 4.4 Team 7, System Truth (ST1-ST16)

| Field | Value |
|---|---|
| **Guards against** | Generic content; intake-signal misalignment (e.g., "communication blackout" framing for monthly-comm defendant) |
| **Where documented** | `EVALUATION-TEAM.md` lines 442-487 |
| **Enforcement in WEB** | NOT ENFORCED |
| **Priority** | MEDIUM |
| **Hallucination-relevant criteria** | ST14 (credibility grounding: critiques grounded in real data, named sources, documented patterns), ST15 (intake-signal alignment: system truth must match this defendant's actual situation, not generic system truth) |

### 4.5 Team 11, Trust Architecture (T1-T5, ANON1-ANON5)

| Field | Value |
|---|---|
| **Guards against** | Unverifiable proof claims, fake testimonials, unverifiable expert attributions |
| **Where documented** | `EVALUATION-TEAM.md` lines 615-637 |
| **Enforcement in WEB** | NOT ENFORCED |
| **Priority** | HIGH |
| **Hallucination-relevant criteria** | ANON2 (externally verifiable proof, pre-purchase pages link to something verifiable: published methodology, court procedure, statute), ANON3 (methodology attribution resolution, named expert attorneys whose published work informs the methodology must be visible and linkable), ANON4 (verifiable case facts, about-page case details include at least one independently verifiable forensic fact: calibration window, weight discrepancy, statute reference) |

---

## Section 5, Verified Data Pipelines (the GOOD path, these prevent hallucination by *injecting* verified data)

When real data is injected as context, the model has no need to fabricate. These are the runtime "ground-truth feeds" already wired into the web pipeline.

### 5.1 CourtListener Jurisdiction Profile Injection

| Field | Value |
|---|---|
| **What it provides** | Verified court name, court type, court citation string, coverage, charge statute text + URL + source, offense-date regulation text, regulation-changed flag, current-regulation text, speedy trial statute |
| **Where wired** | `generate-report/index.ts` line ~2163 (`case_id=eq.${caseId}&select=court_name,...`) |
| **Enforcement** | ENFORCED, when present, injected as `JURISDICTION PROFILE (verified from CourtListener + statute sources)` block, line ~2277 |
| **Priority** | CRITICAL, eliminates statute fabrication for cases with pre-research data |
| **Coverage** | 8 jurisdictions (per `project-legal-pipeline-status.md` memory). 44 states blocked on Anthropic API credits. |

### 5.2 Pre-researched Case Law Injection

| Field | Value |
|---|---|
| **What it provides** | Verified case_name, citation, court, year, holding, application |
| **Where wired** | `generate-report/index.ts` line ~2173, 2196 |
| **Enforcement** | ENFORCED, injected as `PRE-RESEARCHED CASE LAW (verified real cases, use as grounding, cite these over generated citations)`, line ~2285 |
| **Priority** | CRITICAL |
| **Notes** | Filters out citations < 4 chars to avoid garbage. Confidence-ordered (`order=confidence_score.desc`). Limit 10 per jurisdiction-statute. |

### 5.3 Verified Judge Profile Injection

| Field | Value |
|---|---|
| **What it provides** | Judge data sourced from CourtListener |
| **Where wired** | `generate-report/index.ts` line ~2322 |
| **Enforcement** | ENFORCED, injected as `VERIFIED JUDGE PROFILE (from CourtListener, use to ground judge-related analysis)` |
| **Priority** | CRITICAL for IB ($997), the judge intelligence is the IB's unique differentiator |

### 5.4 Charge Taxonomy Data Files

| Field | Value |
|---|---|
| **What it provides** | Per-state, per-charge structured data: statute numbers, penalty ranges, defense categories, prosecution patterns |
| **Where stored** | `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\<STATE>.json` (currently MI, NJ, federal modified + 41 untracked new state files per git status) |
| **Enforcement** | DOCUMENTED, generated via `scripts/generate-charge-taxonomy.ts`. Whether the runtime pipeline reads these and injects into prompts requires further audit (not confirmed in this pass). |
| **Priority** | CRITICAL, single source of truth for state-specific facts |

### 5.5 Statute Verification Scripts

| Field | Value |
|---|---|
| **Scripts** | `scripts/legal-research-all.mjs`, `scripts/legal-research-fl.mjs`, `scripts/classify-case-law.mjs`, `scripts/generate-case-law-enrichment.ts` |
| **Sources** | CourtListener API, FL Online Sunshine, Cornell LII, Justia |
| **Enforcement** | DOCUMENTED, these are build-time / batch-time scripts that populate the database. Runtime enforcement = injection (5.1, 5.2, 5.3 above). |
| **Priority** | CRITICAL |

---

## Section 6, Critical Gaps (the highest-leverage fixes)

Ranked by priority. Each gap is an anti-hallucination safeguard that exists somewhere in the ecosystem (or is industry standard) but is NOT enforced in the web runtime pipeline.

### GAP 1, CRITICAL, No post-generation case-citation verification

**The problem:** ANTI_HALLUCINATION_BLOCK (line 292) claims "All citations are automatically verified against CourtListener's legal database. Fabricated citations will be caught and flagged." **This is not true.** No code in `generate-report/index.ts` verifies any case citation post-generation. The IB ($997) generates motion landscapes and judge intelligence with case law and ships them to a paying defendant.

**The fix:** Wire `scripts/classify-case-law.mjs`-style CourtListener lookups into a post-gen validator. For every `(\w+) v\. (\w+),?\s*(\d+)\s+(So\.\s?\d+|U\.S\.|F\.\s?\d+|F\.Supp\.\s?\d+)\s+(\d+)` match in the markdown, query CourtListener and reject the report (or strip the citation and replace with `[VERIFY]`) if not found.

**Why critical:** A fabricated "*State v. Garcia*, 423 So.3d 1147" cited to a defendant is the exact failure mode the no-hallucinated-legal-data rule was created for. The CASE persona's NOT_IN_DB / INVALID levels exist for this. Engine has it; web does not.

### GAP 2, CRITICAL, Team 3 (Legal Substance) does not run in production

**The problem:** Team 3 catches: wrong statute, wrong mandatory minimum, inapplicable defense theories, missing motion deadlines, fabricated outcome maps, statutes from wrong jurisdiction. It is the second-strongest anti-hallucination gate after UPL. It is NOT in the production `evaluate-report` Edge Function (only Teams 1 + 2 run).

**The fix:** Add Team 3 to the production evaluator. Cost impact: +1 Sonnet 4.6 call per report (~$0.20-0.30). Worth it.

**Why critical:** Even if every prompt-time guard fails, Team 3 is the fallback that catches the failure before delivery.

### GAP 3, CRITICAL, ANTI_HALLUCINATION_PERCENTAGES constant is dead code

**The problem:** `prompts.ts` defines `ANTI_HALLUCINATION_PERCENTAGES` as a top-level constant (lines 65-70) but never interpolates it into any prompt. The intent, universal percentage ban, is correct; the wiring is broken.

**The fix:** Either delete the constant (the inline anti-hallucination subsections in 1.3-1.7 cover it) OR interpolate it into every section prompt the way `BANNED_PHRASES_BLOCK` is.

**Why critical:** Audit hygiene. Dead code in safety-critical paths is a tripwire, the next engineer assumes coverage that does not exist.

### GAP 4, CRITICAL, State-specific mandatory citation enforcement only covers Florida

**The problem:** The Florida drug trafficking mandatory `F.S. § 893.135` check (line 3321-3326) is the only state-specific citation enforcement. As the project expands to 44 states (per `project-legal-pipeline-status.md`), every state needs equivalent checks for its trafficking statute, DUI statute, theft thresholds, etc.

**The fix:** Extract from `data/charge-taxonomy/<STATE>.json` a `mandatory_citations` array, and have the post-gen validator iterate state-by-charge-type.

**Why critical:** Web pipeline is shipping playbooks/IB to all states starting with the new charge taxonomy generation. Without state expansion of the check, every non-FL trafficking case ships unenforced.

### GAP 5, HIGH, No structured `[NOT FOUND]` / `[VERIFY]` rendering treatment

**The problem:** ANTI_HALLUCINATION_BLOCK rule 6 says "for any factual claim below 90% confidence, prefix with `[VERIFY]`". The renderer does not detect or visually mark `[VERIFY]` tags. The Gemini case verification template emphasizes "[NOT FOUND]" as the structured null output. Web has neither.

**The fix:** Add to the HTML renderer: `[VERIFY] foo` → `<span class="verify-flag" title="Operator verification required">foo ⚠</span>`. Surface count to operator delivery confirmation page.

**Why high:** Without rendering treatment, `[VERIFY]` is a soft hint to the model that the model can ignore. With rendering treatment, it becomes a visible operator-review trigger.

### GAP 6, HIGH, No "minimum 2 RAW URLs" enforcement on case citations

**The problem:** The Gemini template requires every case to have minimum 2-3 raw direct URLs from different sources, ranked: official court PDF > Justia > CourtListener > Google Scholar > FindLaw > Casetext. Web pipeline outputs case names without URLs at all.

**The fix:** When pre-researched case law is injected (Section 5.2), include URLs and pass through to the rendered output as `<a>` tags. When pre-researched data is absent, the model should not generate citations at all (already enforced by ANTI_HALLUCINATION_BLOCK rule 1).

**Why high:** External verifiability (Team 11 ANON2) is the trust mechanism for an anonymous brand. Citations without verifiable links are unverifiable claims.

### GAP 7, HIGH, No "operator-researched data with cited sources" badge

**The problem:** Multiple anti-hallucination rules permit "OPERATOR-RESEARCHED data with cited sources" as the exception to the ban on specific percentages (1.3, 1.6, 1.7). There is no schema for the operator to inject this data into the prompt context, no badge in the renderer to mark these claims as operator-verified.

**The fix:** Add `case.operator_research` JSONB column. Inject into prompt as `OPERATOR-VERIFIED DATA (cite as authoritative)` block. Render in HTML with a verified-source badge.

**Why high:** Without this, the model has no path to specific percentages, but the *report* often needs them (sentencing data, county-specific outcome rates) to be useful. Operators get pushed toward editing markdown post-gen, which defeats the validation pipeline.

### GAP 8, HIGH, No-hallucinated-legal-data rule is session-time only

**The problem:** `.claude/rules/no-hallucinated-legal-data.md` is auto-loaded into developer Claude Code sessions but has no analog in the runtime LLM calls. The rule guides what *Claude (the agent building features)* writes, not what the *runtime Claude generating reports* produces.

**The fix:** Compile the rule's "NEVER generate" list into a runtime prompt block injected universally, the same pattern as `ANTI_HALLUCINATION_BLOCK`. Add a note in the rule itself pointing to the runtime block as the load-bearing equivalent.

**Why high:** A rule that exists only at session time creates false confidence: the team thinks "we have a no-hallucinated-legal-data rule" without realizing it does not protect runtime generation.

### GAP 9, MEDIUM, No evaluator for "discovery-aware" claims

**The problem:** IB tier ($997) does NOT have access to discovery documents (X-Ray $2,497+ does). But IB section prompts still encourage discovery-aware framing. Nothing prevents the model from generating claims that *imply* it has read discovery the operator has not received.

**The fix:** Add a post-gen scan for verbs/phrases like "the discovery shows", "the police report states", "the lab report confirms" without an upstream operator-injected discovery context.

**Why medium:** Lower-frequency failure mode but particularly damaging because it leads the defendant to act on phantom evidence.

### GAP 10, MEDIUM, No cross-section consistency check (X1)

**The problem:** Cross-Pipeline X1 ("Same statute, same mandatory minimum, same collateral consequences cited for the same charge type across all tiers") is not enforced. A defendant could buy CD then upgrade to IB and see different statute citations for the same charge.

**The fix:** Cache the canonical statute/penalty data per case in `cases.legal_facts` JSONB on first generation. Subsequent generations read from the cache.

**Why medium:** Internal contradiction is a credibility hit but not a direct legal-harm vector.

---

## Section 7, Summary scoreboard

### What IS enforced (good news)

| Layer | Coverage |
|---|---|
| Prompt-time anti-hallucination block | Universal (CD + IB) |
| Banned phrase post-gen scan | Complete |
| Padilla mandatory citation | Complete |
| Florida trafficking mandatory citation | Complete (FL only) |
| Bar complaint / fire-attorney directive scan | Complete |
| Self-advocacy step ceiling (Steps 1-5) | Complete |
| Attorney performance scoring scan | Complete |
| Unsourced collateral claim scan | Complete |
| Team 1 UPL eval (Sonnet 4.6, fire-and-forget) | Production |
| Team 2 Psych eval (Sonnet 4.6, fire-and-forget) | Production |
| CourtListener jurisdiction profile injection | When pre-research exists (8 jurisdictions) |
| Pre-researched case law injection | When pre-research exists |
| Verified judge profile injection | When pre-research exists |

### What IS NOT enforced (the gaps)

| Gap | Layer | Priority |
|---|---|---|
| Post-gen case citation verification (CourtListener round-trip) | Runtime | CRITICAL |
| Team 3 Legal Substance evaluation in production | Eval | CRITICAL |
| `ANTI_HALLUCINATION_PERCENTAGES` constant interpolation | Prompt | CRITICAL |
| State-specific mandatory citation enforcement (only FL exists) | Runtime | CRITICAL |
| `[VERIFY]` / `[NOT FOUND]` rendering treatment | Renderer | HIGH |
| Minimum 2 RAW URLs per case citation | Renderer | HIGH |
| Operator-researched data injection schema | Prompt + DB | HIGH |
| `no-hallucinated-legal-data` rule runtime equivalent | Prompt | HIGH |
| Discovery-aware claim scan (IB tier) | Runtime | MEDIUM |
| Cross-tier consistency check (X1) | Runtime | MEDIUM |
| CASE persona equivalent (good-law / applicability) | Runtime | CRITICAL (long-term) |
| VERI persona equivalent (X-Ray+, engine domain) | Engine | N/A for web |

### Existential risk ranking

If only one fix is implemented next, do **GAP 1** (post-gen case citation verification). The ANTI_HALLUCINATION_BLOCK promises this is happening. It is not. The promise alone creates reliance, both the model (which interprets "will be caught and flagged" as a real check and may relax other guards) and the team (which thinks they have coverage they don't).

If two fixes are implemented next, add **GAP 2** (Team 3 in production). Team 3 catches the failures GAP 1 doesn't.

If three fixes, add **GAP 4** (state-specific mandatory citation enforcement) before more states ship.

---

## Files referenced

| Path | Role |
|---|---|
| `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md` | 11-team eval framework, 164 criteria |
| `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md` | CASE persona, case law validity + applicability |
| `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\VERI-CITATION-VERIFICATION-PERSONA.md` | VERI persona, discovery citation verification |
| `C:\Users\email\projects\ImNotAnAttorney\system\Case-Law\GEMINI-CASE-VERIFICATION-TEMPLATE.md` | Manual case verification template |
| `C:\Users\email\projects\ImNotAnAttorney\system\AUTOMATION-PLAN.md` | Pipeline automation classification, flags case-law as AI-ASSISTED with verification requirement |
| `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\no-hallucinated-legal-data.md` | Emergency session-time rule (developer-facing) |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts` | IB prompt builders + anti-hallucination constants |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts` | Runtime: ANTI_HALLUCINATION_BLOCK, post-gen validators, CourtListener data injection |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\evaluate-report\index.ts` | Production eval runner (Teams 1 + 2 only) |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-all.mjs` | Statute verification batch script |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs` | CourtListener case law classifier |
| `C:\Users\email\projects\ImNotAnAttorney-web\data\charge-taxonomy\` | Per-state charge taxonomy JSON files |

---

*End of audit, 2026-04-06*
