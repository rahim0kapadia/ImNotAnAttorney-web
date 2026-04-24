# Score Observations — UPL Audit (Task C3.1)

Source: `src/lib/score.ts` (58 observations)
Index: `docs/audits/2026-04-24-score-observations-line-index.json`
Rules: ~/.claude/rules/no-hallucinated-legal-data.md, ~/.claude/rules/brand-voice.md
Lens: Margaret Hagan Plain-Language Principles + Atti UPL guardrail

## Audit table

| line | charge_branch | attorney_state | time_window | current_text | classification | verdict | proposed_replacement | stress_bands |
|------|---------------|----------------|-------------|--------------|----------------|---------|----------------------|--------------|
| 115 | cross-cutting | has-attorney | late | Subject is represented by a public defender. Public-defender caseload averages 2-4x the recommended ceiling; files with subjects who confirm deadlines in writing and request written updates on motions and discovery show better progression. | ADVICE | DELETE |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 120 | cross-cutting | no-attorney | late | Subject reports they don't have an attorney. Motion deadlines run from arrest date, not from retention; the active file window is shrinking with each day of unrepresented status. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 125 | cross-cutting | no-attorney |  | Representation status unclear. First-pass action for subject: Confirm whether you have active counsel and who they are; court dates are often already on the docket. | ADVICE | REPHRASE | Representation status unclear on file. Court dates are often already on the docket regardless of retention status. Question to surface: "Do I have active counsel on record for this case, and who are they?" | ["Critical","Concerning","Average"] |
| 139 | cross-cutting | no-attorney | mid | File notes: attorney has filed motions. Active case management signal — pattern consistent with files that reach favorable resolution. | INFORMATION | KEEP |  | ["Concerning","Average","Adequate","Excellent"] |
| 146 | cross-cutting |  | mid | File shows ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed. Late suppression motions are frequently time-barred in this pattern — challengeable evidence remains in the prosecution's case. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 155 | cross-cutting |  | mid | Subject unsure of filing status. Engaged attorneys communicate about filings proactively; subjects in this don't know, nothing may have been filed pattern surface no motions on file ~70% of the time. Question to surface with counsel: "What motions have you filed, and what is still pending?" | ADVICE | DELETE |  | ["Critical","Concerning","Average"] |
| 168 | cross-cutting |  | mid | At this stage, discovery is typically in the defense file. File without it is being built blind — challengeable evidence cannot be identified from material the defense has not reviewed. Question to surface: "Have we received all discovery materials?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average"] |
| 177 | cross-cutting |  | mid | Discovery status not on file. Reference: Discovery is evidence the prosecution must share — police reports, lab results, witness statements. Question to surface: "Have we received all discovery?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average"] |
| 190 | cross-cutting |  | mid | Monthly communication cadence on file. Pattern: Monthly communication may be acceptable early on, but files at this stage typically show weekly touchpoints around hearings and filing deadlines. | INFORMATION | KEEP |  | ["Concerning","Average","Adequate"] |
| 196 | cross-cutting |  | mid | Rare communication cadence on file. In the cluster we track, rare contact correlates with files where billable hours are being logged against minimal actual work — attorneys bill by the hour, and silence frequently means the file hasn't been touched. | INFORMATION | DELETE |  | ["Critical","Concerning","Average"] |
| 201 | cross-cutting |  | mid | Zero-communication state on file — a serious red flag pattern. Deadlines, hearings, and plea offers continue to move regardless of subject awareness. Recommended subject action: send a written status request, on the record. | ADVICE | REPHRASE | Zero-communication state on file — a serious red flag pattern. Deadlines, hearings, and plea offers continue to move regardless of subject awareness. Question to surface with counsel: "Can we schedule our next status check in writing, with an agenda?" | ["Critical","Concerning"] |
| 213 | cross-cutting |  |  | Strategy briefly outlined; depth unclear from file. Question to surface with counsel: "What is the theory of defense, which motions are planned, and why?" | QUESTION-HOOK | KEEP |  | ["Concerning","Average","Adequate"] |
| 218 | cross-cutting |  |  | No strategy discussion on file — defense theory hasn't been explained to subject. Question to surface: "What is your theory of defense, and how does it address the prosecution's strongest evidence?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average"] |
| 230 | cross-cutting |  | late | File state at ${getTimeLabel(input.timeSinceArrest)} since arrest: ${motionStatus}, ${discoveryStatus}. Pattern shows multiple defense windows already closed; remaining options compress further with each additional week. | INFORMATION | KEEP |  | ["Critical","Concerning"] |
| 242 | cross-cutting |  | late | Prior misdemeanor(s) on record. Pattern: priors of this class affect plea negotiations and diversion eligibility. Question to surface with counsel: "How are priors affecting options for diversion or reduced charges?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 247 | cross-cutting |  |  | Prior felony/multiple priors on record. Pattern: enhancements, mandatory minimums, and loss of diversion eligibility commonly apply. Question to surface: "How is my record factored into defense strategy and sentencing exposure?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 256 | cross-cutting |  |  | Case stage: sentencing. File priority becomes mitigation preparation — character letters, treatment documentation, sentencing memorandum. Question to surface with counsel: "What mitigation materials are being prepared?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 260 | cross-cutting |  |  | Case stage: post-conviction. Strict appeal deadlines govern every remaining option. Question to surface: "Have all available remedies been identified — direct appeal, PCR, habeas — and what are their filing deadlines?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 265 | cross-cutting |  |  | Pre-arrest posture. Files where subjects engage proactive counsel before charges file show better outcomes; pre-arrest intervention occasionally prevents charges entirely. | INFORMATION | KEEP |  | ["Average","Adequate","Excellent"] |
| 275 | cross-cutting |  |  | Pre-trial phase on file with no motions filed. Suppression and discovery motions are the expected filings at this stage. Question to surface: "What motions are being filed before trial?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average"] |
| 281 | cross-cutting |  |  | Trial-prep phase without detailed strategy discussion on file. At this stage the defense theory, witness list, and key evidence should be walked through with subject. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 287 | cross-cutting |  |  | Arraigned but no discovery on file. Post-arraignment, defense attorneys typically request prosecution's evidence promptly. Question to surface: "Has discovery been requested, and when do we expect to receive it?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average"] |
| 296 | cross-cutting |  |  | Subject holds a professional license. Conviction may trigger licensing board action, suspension, or revocation — a separate track from the criminal case. Licensing consequences belong on the defense risk register as a distinct issue. | INFORMATION | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 300 | cross-cutting |  |  | Subject employed (non-licensed). Conviction affects background checks, security clearances, and professional opportunities even without a license at stake. Collateral-employment exposure on file. | INFORMATION | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 304 | cross-cutting |  |  | Subject is a student. Conviction can affect financial aid, campus housing, and academic standing. For drug offenses, federal law ties FAFSA eligibility to conviction status; flag for counsel. | ADVICE | REPHRASE | Subject is a student. Conviction can affect financial aid, campus housing, and academic standing. For drug offenses, federal law ties FAFSA eligibility to conviction status — collateral education exposure on file. | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 324 | cross-cutting |  |  | No major red flags in the measured dimensions. File does not capture charge-specific elements or jurisdiction patterns — the Case Decoder covers those. | INFORMATION | KEEP |  | ["Average","Adequate","Excellent"] |
| 329 | cross-cutting |  |  | Ten-question files do not capture everything. Factors outside this scope — judge tendencies, prosecutor patterns, jurisdiction-specific deadlines — often decide outcomes. | INFORMATION | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 334 | cross-cutting |  |  | Ten-question files are a starting point. Every case has jurisdiction-specific deadlines, procedural requirements, and strategic considerations this scope does not reach. | INFORMATION | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 388 | dui | no-attorney |  | DUI defense starts with breathalyzer calibration records, dash/body cam footage, and officer sobriety certification. File currently without counsel — first-ask list when subject retains. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 391 | dui | no-attorney | mid | DUI case, mid-window. Breathalyzer calibration records and officer sobriety certification are key file artifacts at this stage. Question to surface: "Have we received the maintenance logs?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 392 | dui | no-attorney | mid | DUI case, early window. Dash/body cam footage and breathalyzer calibration records are the priority retrieval items. Question to surface: "Have these been requested?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 396 | drug-possession | no-attorney | mid | Drug possession file without counsel. Defense of this class examines how evidence was obtained — warrant validity, informant reliability, chain of custody, lab accuracy. First-ask list when counsel is retained. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 399 | drug-possession | no-attorney | mid | Drug possession file, mid-window. Lab report review drives this class — weight errors and chain-of-custody gaps are where reductions come from. Question to surface: "Have you reviewed the lab report?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 400 | drug-possession | no-attorney | mid | Drug possession file, early window. Defense examines how evidence was obtained — warrant validity, informant reliability, chain of custody. Question to surface: "What's the plan for challenging evidence?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 403 | drug-trafficking | no-attorney | mid | Trafficking file without counsel. This class turns on quantity thresholds vs. distribution evidence, CI testimony, and wiretap authorization. Mandatory minimums make the retention window a priority. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 406 | drug-trafficking | no-attorney | mid | Trafficking file, mid-window. Wiretap authorizations, CI reliability, and co-defendant statements are the review priorities. Question to surface: "Has the quantity basis been challenged?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 407 | drug-trafficking | no-attorney | mid | Trafficking file, early window. Quantity-based thresholds vs. distribution evidence, plus conspiracy exposure, drive the defense. Question to surface: "Am I exposed to mandatory minimums?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 410 | probation-violation | no-attorney | mid | Violation file without counsel. Hearings of this class use preponderance of evidence, not beyond reasonable doubt. Key file split: technical vs. substantive violation, plus alternative sanctions. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 413 | probation-violation | no-attorney | mid | Violation file, hearing window. Mitigating evidence, compliance records, and alternative sanctions are the prep priorities. Question to surface: "What are we presenting, and have we explored alternatives?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 414 | probation-violation | no-attorney | mid | Violation file, pre-hearing. Technical vs. substantive violation split matters — technical commonly have alternatives to revocation. Question to surface: "What type is this, and what alternatives exist?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 417 | white-collar | no-attorney | mid | White collar cases file without counsel. This class often runs parallel civil or regulatory exposure. First-ask list when counsel retained: is there civil liability connected to these charges? | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 419 | white-collar | no-attorney | mid | White collar cases file. This class often runs parallel civil or regulatory exposure. Question to surface: "Is there civil liability connected to these charges?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 422 | sex-offense | no-attorney | mid | Sex-offense file without counsel. Pattern: collateral consequences — SORNA registry, residency restrictions, employment limits — attach on conviction. Competent counsel examines forensic procedures, digital evidence, and Brady material first. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 425 | sex-offense | no-attorney | mid | Sex-offense file, review window. Forensic reports, evidence handling, and Brady material are the priority review items. Question to surface: "Have issues been found with evidence collection, and what's the defense theory?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 426 | sex-offense | no-attorney | mid | Sex-offense file, early window. Defense of this class scrutinizes forensic evidence collection, digital preservation, and interview procedures. Question to surface: "What are registration consequences, and what's the strategy?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 429 | federal-criminal | no-attorney | mid | Federal file without counsel. Federal cases move faster and sentence longer. Sentencing guidelines, mandatory minimums, and cooperation agreements make counsel retention the priority step. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 432 | federal-criminal | no-attorney | mid | Federal file, mid-window. Pre-trial motions, Rule 16 discovery, and sentencing strategy are the priority tracks. Question to surface: "Have we received all discovery, and what's our guideline exposure?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 433 | federal-criminal | no-attorney | mid | Federal file, early window. Defense calculates the sentencing-guideline range and reviews grand jury materials early. Question to surface: "What's my estimated guideline range?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 436 | self-defense | no-attorney | mid | Self-defense file without counsel. This class admits the act but argues justification. Key split: stand-your-ground vs. duty to retreat, force proportionality, timeline. Witness evidence has a retention window. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 439 | self-defense | no-attorney | mid | Self-defense file, mid-window. Clear justification theory and preserved evidence are the priority items. Question to surface: "What's the justification theory, and has all threat evidence been preserved?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 440 | self-defense | no-attorney | mid | Self-defense file, early window. Threat-evidence preservation is the priority — witness statements, surveillance, medical records, 911 recordings. Question to surface: "Has all threat evidence been preserved?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 443 | other-felony | no-attorney | mid | Felony file without counsel. Defense of this class starts by identifying which elements of the charge are weakest. First-ask list when counsel retained. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 446 | other-felony | no-attorney | mid | Felony file, mid-window. A clear defense theory and evidentiary-hearing prep are the priorities. Question to surface: "What's our defense theory and what motions are we filing?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 447 | other-felony | no-attorney | mid | Felony file, early window. Building a defense theory by identifying the weakest elements of the charge is the first step. Question to surface: "What is the theory?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 450 | other-misdemeanor | no-attorney | mid | Misdemeanor file without counsel. Even misdemeanor convictions create permanent records affecting employment, housing, and licensing; many qualify for diversion or deferred adjudication. First-ask when counsel retained: eligibility screen. | INFORMATION | KEEP |  | ["Critical","Concerning","Average"] |
| 453 | other-misdemeanor | no-attorney | mid | Misdemeanor file, mid-window. Conviction creates a permanent record; diversion and deferred adjudication are the priority alternatives to explore. Question to surface: "Have we explored every alternative to conviction?" | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 454 | other-misdemeanor | no-attorney | mid | Misdemeanor file, early window. Misdemeanor convictions create permanent records affecting employment, housing, and licensing. Priority alternatives: diversion or deferred adjudication that can result in dismissal. | INFORMATION | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |
| 456 | cross-cutting | no-attorney | mid | File class: ${getChargeLabel(chargeType)}. Identifying which elements the prosecution must prove — and which ones are weakest — is the first step. Question to surface with counsel. | QUESTION-HOOK | KEEP |  | ["Critical","Concerning","Average","Adequate","Excellent"] |

## Counts

- By classification: INFORMATION=24, QUESTION-HOOK=29, ADVICE=5
- By verdict: KEEP=52, REPHRASE=3, DELETE=3

## DELETE rationale (unsourced statistics or empirical claims without RPC backing)

- **line 115** — "Public-defender caseload averages 2-4x the recommended ceiling" — no RPC or data-source backing found in `src/lib/` or `supabase/functions/`. Per WARN-8, replacing unsourced stats with softer unsourced stats creates a second UPL risk. Remove from observations; if the PD context matters to the score band, wrap a descriptive non-stat replacement at Task C3.2 or let the score move silently.
- **line 155** — "~70% of the time" — no RPC backing. Same rationale. The legitimate Question-to-surface substring at the end is preserved by other don't-know observations (e.g., line 177 discovery question); losing this row does not blank the band.
- **line 196** — "In the cluster we track, rare contact correlates with files where billable hours are being logged against minimal actual work" — empirical claim framed as researcher observation but no cluster data on file (no RPC source). DELETE rather than softer-rephrase per WARN-8.

## REPHRASE rationale

- **line 125** — Removed imperative "Confirm whether you have active counsel and who they are" and re-framed as a Question to surface with counsel; preserves the informational content (court dates move regardless of retention).
- **line 201** — Replaced "Recommended subject action: send a written status request, on the record" with a Question to surface — the underlying concern (zero-communication state) is legitimate and the rewrite keeps the dossier tone.
- **line 304** — Removed "flag for counsel" (imperative to reader) and replaced with "collateral education exposure on file" (dossier-voice descriptor). The FAFSA fact survives as information, not advice.

## Asymmetry note

`/score` UPL gate uses local regex-only classification. `evaluate-report` Edge Function uses an LLM classifier. If `/score` submission volume crosses 500/day, escalate `/score` observations to the shared LLM gate. Tracked as post-audit follow-up.

## Edge cases flagged for manual review

- **line 281** (trial-prep without strategy): the phrase "should be walked through with subject" is borderline — "should" is a soft imperative but the object is "subject" (third-person dossier), not "you" (reader). Classified INFORMATION; if C3.2 reviewer disagrees, a safe rephrase is: "...the defense theory, witness list, and key evidence are typically walked through with subject at this stage."
- **line 417** vs **line 419** (white collar): both use "First-ask list" / "Question to surface" phrasing that could be read as advice to the reader. The "First-ask list when counsel retained: is there civil liability..." is descriptive of an internal list rather than imperative to the reader; kept as INFORMATION. Same logic applied to the other "First-ask list" entries (388, 396, 417, 429, 443, 450).
- **line 296** (licensed profession): "Licensing consequences belong on the defense risk register as a distinct issue" — no explicit "you should" but "belong on" has mild prescriptive tone. Kept INFORMATION; dossier-voice holds because the subject is "licensing consequences," not the reader.
- **line 422** (sex-offense no-counsel): "Competent counsel examines forensic procedures, digital evidence, and Brady material first" — statement about what competent counsel does (third-person), not imperative to the reader. Kept INFORMATION.

## P2 Coverage Matrix Verification

**Computed 2026-04-24 via `tmp-coverage.mjs` over `docs/audits/2026-04-24-score-observations-upl.json` (55 rows) + `docs/audits/2026-04-24-score-observations-line-index.json` (55 rows). Both JSONs share `line` + `text_hash` as primary keys; they agree on row count.**

### Row totals

| Metric | Value | SC-P2 floor | Verdict |
|---|---|---|---|
| Total audit rows | 55 | — | — |
| Charge-specific rows | 29 | ≥ 40 | **FAIL** (short by 11) |
| Cross-cutting rows | 26 | ≥ 15 | PASS |
| Rows with non-empty `stress_bands` | 55 / 55 | 100% | PASS |
| Max per-charge rows | 3 | — | — |
| Min per-charge rows | 2 | — | — |
| Per-charge floor (`max_per_charge - 1` = 2) | all 10 charges ≥ 2 | all ≥ 2 | PASS |

### Per-charge-type tally

| charge_branch | rows |
|---|---|
| dui | 3 |
| drug-possession | 3 |
| drug-trafficking | 3 |
| probation-violation | 3 |
| white-collar | 2 |
| sex-offense | 3 |
| federal-criminal | 3 |
| self-defense | 3 |
| other-felony | 3 |
| other-misdemeanor | 3 |

All 10 charge types ≥ `max_per_charge - 1` (= 2). Per-charge balance PASS.

### Tuple coverage — {10 charges} × {attorney_state} × {time_window}

Plan requires every one of the 40 tuples {10 charges × 2 attorney_state × 2 time_window} to appear ≥ 1 time. Actual source classification in `charge_branch_observations.ts` collapses most rows into one tuple per charge (`no-attorney | mid`). Distinct values observed: `attorney_state ∈ {no-attorney, null}` and `time_window ∈ {late, mid, null}`. The `has-attorney` branch and the `early-window`/`late-window` variants for charge-specific rows were never classified as distinct tuples — the scorer currently funnels all charge-specific observations through the `no-attorney` + `mid-window` labels.

Matrix (rows present per tuple). Columns are `attorney_state | time_window`:

| charge | no-attorney / early | no-attorney / mid | no-attorney / late | has-attorney / early | has-attorney / mid | has-attorney / late |
|---|---|---|---|---|---|---|
| dui | 0 | 2 | 0 | 0 | 0 | 0 |
| drug-possession | 0 | 3 | 0 | 0 | 0 | 0 |
| drug-trafficking | 0 | 3 | 0 | 0 | 0 | 0 |
| probation-violation | 0 | 3 | 0 | 0 | 0 | 0 |
| white-collar | 0 | 2 | 0 | 0 | 0 | 0 |
| sex-offense | 0 | 3 | 0 | 0 | 0 | 0 |
| federal-criminal | 0 | 3 | 0 | 0 | 0 | 0 |
| self-defense | 0 | 3 | 0 | 0 | 0 | 0 |
| other-felony | 0 | 3 | 0 | 0 | 0 | 0 |
| other-misdemeanor | 0 | 3 | 0 | 0 | 0 | 0 |

Tuples with ≥ 1 row (restricting to the 4 tuples the plan names: `{no-attorney, has-attorney} × {early, mid}`): **10 / 40**.

### SC-P2 verdict: **FAIL**

Two of four sub-criteria fail:

1. **Charge-specific row count (29) < 40** — source `charge_branch_observations.ts` produces 29 rows covering the 10 charge types, not 40.
2. **Tuple coverage 10/40** — the has-attorney branch and the early/late windows are not covered for any charge-specific observation.

Two sub-criteria pass:

- Per-charge-type balance (all 10 charges have ≥ `max_per_charge - 1` rows).
- `stress_bands` populated on all 55 rows (WARN-10 resolved).

### Remediation paths (not executed in this task — code is frozen per task brief)

Raising coverage to SC-P2 floor requires source-level additions in `src/lib/score.ts` / `charge_branch_observations.ts`:

- Add `has-attorney` branch observations for each of the 10 charge types (10 rows).
- Add `early-window` charge-specific observations separate from `mid` (up to 10 rows).
- Optional: add `late-window` charge-specific observations (up to 10 rows).

Total additions needed: ~11 new observations to hit 40, ~20 if both attorney-state branches get `early` + `mid` each. Logged here for next-round follow-up; this task is verification-only.

