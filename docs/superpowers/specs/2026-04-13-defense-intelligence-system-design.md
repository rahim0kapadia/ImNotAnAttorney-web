# Defense Intelligence System — Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Author:** Atlas + Rahim
**Scope:** Interconnected defense intelligence that finds patterns nobody knew to look for

---

## 1. Vision

An attorney knows 200 cases. We have millions of data points. The value isn't organizing them — it's connecting everything to everything and surfacing the patterns that no single attorney, no matter how experienced, would ever find.

This system connects case law, judges, prosecutors, officers, charges, motions, defense theories, sentencing, and appeal outcomes into one intelligence network. Then it runs pattern detection across every combination to find insights like:

- "Officers involved in Brady violations also have 3x higher chain-of-custody challenge rates"
- "Defendants who file suppression motions within 30 days get 40% better plea offers"
- "This judge sentences 28% lighter when defense cites a specific case in a motion in limine vs. at trial"
- "When this prosecutor faces this judge, plea offers come 2 weeks earlier"
- "DUI defendants with officer reliability scores below 40 get dismissed 4x more often"

No product on the market does this. CoCounsel does case research. Pre/Dicta does judge prediction. Lex Machina does litigation analytics. None of them connect ALL dimensions and find cross-cutting patterns — and none of them serve defendants.

**North star:** A defendant pays $197 for a Judge Report Card and receives insights that would take an attorney 40 hours of research to discover — insights the attorney wouldn't know to look for because they don't have the data connected.

---

## 2. Entity Model

Everything in the system is an entity with attributes. Entities connect to each other through relationships (Section 4). Pattern detection (Section 6) runs across these connections.

### 2.1 Opinions (the foundation)

The atomic unit. Every court opinion that touches criminal defense. Classified opinions are stored in the `classified_opinions` table (see Section 3 for verification requirements and schema). Every field in this table is either sourced from CL metadata or mechanically extracted by deterministic scripts (with Haiku assisting on bulk text extraction only).

| Attribute | Source | Description |
|-----------|--------|-------------|
| cluster_id | CourtListener | Unique identifier |
| case_name | CL opinion text | e.g., "State v. Rodriguez" |
| court | CL metadata | Which court issued it |
| jurisdiction | Derived from court | State or federal |
| decision_date | CL metadata | When decided |
| opinion_type | **Structural classification (see Section 5.2)** | 'full', 'memorandum', 'pca', 'order' — determines which extraction steps run and weighting in aggregates |
| charge_types[] | **Mechanical extraction (see Section 3)** | Haiku extracts statute citations (§ numbers) from opinion text → match against jurisdiction_statutes table (4,699 rows) scoped to the opinion's jurisdiction (derived from CL court metadata) → charge_slug. Fallback: CL nature_of_suit code from docket metadata. NOT free-text — constrained to taxonomy values. Unmatched statutes flagged for taxonomy review. Statutes found in the first 15% of opinion text (case caption, charges section) receive `is_primary = true`; others receive `is_primary = false`. Array ordered: primary citations first. |
| motion_types[] | **Mechanical extraction (see Section 3)** | Keyword match against 53 motion type names from engine's motion taxonomy. Scan opinion text + CL docket entries for literal motion names ("Motion to Suppress", "Motion to Dismiss", etc.). Negation window applied (see Section 3.4). |
| defense_theories[] | **Mechanical extraction (see Section 3)** | Derived from motion_type × charge_type constrained mapping (see `charge_defense_theories` table, Section 9 Phase 0). Each charge type has 5-15 known defense theories. Plus keyword detection: "Fourth Amendment", "Miranda", "chain of custody", "probable cause", "breathalyzer", etc. — literal string matching, not interpretation. Negation window applied (see Section 3.4). |
| motion_outcomes | **Mechanical extraction (see Section 3)** | JSONB array mapping each motion to its outcome. E.g., `[{"motion_type": "suppress_evidence", "outcome": "granted"}, {"motion_type": "dismiss_charges", "outcome": "denied"}]`. Outcome extraction targets the last 20% of opinion text. Keywords GRANTED/DENIED/DISMISSED are only counted when they appear in this window. If none found in last 20%, expand to last 40%. If still none, the opinion gets outcome = NULL for that motion (not classified). Per curiam affirmances and orders use simplified extraction (see Section 5.2). Negation window NOT applied to outcome keywords (see Section 3.4). |
| motion_favorability | **Computed — NO LLM (see Section 3)** | JSONB array of per-motion favorability scores. E.g., `[{"motion_type": "suppress_evidence", "favorability": 85}]`. Each score is 0-100, derived from verified motion outcome + CL citation treatment + ruling language keywords. |
| case_favorability | **Computed — NO LLM (see Section 3)** | 0-100 integer. Overall case result: derived from case outcome (acquitted/dismissed vs convicted/plea) + CL citation treatment (positively cited by defense-win cases, using CL's algorithmically-determined treatment data — NOT this pipeline's own classifications, see Section 3.5) + overruled prosecution-favorable precedent (CL treatment data). |
| holding_text | **Mechanical extraction (see Section 3)** | Extract sentences from last 20% of opinion containing ruling keywords ("hold that", "find that", "conclude", "order", "grant", "deny", "it is hereby"). Before scanning for ruling keywords, strip text within quotation marks (both double quotes and block quotes indicated by indentation patterns) — this prevents extracting holdings from CITED cases rather than the court's own ruling. Stripped text can still be used for other extraction (statute citations, keyword matching). Haiku can assist with sentence boundary detection if needed. Actual opinion text, NOT a summary. |
| authority_score | CL citation data | How much weight this opinion carries |
| is_good_law | CL citation data | Not overruled |
| citing_count | CL citation data | How many other cases cite this one |

**Scale target:** 100K-500K classified criminal opinions.
**Source:** 50GB CL bulk opinions CSV (local), filtered to criminal courts + criminal keywords. Classification via mechanical extraction scripts ($0) + Haiku bulk text extraction (~$60 for 500K opinions).

### 2.2 Judges

Already rich: 15,613 profiles, 119,506 quotes.

| Attribute | Source | Current Status |
|-----------|--------|---------------|
| full_name | CL | 15,613 populated |
| jurisdiction | CL/derived | 15,386 populated (227 missing) |
| cl_person_id | CL | 15,613 populated |
| aba_rating | CL ABA endpoint | 0 populated (pipeline exists, running) |
| quotes[] | CL bulk extraction | 119,506 total (108,058 unlinked — linking is Phase 1 priority) |
| sentencing_patterns | USSC data | 94 rows |
| bench_jury_rates | USSC data | 141 rows |

### 2.3 Prosecutors

Currently only names in pairings. Need entity promotion.

| Attribute | Source | Current Status |
|-----------|--------|---------------|
| name | CL docket parties | 5,253 pairing rows |
| jurisdiction | Derived from court | Available via pairing docket |
| office | CL firm field | Available from search API |
| cases_handled | CL docket count | Derivable |

**Prosecutor entity resolution:** Prosecutor names need normalization. Phase 1: lowercase + strip suffixes ("ADA", "Esq.", etc.) + collapse whitespace. Phase 3+: consider entity resolution via CL person IDs when available.

### 2.4 Officers

| Attribute | Source | Current Status |
|-----------|--------|---------------|
| name | CL opinion text | 13,342 reliability rows |
| jurisdiction | Backfilled | All populated |
| reliability_score | Cross-case analysis | 13,342 populated |
| brady_status | Brady/Giglio | 0 (blocked — no open data) |
| testimony_count | CL opinion mining | Populated |
| discredited_count | CL opinion mining | Populated |

### 2.5 Charges

Our taxonomy — the demand side. What defendants are actually charged with.

| Attribute | Source | Current Status |
|-----------|--------|---------------|
| charge_slug | charge-taxonomy.ts | 50+ types |
| statutes[] | jurisdiction_statutes | 4,699 across 52 jurisdictions |
| common_defenses[] | **To be derived** from classified opinions |
| common_motions[] | **To be derived** from classified opinions |
| dismissal_rate | outcome_benchmarks | 19 rows |
| plea_rate | outcome_benchmarks | 19 rows |

### 2.6 Motions

Currently implicit. Need explicit entity.

| Attribute | Source | Description |
|-----------|--------|-------------|
| motion_type | Engine's 53 types + Trap Track | e.g., "suppress_evidence", "dismiss_charges" |
| legal_basis | Classified from opinions | 4th Amendment, 5th Amendment, Brady, etc. |
| typical_timing | Derived from docket data | When in case lifecycle this motion usually files |

### 2.7 Defense Theories

Currently implicit in case law. Need explicit entity.

| Attribute | Source | Description |
|-----------|--------|-------------|
| theory_name | Classified from opinions | e.g., "improper vehicle stop", "chain of custody break" |
| applies_to_charges[] | Cross-reference | Which charge types this theory works for |
| success_rate | Derived from outcomes | How often this theory wins |
| sample_size | Count | Statistical reliability |

---

## 3. Verification Architecture — Nothing Enters on LLM Judgment Alone

### 3.1 Hard Rule

Every field in the classified opinion corpus is either:

- **(a) Sourced from CL metadata** (authoritative)
- **(b) Mechanically extracted from opinion text** (verifiable — literal string presence, keyword match, lookup table)

Nothing enters the system on LLM judgment alone. LLMs do NOT classify — deterministic scripts do. No exceptions.

### 3.2 Model Hierarchy

| Layer | Role | Examples |
|-------|------|----------|
| **Scripts (Node.js)** | ALL classification | Keyword matching, statute lookup against jurisdiction_statutes (scoped to opinion's jurisdiction), docket parsing, motion type matching against 53-type taxonomy, outcome extraction from ORDER/GRANTED/DENIED keywords in the last 20-40% of opinion text, defense theory derivation from motion_type × charge_type constrained mapping (see `charge_defense_theories` table). Deterministic, reproducible, auditable. |
| **Haiku** | Bulk text extraction ONLY | Finds statute citation positions (§ numbers, U.S.C. references, state code references), sentence boundaries, keyword locations in 50GB of opinion text. Mechanical work, not decisions. ~$60 for 500K opinions. |
| **Opus** | Quality validation ONLY | Spot-checks 200 samples in Phase 0 gold-set evaluation. Reviews edge cases where mechanical signals are ambiguous (estimated <5% of corpus). Does NOT classify at scale. |

### 3.3 Signal Independence Classification

Not all cross-validation signals are independent. Two signals derived from the same text count as one.

**Truly independent signals (different data sources):**
- CL nature_of_suit code (assigned by court staff)
- CL court metadata (authoritative classification)
- CL citation treatment data (algorithmically derived by CL)
- jurisdiction_statutes lookup result (our curated table)
- CL author/assigned_to person data

**Same-source signals (derived from same text — count as ONE signal):**
- Keyword match in opinion text + same keyword in docket entry (when the docket entry IS the opinion filing)

**Cross-validation rule:** 2+ TRULY INDEPENDENT signals must agree. Two same-source signals count as 1. If only same-source signals exist, the opinion enters as `low_confidence`.

### 3.4 Negation Window

Before accepting any keyword match, scan the 5 words preceding the match for negation terms: 'not', 'no', 'never', 'failed to', 'did not', 'without', 'absence of', 'lack of', 'unlike'. If a negation term is found within the window, the match is EXCLUDED. The negation window applies to motion_type detection and defense_theory keyword matching ONLY. It does NOT apply to outcome extraction keywords (GRANTED/DENIED/DISMISSED), which already have their own positional filtering (last 20-40% of opinion text). Rationale: appellate opinions routinely affirm denials using double-negative constructions ('not error to deny', 'did not err in denying', 'no abuse of discretion in denial'). Applying negation filtering to outcome keywords would systematically DROP valid denied-outcome classifications.

### 3.5 Per-Field Verification Matrix

| Field | Source Type | Signal Independence | How Verified |
|-------|-----------|---------------------|--------------|
| cluster_id | CL metadata | Independent | Authoritative |
| case_name | CL metadata | Independent | Authoritative |
| court | CL metadata | Independent | Authoritative |
| jurisdiction | Derived from court | Independent | Authoritative |
| decision_date | CL metadata | Independent | Authoritative |
| opinion_type | Structural classification | Independent (word count + structural markers) | Mechanical — word count thresholds + 'PER CURIAM' detection + structural analysis |
| charge_types[] | Mechanical extraction | statute citation (same-source w/ opinion text) + CL nature_of_suit (independent) + jurisdiction_statutes lookup (independent) | Haiku extracts statute citations → script matches against jurisdiction_statutes (4,699 rows, SCOPED to opinion's jurisdiction) → charge_slug. Cross-validated: statute citation AND CL docket charge data must agree (independent signals). Fallback: CL nature_of_suit code. Primary/secondary tagging based on position (first 15% = primary). Negation window applied. |
| motion_types[] | Mechanical extraction | opinion text keyword (same-source w/ docket if same doc) + docket entry (independent if separate filing) | Script keyword-matches against 53 motion type names in opinion text + CL docket entries. Cross-validated with signal independence check: if docket entry is a separate filing from the opinion, counts as 2 independent signals; if same document, counts as 1. Negation window applied. |
| defense_theories[] | Mechanical extraction | constrained mapping (independent — derived from taxonomy, not text) + keyword presence (same-source as opinion text) | Script derives from motion_type × charge_type constrained mapping (from `charge_defense_theories` table) + keyword detection ("Fourth Amendment", "Miranda", "chain of custody", etc.). Cross-validated: constrained mapping (independent signal) AND keyword presence must agree. Negation window applied. |
| motion_outcomes | Mechanical extraction | CL docket entries (independent if separate filing) + opinion keyword scan (same-source) + case trajectory (independent) | CL docket entries + opinion ORDER/GRANTED/DENIED keyword scan (last 20-40% of text only) + case trajectory analysis. Case trajectory = progression of case events in CL docket data. If the docket shows a dismissal entry following a suppression hearing, this corroborates the suppression motion being granted. If the docket shows trial proceedings following a motion to dismiss, this corroborates the dismissal motion being denied. Available only for opinions with linked CL docket data (~30-50% of corpus). Per-motion extraction — each motion gets its own outcome. Cross-validated with signal independence rules. Negation window NOT applied to outcome keywords (see Section 3.4). |
| motion_favorability | Computed — NO LLM | N/A (derived from verified fields) | Per-motion: derived from verified motion outcome + CL citation treatment (independent external signal, NOT this pipeline's own classifications) + ruling language keywords. |
| case_favorability | Computed — NO LLM | N/A (derived from verified fields) | Overall: derived from case outcome (acquitted/dismissed vs convicted/plea) + CL citation treatment (independent external signal, NOT this pipeline's own classifications) + overruled prosecution-favorable precedent (CL treatment data). |
| holding_text | Mechanical extraction | N/A | Script extracts sentences from last 20% of opinion containing ruling keywords ("hold that", "find that", "conclude", "order", "grant", "deny", "it is hereby"). Quoted text stripped before ruling keyword scan to avoid extracting holdings from cited cases. Haiku assists with sentence boundary detection. NOT a summary — actual opinion text. |
| authority_score | CL citation data | Independent | Authoritative |
| is_good_law | CL citation data | Independent | Authoritative |
| citing_count | CL citation data | Independent | Authoritative |

### 3.6 Validation Pipeline (per opinion)

1. **Structural classification:** Classify opinion by type (full/memorandum/pca/order) — see Section 5.2 Step 0. This determines which extraction steps run.
2. **Scripts extract all mechanical signals:** statute citations (via Haiku text extraction), keyword phrases (with negation window check), docket entries, motion names, ruling language
3. **Scripts classify** using lookup tables + constrained mappings (from `charge_defense_theories` table) + keyword matching (negation-aware)
4. **Statute lookup scoped to jurisdiction:** All statute matches are scoped to the opinion's jurisdiction (from CL court metadata). Cross-jurisdiction matches are IGNORED.
5. **Positional filtering:** Outcome keywords extracted from last 20-40% of opinion text only. Statute citations in first 15% tagged as primary.
6. **Cross-validation:** 2+ TRULY INDEPENDENT signals must agree (per Section 3.3). Same-source signals count as 1.
7. **Agreement (2+ independent signals match)** → enters system as `"verified"`
8. **Single independent signal only** → enters as `"low_confidence"`, excluded from products below threshold
9. **No signals** → excluded entirely

### 3.7 Classified Opinions Table Schema

New table — NOT extending `case_law` or `statute_case_law`. Avoids the third-universe problem (web has `statute_case_law`, engine has `case_law_references` — these don't join). `classified_opinions` is a purpose-built, verification-first table.

```sql
CREATE TABLE classified_opinions (
  cluster_id text PRIMARY KEY,  -- CL cluster ID (authoritative)
  case_name text NOT NULL,
  court text NOT NULL,
  jurisdiction text NOT NULL,
  decision_date date,
  opinion_type text NOT NULL DEFAULT 'full',  -- 'full', 'memorandum', 'pca', 'order'
  charge_types text[] NOT NULL DEFAULT '{}',  -- mapped to charge_slug taxonomy, ordered primary-first
  motion_types text[] NOT NULL DEFAULT '{}',  -- mapped to engine's 53 motion types
  defense_theories text[] NOT NULL DEFAULT '{}',
  motion_outcomes jsonb,  -- per-motion: [{"motion_type": "suppress_evidence", "outcome": "granted"}, ...]
  motion_favorability jsonb,  -- per-motion: [{"motion_type": "suppress_evidence", "favorability": 85}, ...]
  case_favorability integer,  -- overall: 0-100, computed from case outcome + CL citation treatment
  holding_text text,  -- verbatim opinion text (quoted text stripped during extraction), NOT a summary
  authority_score integer,  -- from citation_authority
  is_good_law boolean DEFAULT true,
  citing_count integer DEFAULT 0,
  classification_confidence text NOT NULL DEFAULT 'verified',  -- verified/low_confidence
  cross_validation_signals jsonb,  -- which signals agreed/disagreed, tagged as independent/same-source
  classified_at timestamptz DEFAULT now(),
  classified_by text DEFAULT 'mechanical_pipeline',  -- deterministic scripts
  source_urls text[] NOT NULL DEFAULT '{}',  -- CL verification URL(s). source_urls[1] is the primary CL opinion URL.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Note on `source_urls`:** The `source_url` (singular) column was removed. Use `source_urls[1]` (PostgreSQL arrays are 1-indexed) for the primary CL verification URL. This aligns with the no-hallucinated-legal-data rule which checks `source_urls[]`.

### 3.8 Cost Impact

Mechanical scripts handle all classification at $0. Haiku assists with bulk text extraction (finding statute citations in 50GB of text). No Opus in the main pipeline.

| Role | Model | Cost |
|------|-------|------|
| Bulk text extraction (500K opinions) | Haiku | ~$60 |
| Classification logic (all fields) | Scripts (Node.js) | $0 |
| Spot-check validation (200 gold-set + edge cases) | Opus | ~$20 |
| **Total one-time** | | **~$80** |
| Weekly new opinion extraction (~5K opinions) | Haiku | ~$5/week |
| **Monthly ongoing** | | **~$20** |

One Case Decoder sale ($197) covers 10 months of pipeline costs. One Intelligence Brief sale ($997) covers 4 years.

### 3.9 Phase 0 Gold-Set Evaluation (REQUIRED before any batch classification)

Phase 0 must complete BEFORE Phase 1 begins. No exceptions.

1. **Manually verify 200 opinions** (human review of charge, motion, theory, outcome)
2. **Run mechanical extraction pipeline** on same 200
3. **Run Opus classification independently** on same 200 (as a BENCHMARK, not as production classifier)
4. **Compare:** mechanical accuracy vs Opus accuracy vs human truth
5. **Acceptance criteria:** mechanical pipeline must agree with human on 90%+ of fields. If mechanical beats Opus, that validates the approach. If Opus beats mechanical by >10%, investigate which mechanical rules are weak and fix them.
6. **If below 90%:** debug extraction rules, add keyword patterns, adjust constrained mappings. Do NOT proceed to Phase 1.

The gold set also serves as the regression test for any future pipeline changes.

---

## 4. Relationship Model

This is where the intelligence lives. Every connection between entities carries data.

### 4.1 Opinion → Judge ("ruled by")

"Judge Smith authored this opinion granting a suppression motion."

| Relationship data | Source |
|-------------------|--------|
| judge_id | CL opinion author / preamble extraction |
| role | authoring judge, concurring, dissenting |

**Multi-judge panels:** Only the authoring judge is attributed in `judge_behavior_patterns` aggregation. Concurring and dissenting judges are recorded in the relationship data (role field) but excluded from behavior pattern computation. For per curiam opinions (opinion_type='pca'), no individual judge is attributed to behavior patterns — these opinions are already weighted at 0.3 in aggregates and contribute to jurisdiction-level statistics only, not judge-level.

**Insight unlock:** "This judge has authored 14 opinions granting suppression motions for DUI. Here's what they wrote."

### 4.2 Opinion → Charge ("involves charge")

"This opinion involves a DUI charge."

| Relationship data | Source |
|-------------------|--------|
| charge_slug | Mechanical extraction from opinion text (cross-validated per Section 3, scoped to opinion's jurisdiction) |
| is_primary | Whether this was the main charge at issue (based on position in first 15% of text) |

**Insight unlock:** "Across 3,200 DUI opinions, these 6 defense theories appear. Here are their success rates."

### 4.3 Opinion → Motion ("decides motion")

"This opinion grants/denies a motion to suppress evidence."

| Relationship data | Source |
|-------------------|--------|
| motion_type | Mechanical extraction (cross-validated per Section 3) |
| outcome | granted / denied / partial (from `motion_outcomes` JSONB — per-motion, not per-opinion) |
| reasoning_summary | Holding text extraction |

**Insight unlock:** "Suppression motions based on improper stop succeed 62% in FL but only 34% in TX."

### 4.4 Opinion → Defense Theory ("applies theory")

"The defense argued improper vehicle stop in this case."

| Relationship data | Source |
|-------------------|--------|
| theory_name | Mechanical extraction (cross-validated per Section 3) |
| was_successful | Did this theory contribute to a favorable outcome (per-motion from `motion_outcomes`) |

**Insight unlock:** "The 'rising blood alcohol' defense has been tried 847 times. It succeeds 23% of the time — but 71% when combined with a motion to suppress the field sobriety test."

### 4.5 Opinion → Officer ("involves officer")

"Officer Davis is named in this opinion."

| Relationship data | Source |
|-------------------|--------|
| officer_name | NER from opinion text |
| role | arresting officer, testifying officer, investigating officer |
| was_challenged | Whether officer's conduct/testimony was at issue |
| challenge_outcome | sustained / overruled |

**Insight unlock:** "Officer Davis has been named in 7 suppression hearings. Defense won 5. His testimony was specifically challenged in 3 Brady-related motions."

### 4.6 Judge → Prosecutor ("paired in case")

"Judge Smith and ADA Martinez were on the same case."

| Relationship data | Source |
|-------------------|--------|
| docket_count | How many cases together |
| motion_grant_rate | When this prosecutor opposes, how often does this judge still grant (computed from per-motion outcomes) |
| plea_timing | How quickly plea offers come in this pairing |

**Insight unlock:** "When ADA Martinez opposes motions before Judge Smith, the grant rate drops from 71% to 43%. But before Judge Jones, Martinez's opposition has no statistical effect."

### 4.7 Opinion → Opinion ("cites")

"This opinion cites Brady v. Maryland."

| Relationship data | Source |
|-------------------|--------|
| citing_opinion_id | CL citation map (522MB local) |
| cited_opinion_id | CL citation map |
| treatment | positive / negative / distinguishing |
| depth | How many hops in the citation chain |

**Insight unlock:** "Cases that cite Brady v. Maryland AND State v. Rodriguez together have a 78% suppression success rate. Citing only one drops it to 41%."

### 4.8 Opinion → Appeal Outcome ("appealed as")

"This trial court decision was affirmed/reversed on appeal."

| Relationship data | Source |
|-------------------|--------|
| appellate_opinion_id | CL citation chain |
| outcome | affirmed / reversed / remanded |
| grounds | What the appeal was about |

**Insight unlock:** "Defense theories based on 4th Amendment challenges survive appeal 67% of the time. 5th Amendment challenges only 38%."

### 4.9 Charge → Sentencing ("sentenced as")

"DUI first offense in FL: median 6 months probation."

| Relationship data | Source |
|-------------------|--------|
| jurisdiction | State |
| sentence_type | prison / probation / fine / community service |
| median_months | Statistical |
| plea_vs_trial_penalty | How much worse trial sentences are |

**Insight unlock:** "In FL, DUI defendants who go to trial get sentences 340% longer than plea. But defendants who file suppression motions AND go to trial get only 120% longer — the motion itself changes the plea leverage."

---

## 5. Data Sources & Population Strategy

### 5.1 What We Already Have (Day 0)

| Data | Rows | Usable Now |
|------|------|-----------|
| judge_profiles | 15,613 | Yes |
| judge_quotes | 119,506 | 90% unlinked to judges — link first |
| judge_prosecutor_pairings | 5,253 | Yes |
| case_feature_vectors | 39,959 | Yes |
| officer_reliability | 13,342 | Yes |
| jurisdiction_statutes | 4,699 | Yes |
| appellate_trends | 1,040 | Yes |
| case_law (unclassified) | 3,407 | Needs classification |
| sentencing_distributions | 377 | Yes |
| bench_jury_divergence | 141 | Yes |
| citation_authority | 57 | Needs expansion |
| plea_discount_curves | 50 | Yes |
| outcome_benchmarks | 19 | Yes |
| exoneration_patterns | 17 | Yes |
| CL bulk opinions CSV | 50GB (local) | Needs filtering + classification |
| CL bulk clusters CSV | 2.3GB (local) | Needs processing |
| CL citation map | 522MB (local) | Needs processing |

### 5.2 What We Need to Build

**Priority 1 — Link existing data (weeks, not months)**

1. **Link 108K judge quotes to judge_profiles.** Each quote has a cluster_id → opinion → author → judge. Script needed. Transforms Judge Report Card overnight.

2. **Classify the 3,407 existing case_law opinions via mechanical extraction pipeline.** Run statute citation extraction + keyword matching + constrained mapping to add charge_type, motion_type, defense_theory, motion_outcomes, motion_favorability, case_favorability. Cross-validate per Section 3. ~$1 Haiku extraction.

3. **Expand citation_authority to full case_law corpus.** Run `enrich-cl-citation-depth.mjs --limit 3500 --apply`. Gets us authority scores for every opinion we have.

4. **Run ABA ratings enrichment.** `enrich-cl-aba-ratings.mjs --apply`. Adds judicial qualification data.

**Priority 2 — Build the classified corpus (weeks)**

5. **Filter 50GB CL opinions to criminal defense subset.** The criminal opinion filtering pipeline:
   1. Haiku extracts court ID from each row → filter to criminal-jurisdiction courts (CL court metadata)
   2. Keyword presence scan (mechanical, not LLM): opinion text must contain 2+ from a criminal-law keyword list (arrest, defendant, prosecution, guilty, sentence, plea, indictment, charge, felony, misdemeanor, etc.)
   3. Exclude known civil-only patterns (wrongful death, breach of contract, tort, negligence — unless combined with criminal keywords)
   4. Result: estimated 500K-2M criminal opinions from 10M+ total
   5. False positive rate target: <5% civil contamination

6. **Classify filtered opinions via mechanical extraction pipeline.** For each opinion:

   **Step 0: Structural classification.** Before extraction, classify each opinion by structure:
   - Full opinion (>1000 words with analysis section): run full extraction pipeline
   - Memorandum opinion (500-1000 words): run extraction but with lower confidence threshold
   - Per curiam affirmance (<500 words OR contains 'PER CURIAM' + 'Affirmed' with no analysis): extract outcome only (affirmed). Skip motion/theory/holding extraction. Tag as 'pca' in opinion_type column.
   - Order (<200 words): extract outcome from ORDER language only. Tag as 'order'.

   a. Haiku extracts statute citations (§ numbers, U.S.C. references, state code references) — ~$60 for 500K opinions
   b. Script matches extracted statutes against jurisdiction_statutes table → charge_slugs. **Statute citation lookup is ALWAYS scoped to the opinion's jurisdiction** (derived from CL court metadata, which is authoritative). Query: `WHERE jurisdiction = opinion.jurisdiction AND statute_number = extracted_citation`. If no match in the opinion's jurisdiction, the citation is IGNORED (not matched against other jurisdictions). Statutes in the first 15% of text tagged `is_primary = true`.
   c. Script scans for motion type keywords against 53-type taxonomy → motion_types[]. Negation window applied.
   d. Script derives defense theories from motion_type × charge_type constrained mapping (from `charge_defense_theories` table) + keyword detection. Negation window applied.
   e. Script extracts per-motion outcomes from docket entries + ORDER/GRANTED/DENIED keyword matching **in the last 20% of opinion text** (consistent with holding_text extraction). If no outcome keyword found in last 20%, expand to last 40%. If still none, motion gets outcome = NULL (not classified). Results stored in `motion_outcomes` JSONB. Per curiam affirmances: extract outcome 'affirmed' only; orders: extract from ORDER language only.
   f. Script computes `motion_favorability` per-motion from outcome + CL citation treatment + ruling language. Script computes `case_favorability` from overall case outcome + CL citation treatment (external signal, NOT pipeline's own classifications — see Section 3.5).
   g. Script extracts holding sentences (ruling keywords in last 20% of opinion). Quoted text stripped before ruling keyword scan.
   h. Cross-validation: 2+ TRULY INDEPENDENT signals must agree per field (per Section 3.3). Same-source disagreements handled per signal independence rules.
   
   Total cost: ~$60 (Haiku extraction) + $0 (script logic). No Opus in the main pipeline.

   **Pattern table weighting by opinion type:** full=1.0, memorandum=0.8, order=0.5, pca=0.3. Full opinions weighted higher than PCAs/orders in all aggregate computations.

7. **Process CL citation map.** 522MB file maps which opinions cite which. Build the Opinion → Opinion relationships. This gives us citation chains, authority networks, and treatment analysis.

8. **Extract officers from opinion text.** NER on criminal opinions to find officer names. Connect to officer_reliability. Builds the Opinion → Officer relationship.

**Priority 3 — Pattern detection engine (months)**

9. **Build cross-dimensional pattern queries.** Pre-computed statistical patterns across entity combinations:
   - charge x motion x motion_outcome → motion success rates per charge
   - charge x defense_theory x motion_outcome → theory motion-level success rates
   - charge x defense_theory x case_outcome → theory case-level success rates
   - judge x motion x motion_outcome → judge-specific grant rates
   - judge x prosecutor x motion_outcome → pairing dynamics
   - officer x challenge x motion_outcome → officer vulnerability patterns
   - motion_timing x motion_outcome → timing correlations
   - citation_combination x motion_outcome → which case combinations win
   - defense_theory x appeal_outcome → which theories survive appeal

10. **Anomaly detection.** Flag statistical outliers: judges who deviate from jurisdiction norms, charge types where a specific defense theory overperforms, officers whose cases get dismissed at unusual rates.

11. **Insight generation.** For each customer's case profile (charge + jurisdiction + judge + officer), query all pattern tables and rank insights by relevance x surprise x actionability.

**Priority 4 — Product integration (ongoing)**

12. **Wire insights into every product tier.** Per Section 7 below.

### 5.3 Population Cadence

| Action | Frequency | Why |
|--------|-----------|-----|
| Classify new CL opinions (mechanical pipeline + Haiku extraction) | Weekly | CL publishes new opinions continuously |
| Refresh citation authority | Monthly | Citation counts and treatment change slowly |
| Re-run pattern detection | Weekly after new opinions | Patterns shift as new data arrives |
| Full corpus rebuild | Quarterly | CL publishes quarterly bulk snapshots |
| Officer NER extraction | Monthly | Slower-changing data |
| Refresh judge_quotes.opinion_context | Weekly (after new opinion classification) | Update opinion_context for quotes whose cluster_id was in the latest classification batch. Full refresh during quarterly corpus rebuild. |

---

## 6. Pattern Detection Engine

This is the core differentiator. Not a query system — a discovery system.

### 6.1 Pre-Computed Pattern Tables

For each combination of dimensions, we pre-compute aggregate statistics and store them. Products query these tables, not raw data.

All pattern tables aggregate from per-motion data in `motion_outcomes` JSONB (not a single per-opinion outcome). Pattern tables weight opinions by `opinion_type`: full=1.0, memorandum=0.8, order=0.5, pca=0.3.

All pattern tables include a `data_source_note text` column defaulting to: 'Published court opinions (appellate and district). Rates may differ from unpublished dispositions and plea agreements, which are not included in this dataset.'

**Primary keys:** The `dimension1 x dimension2 x dimension3` notation defines the composite primary key for each pattern table. Implementation: CREATE UNIQUE INDEX on the composite columns. Nullable dimensions (e.g., `judge_id` in `motion_success_patterns`) use COALESCE in the unique index to handle NULLs.

**Table: `defense_theory_outcomes`**
```
charge_slug x defense_theory x jurisdiction → {
  attempts: int,
  successes: int,
  motion_success_rate: float,  -- motion-level: how often the motion was granted
  case_success_rate: float,  -- case-level: how often the defendant was acquitted/case dismissed
  avg_sentence_reduction_pct: float,
  best_combined_motion: text,
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `motion_success_patterns`**

Measures **motion-level outcomes only**, not case disposition. "Grant rate" means the motion itself was granted — it does not indicate case outcome.

```
motion_type x charge_slug x jurisdiction x judge_id (nullable) → {
  filed_count: int,
  granted_count: int,
  denied_count: int,
  grant_rate: float,
  avg_days_to_ruling: float,
  most_cited_opinion_id: text,
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `judge_behavior_patterns`**
```
judge_id x dimension (motion_type | charge_slug | defense_theory) x dimension_value → {
  total_cases: int,
  favorable_outcomes: int,
  favorable_rate: float,
  deviation_from_jurisdiction_avg: float,
  notable_quotes: text[],
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `prosecutor_dynamics`**

**Name deduplication caveat:** Until Phase 3 entity resolution (CL person IDs), prosecutor names are normalized (lowercase + strip suffixes) but name variants and abbreviations may create duplicate entries. Products display a note when prosecutor sample_size < 30: 'Data may be split across name variants for this prosecutor.' Pattern table queries should aggregate names that share the same first+last name within a jurisdiction as a partial dedup measure.

```
prosecutor_name x judge_id x dimension → {
  cases_together: int,
  plea_offer_timing_days: float,
  motion_opposition_rate: float,
  opposition_success_rate: float,
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `officer_vulnerability_patterns`**
```
officer_name x challenge_type x jurisdiction → {
  times_challenged: int,
  times_sustained: int,
  sustained_rate: float,
  correlated_dismissal_rate: float,
  related_officers: text[] (officers frequently co-occurring),
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `citation_combination_outcomes`**
```
opinion_ids[] (sorted set) x motion_type → {
  times_cited_together: int,
  combined_success_rate: float,
  vs_individual_success_rate: float,
  synergy_score: float (combined - individual),
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `timing_correlations`**

**Data source limitation:** Timing data requires filing dates from CL docket entries, which are available for only ~30-50% of the classified corpus (opinions with linked CL docket data). The `days_from_arraignment` dimension requires an identifiable arraignment event in the docket. Opinions without parseable docket timelines are excluded from timing_correlations. This table will be sparse initially and grow as docket-linked opinions increase.

```
action_type (motion_filing | plea_offer | discovery_demand) x charge_slug x days_from_arraignment → {
  outcome_correlation: float,
  optimal_window_start: int (days),
  optimal_window_end: int (days),
  sample_size: int,
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  computed_at: timestamptz
}
```

**Table: `cross_dimension_anomalies`**

Add `entity_display_name text` column for human-readable display (judge's full name, officer name, charge label). The `query.ts` module discriminates on `entity_type` and casts `entity_id` to the appropriate type. TypeScript interface uses a discriminated union: `type Anomaly = JudgeAnomaly | OfficerAnomaly | ChargeAnomaly` with entity_id typed per variant.

```
entity_type x entity_id x anomaly_type → {
  entity_display_name: text,
  expected_value: float,
  actual_value: float,
  deviation_sigma: float,
  description: text,
  affected_charge_types: text[],
  sample_source_urls: text[],
  data_source_note: text,  -- appellate bias disclosure
  detected_at: timestamptz
}
```

**Table: `pipeline_accuracy_log`**
```
evaluation_date date,
evaluation_type text,  -- 'monthly_sample' or 'quarterly_gold_set'
sample_size int,
per_field_accuracy jsonb,  -- {"charge_types": 0.93, "motion_types": 0.91, ...}
overall_accuracy float,
flagged_fields text[],  -- fields below 85% accuracy
notes text,
evaluated_by text,
created_at timestamptz DEFAULT now()
```

#### 6.1.1 Aggregation Join Paths

**defense_theory_outcomes aggregation:**
1. For each classified opinion, unnest `defense_theories[]` and `motion_outcomes[]`
2. For each defense_theory, look up its associated motion_types via `charge_defense_theories.motion_types[]`
3. Filter `motion_outcomes[]` to only entries whose `motion_type` appears in the theory's `motion_types[]`
4. Aggregate those filtered outcomes as the theory's motion_success_rate

Example: opinion has `defense_theories: ['improper_stop']` and `motion_outcomes: [{'motion_type': 'suppress_evidence', 'outcome': 'granted'}, {'motion_type': 'dismiss_charges', 'outcome': 'denied'}]`. The `charge_defense_theories` table maps `improper_stop -> motion_types: ['suppress_evidence']`. So only the suppress_evidence outcome counts toward improper_stop's motion_success_rate.

**Many-to-many acknowledgment:** When a theory maps to multiple motions, each motion outcome counts separately. When multiple theories share a motion type, the outcome counts for all applicable theories. This is an approximation — exact theory-to-motion attribution would require court-specific docket parsing beyond what mechanical extraction provides.

**NULL outcome handling:** Motions with outcome=NULL are EXCLUDED from pattern table aggregation entirely. They are not counted in filed_count, granted_count, or denied_count. They remain in classified_opinions for audit and potential future reclassification. Rationale: unknown outcomes should not dilute known statistics.

**Multi-charge attribution:** When an opinion involves multiple charges, motion outcomes are attributed to all charges listed in the opinion for aggregation purposes. This is an approximation — per-charge motion attribution would require court-specific docket parsing that is not reliably mechanical. The approximation is acceptable because: (a) most published opinions focus on one primary charge, (b) the `is_primary` flag on charge_types prioritizes the main charge in aggregations.

**Empty motion_types edge case:** Theories with empty `motion_types[]` in `charge_defense_theories` are excluded from `motion_success_rate` computation (no motion-level data to aggregate). They may still appear in `case_success_rate` computation if the opinion's `case_favorability` is available. This ensures no theory claims motion success rates without supporting motion-level evidence.

### 6.2 Anomaly Detection Logic

Run after every pattern refresh. For each entity, compare its behavior to jurisdiction baseline:

- **Judge anomalies:** "Judge Smith grants DUI suppression motions at 2.3 sigma above the FL average. This is statistically significant (p < 0.02)."
- **Officer anomalies:** "Officer Davis's cases are dismissed at 3.1 sigma above department average. Correlated with chain-of-custody challenges."
- **Charge anomalies:** "In Cook County, drug possession dismissal rates are 1.8 sigma above IL average. Driven by a specific prosecutor's office policy."
- **Timing anomalies:** "Motions filed within 21 days of arraignment succeed at 1.5 sigma above motions filed later. Effect strongest for DUI."

Anomalies are flagged with sigma score and surfaced when relevant to a customer's case.

**Minimum sample sizes for anomaly detection:**
- Judge anomalies: N >= 30 cases for that dimension
- Officer anomalies: N >= 15 cases
- Charge anomalies: N >= 50 cases in jurisdiction
- Timing anomalies: N >= 50 cases

Below these thresholds, no anomaly is computed (insufficient statistical power).

### 6.3 Confidence Intervals on Customer-Facing Statistics

Every statistic surfaced in a product must include sample size. Statistics with N < 30 must include a confidence interval.

**Example formats:**
- N >= 30: "71% grant rate (N=247)"
- N < 30: "71% grant rate (N=14, 95% CI: 54%-88%)"
- Never: "71% grant rate" (no sample size = not surfaced)

Wilson score intervals for proportions. Bootstrap CI for non-proportion statistics. All computed during pattern table generation, stored alongside the statistic. Products that display statistics without sample size fail E2E tests.

### 6.4 Insight Ranking

When a customer's case profile arrives (charge + jurisdiction + judge + officer), the system:

1. Queries ALL pattern tables for matching dimensions
2. Scores each pattern by: **relevance** (how closely it matches) x **surprise** (how far from baseline) x **actionability** (can the defendant or attorney act on this)
3. Ranks by composite score
4. Returns top N insights per product tier

**Composite formula:** `insight_score = (relevance * 0.4) + (surprise * 0.35) + (actionability * 0.25)`

Weighted toward relevance (must match the customer's situation) with surprise as secondary differentiator (insights they wouldn't find on their own).

**Relevance scoring:**
- Exact match on all dimensions: 1.0
- Same charge + jurisdiction, different judge: 0.7
- Same charge, different jurisdiction: 0.4
- Related charge (same category): 0.2

**Surprise scoring:**
- >= 2 sigma from baseline: 1.0
- 1-2 sigma: 0.6
- 0.5-1 sigma: 0.3
- < 0.5 sigma: 0.1

**Actionability scoring:**
- Directly informs a motion to file: 1.0
- Informs plea negotiation strategy: 0.8
- Informs attorney accountability question: 0.7
- Informs trial preparation: 0.6
- Background context only: 0.3

**Top N per tier:** Playbooks: 5. Case Decoder: 10. IB: 25. X-Ray: 50. War Room: unlimited. Situation Room: unlimited.

### 6.5 Pattern Recompute Cadence

| Action | Trigger | Why |
|--------|---------|-----|
| Pattern tables recompute | Every Sunday 2AM UTC | Weekly batch after new opinions classified |
| Anomaly detection | Immediately after pattern recompute | Depends on fresh patterns |
| War Room weekly updates | Monday 8AM UTC (after pattern refresh) | Customer gets freshest data at start of week |
| Active case re-query | At next scheduled update only | Never mid-week — prevents inconsistent snapshots |

### 6.6 Pipeline Monitoring

Automated checks run after every pattern recompute:

| Check | Alert Condition | Why |
|-------|----------------|-----|
| Row count delta | `classified_opinions` drops by >5% between runs | Accidental deletion, bad filter, corpus corruption |
| Classification distribution | >30% of opinions classified as same defense_theory | Extraction rule degeneration, taxonomy collapse |
| Source URL integrity | Any rows where `source_urls[]` is empty | Breaks the no-hallucinated-legal-data rule |
| Sample size integrity | Any pattern table row where sample_size = 0 | Math error in aggregation |
| Cross-validation rate | >20% of weekly opinions fail cross-validation | Signal pipeline break or keyword dictionary gap |

**Alert destination:** Operator email (Resend) + Telegram (`@BorisLegalBot`).

### 6.7 Ongoing Accuracy Monitoring

Phase 0 is a one-time gate. Ongoing monitoring ensures the pipeline stays accurate as the corpus grows, keyword dictionaries evolve, and new opinion structures appear.

**Monthly sampling (50 opinions):**
- 50 randomly sampled opinions from the most recent month's classified batch
- Hand-verified against pipeline output (charge_types, motion_types, defense_theories, motion_outcomes, case_favorability)
- Per-field accuracy tracked over time and logged to `pipeline_accuracy_log` table
- If any field drops below 85% accuracy in the monthly sample → pipeline paused for investigation. No new opinions classified until the root cause is identified and fixed.

**Quarterly gold-set re-evaluation (200 opinions):**
- Full 200-opinion evaluation with the same rigor as Phase 0 (human labels, mechanical pipeline, Opus benchmark)
- Compared against previous quarter's results to detect drift
- Same acceptance criteria: 90%+ field-level agreement with human truth
- If below 90%: pipeline paused, extraction rules debugged, regression test updated

**Accuracy trend tracking:**
- All results logged to `pipeline_accuracy_log` with `evaluation_type` ('monthly_sample' or 'quarterly_gold_set')
- Per-field accuracy graphed over time to detect gradual degradation before it hits the 85% threshold
- Quarterly report shared with operator team

### 6.8 Quote-to-Pattern Linking

Judge quotes (119K) connect to patterns through the classified opinion they came from:

```
judge_quote.cluster_id → classified_opinion.cluster_id → opinion.motion_types[] + opinion.motion_outcomes
```

This enables: "Judge Smith said '[quote]' in a case where they GRANTED a suppression motion for DUI." The quote gains context from the opinion's classification.

**New column on judge_quotes:** `opinion_context jsonb` — populated during Phase 1 linking. Contains: `{ motion_types[], motion_outcomes, charge_types[], case_favorability }` copied from the classified opinion. Denormalized for query speed.

### 6.9 Officer Universe Reconciliation

Two officer data sources exist and serve different purposes:

- `officer_reliability` (13,342 rows) — cross-case reliability metrics mined from CL opinion text. Officer names extracted by keyword matching in existing bulk scripts.
- Phase 2 NER extraction — extracts officer names from the NEWLY classified 500K opinion corpus. Catches officers missed by keyword matching (which only finds officers explicitly named in testimony/evidence sections).

Phase 2 NER results MERGE into `officer_reliability` via name + jurisdiction dedup. Not a replacement — an expansion.

### 6.10 Below-Threshold Behavior

When intelligence data EXISTS but falls below the tier's confidence threshold:

- Data is **excluded from customer-facing output** (not surfaced in prompts)
- Data IS logged in an internal `intelligence_audit` table for operator visibility
- Operator can manually override to include (War Room/Situation Room only)
- Product falls back to the next-best insight above threshold, OR to zero-intelligence mode if nothing qualifies

---

## 7. Product Integration

### 7.1 Integration Principles

1. **Every product works with zero intelligence data.** The system enhances, never gates. If pattern tables are empty for a rare charge, the product still delivers using intake data.

2. **One query module.** All products access intelligence through `src/lib/defense-intelligence/query.ts`. No scattered SQL. No direct table access.

3. **Source URL chain on everything.** Every insight carries `source_urls[]`. TypeScript enforced.

4. **Confidence thresholds per tier.** Conservative for mass products (Playbooks), liberal for operator-reviewed products (War Room).

5. **Structured context injection.** Intelligence enters prompts as structured JSON, never raw opinion text. Prevents prompt contamination from legal text.

6. **Graceful degradation tested.** Every E2E test runs with full intelligence AND empty intelligence. Both pass.

7. **Motion-level vs case-level clarity.** Products must present both `motion_success_rate` and `case_success_rate` with clear labels when both are available. "This motion was granted in X% of cases" (motion-level) vs "Defendants who used this defense theory were acquitted in Y% of cases" (case-level). Never conflate the two.

8. **Appellate bias framing.** Every customer-facing statistic derived from the classified opinion corpus includes the data source note. Products present statistics as "Based on N published court opinions" — never as overall success rates.

**Migration path for `tier9-reports/query.ts`:**
- Phase 1-2: `defense-intelligence/query.ts` wraps and extends `tier9-reports/query.ts`. No breaking changes. Tier 9 SKUs continue working through existing query surface.
- Phase 3: `tier9-reports/query.ts` deprecated. All callers migrated to `defense-intelligence/query.ts`.
- The new module subsumes the old one. Single query surface.

### 7.2 Per-Product Intelligence Feed

**Playbooks ($127-$147)**

Current: Static PDF.
After: Static PDF + dynamic intelligence appendix (separate web page).

Intelligence feed:
- `defense_theory_outcomes` for this charge x jurisdiction → "These theories work. These don't." (motion_success_rate + case_success_rate presented separately)
- `motion_success_patterns` for this charge x jurisdiction → "File these motions. Success rates: X%." (motion-level grant rates, labeled as such)
- Source citations for top 3-5 defense-favorable opinions.

**Playbook integration clarification:** Playbooks remain static PDFs. The "dynamic appendix" is a SEPARATE web page linked from the PDF download email. URL: `/playbook/[token]/intelligence`. Generated on-demand when the customer clicks. No change to PDF generation pipeline. The email template adds one line: "View live intelligence data for your case."

Confidence threshold: composite >= 70 (conservative).

---

**Case Decoder ($197)**

Current: 10-15 questions from intake.
After: Questions informed by what actually works.

Intelligence feed:
- Top defense theories for this charge x jurisdiction → questions target gaps those theories need
- Judge-specific patterns if judge provided → questions about judge's known tendencies
- "Based on 214 published court opinions where a suppression motion was granted for DUI in FL, ask your attorney: Was the field sobriety test administered per NHTSA protocol?"

Confidence threshold: composite >= 60.

---

**Intelligence Brief ($997)**

Current: 9 sections from intake alone.
After: Every section enriched. Engine workers `judge_research`, `prosecutor_research`, `sentencing_intelligence` already run for IB.

| Section | Intelligence Feed |
|---------|-------------------|
| 1. Case Roadmap | `timing_correlations` → jurisdiction-specific deadlines and optimal filing windows |
| 2. What's Working | `defense_theory_outcomes` → score calibrated against similar case outcomes (motion_success_rate + case_success_rate) |
| 3. Case Intelligence | `defense_theory_outcomes` + `judge_behavior_patterns` + `motion_success_patterns` → ranked theories with real success rates (motion-level and case-level) |
| 4. Legal Options | `motion_success_patterns` + `prosecutor_dynamics` → specific motions with judge+prosecutor-adjusted grant rates |
| 5. Protection | `timing_correlations` + `cross_dimension_anomalies` → collateral consequence patterns |
| Appendix B. Court Prep | `judge_behavior_patterns` + linked judge quotes → "This judge interrupts defense counsel frequently. Stay composed." |

Confidence threshold: composite >= 50.

---

**X-Ray ($2,497)**

Current: Discovery document analysis + CL case law search.
After: Engine Phase 5 workers get intelligence context.

Workers receiving intelligence context (5-8 workers):

| Worker | Intelligence Feed |
|--------|-------------------|
| `legal-research.mjs` | Pre-classified case law from corpus instead of ad-hoc CL search. Already scored, already verified. |
| `trap-track-assignment.mjs` | `motion_success_patterns` for each S1/S2/S3 motion → expected success rate + supporting citations (motion-level) |
| `motion-recommendation.mjs` | `judge_behavior_patterns` → motions ranked by THIS judge's history, not generic |
| `judge_intelligence` | Full intelligence profile: patterns + quotes + anomalies + citation preferences |
| `sentencing_intelligence` | `timing_correlations` + sentencing anomalies → "Your judge sentences 23% below median for this charge" |

Confidence threshold: composite >= 40 (operator reviews everything).

---

**War Room ($4,997) — X-Ray + 12-15 Intelligence Workers**

Everything X-Ray gets, PLUS:

| Worker | Intelligence Feed |
|--------|-------------------|
| `motion_generation` | Cites specific precedent from classified corpus. "This Court previously granted this motion in [Case], finding [holding]." All citations verified. |
| `motion_judge_scoring` | `prosecutor_dynamics` → how THIS prosecutor's opposition affects grant rate before THIS judge (motion-level) |
| `adversarial_prosecution_sim` | Prosecution-favorable case law from corpus → "Prosecution will cite [Case]. Counter with [Defense Case]." |
| `docket_monitor` | New filings cross-referenced against corpus → flag newly relevant case law |
| `discovery_demand_generation` | Production obligations from classified case law → demands cite specific legal authority |

**War Room weekly updates:** Re-query all pattern tables. Surface: new opinions, changed authority scores, new anomalies. "This week: 2 new opinions favorable to your defense theory. Citation authority for your key precedent increased."

Confidence threshold: composite >= 30 (operator reviews, ongoing relationship).

---

**Situation Room ($9,997) — War Room + 17-20 Intelligence Workers**

Everything War Room gets, PLUS:

| Worker | Intelligence Feed |
|--------|-------------------|
| `attorney_perspective_analysis` | Each of 9 attorney personas receives full intelligence context. Prosecution-minded attorney sees `prosecutor_dynamics`. Motion specialist sees `motion_success_patterns`. Appeal strategist sees appeal outcome correlations. |
| `attack_intelligence` | `officer_vulnerability_patterns` → every attack vector cross-referenced with case law where it succeeded |
| `cross_case_aggregator` | `defense_theory_outcomes` + `citation_combination_outcomes` → similar defense strategies that worked, including which citation combinations had synergy |
| `witness_statement_analysis` | `officer_vulnerability_patterns` → "This officer was challenged in 3 Brady-related motions. Defense won 2." |
| `reply_brief_research` | Appeal outcome patterns → "Don't argue X on appeal (8% reversal). Argue Y (41% reversal)." |

Confidence threshold: composite >= 20 (full operator team, trial context).

---

**Tier 9 Standalone SKUs ($97-$297)**

Current: Query pre-computed Tier 9 stats.
After: Stats + intelligence insights + anomalies.

| SKU | Intelligence Feed |
|-----|-------------------|
| Judge Report Card ($197) | `judge_behavior_patterns` + `prosecutor_dynamics` + anomalies + linked quotes with case law context. Not just "quotes" but "this judge cited State v. Rodriguez 14 times when granting suppression." |
| Officer Background ($97) | `officer_vulnerability_patterns` + actual case citations where officer was challenged. "Officer Davis: challenged in 7 hearings, defense won 5. Key case: [Citation]." |
| Similar Cases Analyzer ($297) | `defense_theory_outcomes` + `citation_combination_outcomes` + `timing_correlations`. Not just "similar cases" but "similar defense strategies that worked, and when to deploy them." Motion-level and case-level success rates presented separately. |

Confidence threshold: composite >= 40 (instant delivery, no operator gate).

---

**Court Case Port — Waves 2-4**

| Wave | Intelligence Feed |
|------|-------------------|
| Wave 2: Cross-Exam Library + Case Law Enrichment | `officer_vulnerability_patterns` → cross-exam questions backed by actual cases. Classified corpus IS the enrichment. |
| Wave 3: Witness Research + Detector Engineering | Officer/witness intelligence from corpus. Detectors validate citations against `citation_authority`. |
| Wave 4: Multi-Persona QA + Verification | QA validates every citation. Verification confirms all case law is good law. |

---

**New Standalone SKUs (Phase 4+ only — NOT in scope for Phases 1-3)**

These products become possible once the intelligence system is mature. They are listed here to show what the system enables, not as Phase 1-3 deliverables. Each needs its own product spec, pricing validation, and market fit assessment before building.

| SKU | Price | What It Delivers |
|-----|-------|-----------------|
| Motion Strategy Report | $197 | Top 5 motions for YOUR charge + judge + jurisdiction. Motion-level success rates, citations, prosecutor-specific dynamics. |
| Defense Theory Analyzer | $147 | Every defense theory tried for YOUR charge. Ranked by motion success rate and case success rate. The cases that won. |
| Prosecution Playbook Decoder | $97 | How prosecution approaches YOUR charge. Strongest arguments. Weakest points. Cases that beat them. |
| Precedent Package | $97 | 10-20 defense-favorable cases for YOUR charge + jurisdiction. Verified good law. Holdings in plain English. |
| Timing Intelligence Report | $97 | When to file what. Optimal windows for motions, plea negotiations, discovery demands. Based on actual timing data. |
| Citation Strategy Guide | $147 | Which case combinations win. Synergy scores. "Cite A + B together for 78% success. A alone: 41%." |

---

## 8. Integration Safeguards

### 8.1 Read-Only Query Surface

All product code reads intelligence through one module: `src/lib/defense-intelligence/query.ts`. Population happens in offline batch pipelines only. No product code writes to intelligence tables.

### 8.2 Graceful Degradation

Every product works with zero intelligence data. Enhanced prompts use conditional blocks:

```
if (insights.length > 0) {
  // Rich prompt with intelligence context
} else {
  // Standard prompt — intake only, works like today
}
```

E2E tests run both paths.

### 8.3 Source URL Chain

Every insight returned by `query.ts` includes `source_urls[]`. TypeScript interface enforces this — compilation fails if provenance is missing. Extends the existing no-hallucinated-legal-data rule to intelligence data.

### 8.4 Confidence Thresholds

Each pattern result carries a confidence composite:

| Signal | Weight |
|--------|--------|
| Sample size (min 3) | 30% |
| Authority score (min 30) | 25% |
| Good law verification | 25% |
| Data freshness (within 2 years) | 20% |

Products filter by tier-specific threshold (Section 7.2).

**Hard floor:** Regardless of confidence composite score, no statistic with N < 5 is surfaced to any customer-facing product. Statistics with 5 <= N < 10 are surfaced only to War Room and Situation Room (operator-reviewed). Statistics with N >= 10 are eligible for all products subject to their tier's composite threshold.

### 8.5 Structured Context Injection

Intelligence enters prompts as structured JSON with explicit instructions. Never raw opinion text. Prevents prompt contamination from legal text with special characters, quotes-within-quotes, and embedded HTML.

### 8.6 UPL Framing Templates

Every insight type has a mandatory presentation template. Products MUST use these templates when surfacing intelligence data. No exceptions.

| Insight Type | Template | Example |
|-------------|----------|---------|
| Pattern statistics | "Based on [N] published court opinions involving [charge] in [jurisdiction], [X]% involved [pattern]. Rates may differ from unpublished dispositions and plea agreements." | "Based on 247 published court opinions involving DUI in Florida, 62% involved a motion to suppress. Rates may differ from unpublished dispositions and plea agreements." |
| Judge patterns | "Based on [N] published opinions, this judge has [pattern]. These statistics reflect published opinions only." | "Based on 34 published opinions, this judge has granted suppression motions at 71% (N=34). These statistics reflect published opinions only." |
| Defense theories | "In [N] published court opinions where defense counsel argued [theory], the motion was [granted/denied] [X]% of the time. The overall case outcome was favorable [Y]% of the time. Published opinions may not reflect overall rates." | "In 89 published court opinions where defense counsel argued improper vehicle stop, the motion was granted 62% of the time. The overall case outcome was favorable 48% of the time. Published opinions may not reflect overall rates." |
| Motion timing | "In [N] published cases, motions filed within [X] days of arraignment had [Y]% [outcome] rate." | "In 156 published cases, motions filed within 30 days of arraignment had 71% grant rate (N=156)." |

**NEVER:** "You should file...", "Your best option is...", "We recommend...", "File this motion...", "Argue this defense..."

All templates are factual, third-party attributed, and information-only. The `evaluate-report` Edge Function (Sonnet, temp 0) validates UPL compliance on every output.

### 8.7 Appellate Bias Disclosure

Published opinions skew toward certain outcomes — prosecutors rarely appeal acquittals, and many cases end in unpublished plea agreements or dispositions not captured in our corpus. Statistics derived from published opinions may overstate defense success rates.

**Mandatory disclosures:**
1. Every customer-facing statistic derived from the classified opinion corpus MUST include the data source: "Based on N published court opinions."
2. All pattern tables include a `data_source_note text` column defaulting to: 'Published court opinions (appellate and district). Rates may differ from unpublished dispositions and plea agreements, which are not included in this dataset.'
3. Product prompts include framing instruction: "When presenting statistics from the intelligence system, always note they are based on published court opinions. Do not present them as overall success rates."
4. The UPL framing templates (Section 8.6) incorporate this disclosure in every template.
5. The `evaluate-report` Edge Function validates that any intelligence-derived statistic includes sample size AND data source note.

### 8.8 Staged Rollout

1. **Tier 9 standalone SKUs** — lowest risk, already query DB, extend queries
2. **Intelligence Brief** — highest impact, operator-reviewed
3. **X-Ray** — engine workers, operator-reviewed
4. **Playbooks / Case Decoder** — mass products, conservative thresholds
5. **War Room / Situation Room** — most complex, multiple workers, weekly updates
6. **Court Case Port Waves 2-4** — depends on all above stable

Each stage: integrate → E2E test (both paths) → operator test with real case → 2-week soak → next stage.

### 8.9 Version Pinning

Active cases (War Room/Situation Room with weekly updates) pin to a `graph_version` timestamp. Corpus rebuilds land in staging tables first. Atomic swap after verification. Active cases pick up new version at next weekly update. No case sees half-rebuilt data.

### 8.10 UPL Compliance

Intelligence data is factual (case citations, statistics, outcomes). It is NOT legal advice. All product prompts maintain the existing UPL boundary: "Here's what the data shows" — never "Here's what you should do." The `evaluate-report` Edge Function (Sonnet, temp 0) continues to gate every customer-facing output. Intelligence context makes UPL compliance easier, not harder — citing real cases is information, not advice.

---

## 9. Implementation Phases

### Phase 0: Gold-Set Evaluation + Taxonomy Bootstrap (2-4 weeks)

REQUIRED before any batch classification. Validates the entire verification architecture on a controlled sample AND builds the foundational charge→theory mapping.

**Phase 0A (weeks 1-2): Build the `charge_defense_theories` constrained mapping.**

This mapping is the FOUNDATION — Phase 1 cannot begin until it passes validation.

a. For each of the 50+ charge types in `charge-taxonomy.ts`, manually enumerate known defense theories (5-15 per charge). Source: criminal defense textbooks, NACDL practice guides, existing engine motion taxonomy (53 types).
b. Store as `charge_defense_theories` table:
```sql
CREATE TABLE charge_defense_theories (
  charge_slug text NOT NULL,
  theory_name text NOT NULL,
  theory_keywords text[] NOT NULL DEFAULT '{}',
  motion_types text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (charge_slug, theory_name)
);
```
c. Review by Opus: provide the mapping to Opus with 10 sample opinions per charge type and ask it to identify missing theories.
d. Version-control the mapping (committed to repo, not just DB). Any future additions require Phase 0-level validation (10 opinions spot-checked per new theory).

**Phase 0B (weeks 3-4): Gold-set evaluation.**

1. Select 200 criminal opinions (50 DUI, 50 drug, 50 assault, 50 other)
2. Human reviewer labels each: charge_types, motion_types, defense_theories, motion_outcomes (per-motion), case_favorability
3. Run mechanical extraction pipeline on same 200 (using the `charge_defense_theories` mapping from Phase 0A)
4. Run Opus classification independently on same 200 (as a BENCHMARK, not as production classifier)
5. Compare: mechanical accuracy vs Opus accuracy vs human truth
6. Acceptance criteria: mechanical pipeline must agree with human on 90%+ of fields. If mechanical beats Opus, that validates the approach. If Opus beats mechanical by >10%, investigate which mechanical rules are weak and fix them.
7. If below 90%: debug extraction rules, add keyword patterns, adjust constrained mappings. Do NOT proceed to Phase 1.
8. Gold set becomes the regression test for any future pipeline changes

**Deliverable:** Validated `charge_defense_theories` mapping (250-750 entries across 50+ charge types). Validated mechanical extraction pipeline with measured accuracy. Regression test set. Go/no-go for Phase 1.

### Phase 1: Link & Classify Existing Data (1-2 weeks)

Zero new data acquisition. Maximum ROI from what we already have.

1. Link 108K judge quotes to judge_profiles (cluster_id → author → judge). Additionally, migrate `judge_quotes.source_url` (singular text) to `judge_quotes.source_urls` (text array) for consistency with `classified_opinions` and the no-hallucinated-legal-data rule. Migration: `ALTER TABLE judge_quotes ADD COLUMN source_urls text[] DEFAULT '{}'; UPDATE judge_quotes SET source_urls = ARRAY[source_url] WHERE source_url IS NOT NULL;` The `defense-intelligence/query.ts` wrapper reads `source_urls[]` and falls back to `source_url` during transition.
2. Classify 3,407 case_law opinions via mechanical extraction pipeline (charge, motion, theory, motion_outcomes, motion_favorability, case_favorability)
3. Expand citation_authority (full run on case_law corpus)
4. Run ABA ratings enrichment
5. Build `defense_theory_outcomes` and `motion_success_patterns` from classified case_law (aggregating from per-motion `motion_outcomes`)
6. Wire `defense-intelligence/query.ts` module (wraps and extends `tier9-reports/query.ts` — no breaking changes)
7. Integrate into Tier 9 standalone SKUs (first product touchpoint)
8. E2E verification (both paths — with intelligence, without intelligence)

**Deliverable:** Tier 9 products dramatically richer. Judge Report Card shows actual case law the judge relies on. Similar Cases Analyzer shows defense theory success rates (motion-level and case-level).

### Phase 2: Build the Classified Corpus (2-4 weeks)

Scale from 3,407 to 100K+ classified opinions.

1. Filter 50GB CL opinions CSV to criminal defense subset via Section 5.2 filtering pipeline (~500K-2M)
2. Classify via mechanical extraction pipeline + Haiku text extraction (~$60 for 500K). Structural classification first (full/memorandum/pca/order), then extraction per opinion type.
3. Process 522MB citation map → build opinion-to-opinion relationships
4. Extract officers from opinion text (NER) → connect to officer_reliability
5. Compute all pattern tables (Section 6.1) — aggregate from per-motion data, weighted by opinion_type
6. Run anomaly detection (Section 6.2)
7. Build insight ranking system (Section 6.4)
8. Integrate into Intelligence Brief (second product touchpoint)
9. E2E verification + operator test
10. Set up pipeline monitoring (Section 6.6)
11. Begin monthly accuracy monitoring (Section 6.7)

**Deliverable:** Intelligence Brief transforms from intake-only to data-backed. Every section has real numbers, real citations, real insights. Ongoing accuracy monitoring in place.

### Phase 3: Engine Integration (2-4 weeks)

Wire intelligence into engine workers for X-Ray / War Room / Situation Room. Deprecate `tier9-reports/query.ts` — all callers migrate to `defense-intelligence/query.ts`.

1. Add intelligence context injection to Phase 5 workers (legal-research, trap-track, motion-recommendation, judge-intelligence)
2. Add War Room-specific intelligence (motion-generation, motion-judge-scoring, adversarial-prosecution-sim)
3. Add Situation Room intelligence (attorney-perspective, attack-intelligence, cross-case-aggregator)
4. Build weekly update pipeline for War Room/Situation Room
5. E2E verification + operator test with real case
6. 2-week soak period

**Backfill strategy for existing customers:** Existing War Room/Situation Room customers receive intelligence data in their next weekly update after Phase 3 ships. No retroactive report regeneration. Weekly update email notes: "New intelligence data now available for your case." This is a feature upgrade, not a correction — the original reports were complete as delivered.

**Deliverable:** Premium tiers deliver intelligence no attorney can match. Motion drafts cite real precedent. Strategy grounded in actual outcome data.

### Phase 4: Pattern Discovery & New Products (ongoing)

1. Continuous opinion classification (weekly CL ingestion via mechanical pipeline + Haiku extraction)
2. Pattern table refresh (weekly)
3. Anomaly detection refresh (weekly)
4. Launch new standalone SKUs (Motion Strategy Report, Defense Theory Analyzer, etc.)
5. Court Case Port Waves 2-4 integration
6. Quarterly full corpus rebuild from CL bulk snapshots
7. **Quarterly taxonomy expansion:** Review unclassified opinions and opinions tagged as `low_confidence` for recurring keyword patterns not captured by the current `charge_defense_theories` mapping. If a pattern appears in 10+ opinions, create a candidate theory entry, validate against 20 sample opinions, and add to the mapping if accuracy >= 85%. Version-control the addition.

**Deliverable:** The system gets smarter every week. New patterns discovered. New products launched. New defense theories captured from the data. Competitive moat deepens.

---

## 10. Cost Estimates

| Item | One-Time | Monthly |
|------|----------|---------|
| Haiku bulk text extraction (500K opinions) | ~$60 | — |
| Opus spot-check (200 gold-set + edge cases) | ~$20 | — |
| Classification scripts (mechanical) | $0 | $0 |
| Weekly new opinion processing (~5K/week) | — | ~$5 (Haiku extraction) |
| Pattern computation (SQL aggregates) | $0 | $0 |
| CL bulk data download (quarterly) | $0 | $0 |
| Citation authority enrichment (CL API) | $0 (rate-limited) | $0 |
| Supabase storage (new tables) | — | ~$0 (within existing plan) |
| Monthly accuracy monitoring (50 samples) | — | ~$2 (Opus spot-check) |

**Total estimated cost: ~$80 one-time, ~$12/month ongoing.**

One Case Decoder sale ($197) covers 16 months of pipeline costs. One Intelligence Brief sale ($997) covers 7 years. The ROI math is trivially favorable — the question is accuracy, not affordability. And because classification is mechanical (deterministic scripts, not LLM inference), costs stay flat regardless of corpus size growth.

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Phase 0 mechanical accuracy vs human | >= 90% field-level agreement |
| Phase 0 `charge_defense_theories` coverage | 50+ charge types, 5-15 theories each |
| Cross-validation agreement rate (truly independent signals) | >= 85% of opinions have 2+ agreeing independent signals |
| Classified criminal opinions | 100K+ (Phase 2) |
| Defense theories cataloged | 200+ per charge type |
| Motion success rates computed | All 53 motion types x 50 charge types x 52 jurisdictions |
| Judge behavior patterns | 10K+ judges with motion-specific data |
| Anomalies detected | 500+ statistically significant findings |
| Tier 9 report richness | 5x more data points per report |
| IB data-backed sections | 9/9 sections with intelligence context |
| E2E pass rate (both paths) | 100% |
| Pipeline monitoring alert false-positive rate | < 10% |
| Civil contamination in classified corpus | < 5% |
| Monthly accuracy monitoring (per-field) | >= 85% sustained |
| Quarterly gold-set accuracy | >= 90% field-level agreement |
| Customer insight: "I didn't know to ask that" | Qualitative — track in post-delivery survey |

---

## Appendix A: Entity-Relationship Summary

```
OPINION ──→ JUDGE (authored by)
OPINION ──→ CHARGE (involves)
OPINION ──→ MOTION (decides — per-motion outcomes)
OPINION ──→ DEFENSE THEORY (applies)
OPINION ──→ OFFICER (names)
OPINION ──→ OPINION (cites)
OPINION ──→ APPEAL OUTCOME (resulted in)
JUDGE ──→ PROSECUTOR (paired in cases)
CHARGE ──→ STATUTE (codified as)
CHARGE ──→ SENTENCING (sentences as)
CHARGE ──→ DEFENSE THEORY (constrained mapping via charge_defense_theories)
MOTION ──→ TIMING (optimal filing window)
DEFENSE THEORY ──→ CHARGE (applies to)
```

Every edge carries data. Every intersection is a potential insight.

## Appendix B: Verification Architecture Decision Record

**Problem:** Classification of legal opinions is the foundation of the entire intelligence system. If classifications are wrong, every downstream product surfaces wrong data to criminal defendants making life-altering decisions. This is not a "close enough" domain.

**Decision:** Mechanical scripts classify, cross-refs validate (with signal independence checks), Opus spot-checks. Nothing enters on LLM judgment alone. LLMs assist with text extraction (Haiku) and quality validation (Opus), but all classification decisions are made by deterministic, auditable scripts.

**Alternatives considered:**
1. *LLM classification (Opus classifies, cross-refs validate)* — rejected. Expensive (~$3,750+ for 500K opinions), non-deterministic (same opinion can classify differently on re-run), impossible to fully audit (classification reasoning is a black box). Monthly ongoing cost ~$160 vs ~$10.
2. *Mechanical only, no LLM involvement at all* — considered but impractical for initial text extraction. Finding statute citations (§ numbers, U.S.C. references) in 50GB of unstructured legal text benefits from Haiku's ability to locate citation positions. But Haiku extracts, scripts decide.
3. *Hybrid LLM + mechanical (Opus reviews edge cases)* — selected for the <5% of opinions where mechanical signals are ambiguous. Opus reviews edge cases as a quality gate, not a production classifier. Estimated cost: ~$5/month for edge case review.
4. *Human-only classification* — gold standard but does not scale to 500K opinions. Used in Phase 0 gold-set (200 opinions) as the benchmark that both mechanical and Opus are measured against.

**Why this approach:** Mechanical scripts are deterministic (same input always produces same output), auditable (every classification decision traces to a specific keyword match or lookup table hit), and essentially free ($0 compute). The tradeoff is they miss nuance — a keyword like "Fourth Amendment" appears in an opinion discussing why the Fourth Amendment does NOT apply. Multiple defenses address this: (1) negation window scanning (Section 3.4) catches explicit negations; (2) cross-validation requiring 2+ truly independent signals (Section 3.3) compensates for remaining false positives — if the keyword match says "Fourth Amendment defense" but the docket entry shows no suppression motion filed, the signals disagree and the opinion enters as low_confidence or excluded; (3) ongoing accuracy monitoring (Section 6.7) catches drift before it affects products. The Phase 0 gold-set measures whether this tradeoff is acceptable (target: 90%+ agreement with human labels).

## Appendix C: Circularity Prevention

The `case_favorability` and `motion_favorability` fields use CL's algorithmically-determined citation treatment data (positive/negative/distinguishing) — NOT this pipeline's own outcome classifications. CL's treatment analysis is an independent, external signal computed by CourtListener's infrastructure. This prevents circular validation where our classifications validate our own classifications.

Specifically:
- "Positively cited by defense-win cases" uses CL's `treatment` field from the citation map, not our `motion_outcomes` or `case_favorability` fields.
- Authority scores come from CL's `citation_count` and treatment data.
- The only pipeline-internal signal used in favorability computation is the verified outcome (which itself is mechanically extracted from opinion text and cross-validated with independent signals).
