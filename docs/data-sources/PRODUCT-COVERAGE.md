# Product Coverage Matrix

> Cross-reference: which dataset feeds which product. Cells:
>
> - `R` = REQUIRED — product cannot render without this dataset
> - `C` = CONSUMED — product uses this dataset for normal output
> - `O` = OPTIONAL — product enriches output when this dataset has a hit, but renders cleanly without
> - blank = not used
>
> Use this to predict blast radius when a dataset goes stale, fails refresh,
> or gets a schema change.

## Matrix

| Dataset | DUI Playbook | Drug Possession Playbook | Other Playbooks | Case Decoder ($197) | Intelligence Brief ($997) | X-Ray ($2,497) | War Room ($4,997) | Situation Room ($9,997) | Judge Report Card ($197) | Officer BG Check ($97) | Similar Cases ($297) | Federal Sent. Dist. ($297) | SCOTUS Search (free) | Sentencing Calc (free) | FJIB | Arrest Survival Kit ($47) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CourtListener bulk | C | C | C | R | R | R | R | R | R | C | R | C | C | C | C | C |
| FJC Judges + IDB |  |  |  |  | R | R | R | R | R |  |  |  |  |  |  |  |
| USSC Individual FY02–FY24 | C | C |  |  | C | R | R | R | R |  |  | R |  | R |  |  |
| State + Federal statutes (`entities_statutes`) | R | R | R | R | R | R | R | R |  |  |  |  |  |  |  | R |
| Attorney discipline events |  |  |  |  | R | R | R | C |  |  |  |  |  |  |  |  |
| MPV + WaPo officer-violence |  |  |  |  |  | O |  |  |  | R |  |  |  |  |  |  |
| DPIC executions |  |  |  |  | O | O |  |  |  |  |  |  |  |  |  |  |
| NRE Exonerations |  |  |  |  |  | O |  |  |  |  | O |  |  |  |  |  |
| Oyez SCOTUS cases |  |  |  |  |  | O |  |  |  |  |  |  | R |  |  |  |
| NIBRS Florida (Kaplan) |  |  |  |  |  | O |  |  |  |  |  |  |  |  |  |  |
| FARS NHTSA fatality | R |  |  |  |  | C |  |  |  |  |  |  |  |  |  |  |
| NYPD CCRB allegations |  |  |  |  |  | C |  |  |  | R |  |  |  |  |  |  |
| Chicago CPD complaints |  |  |  |  |  | C |  |  |  | R |  |  |  |  |  |  |
| Vera incarceration |  |  |  |  |  |  | C |  |  |  |  |  |  |  |  |  |
| Pattern Jury Instructions |  |  |  |  | R | R | C |  |  |  |  |  |  |  | R |  |
| Judge quotes + profiles |  |  |  |  | R | R | R | R | R |  |  |  |  |  |  |  |
| Case feature vectors |  |  |  |  |  | C |  |  |  |  | R |  |  |  |  |  |
| Stanford Open Policing | C |  |  |  |  | C |  |  |  |  |  |  |  |  |  |  |
| ACS county demographics |  |  |  |  | R |  |  |  |  |  |  |  |  |  |  |  |
| Federal Rules |  |  |  |  | C | C |  |  |  |  |  |  |  |  | C |  |
| US Code (Cornell) | C | R |  | C | C | C | C | C |  |  |  |  |  |  |  | C |

## Blast-radius reading

- **CourtListener bulk goes stale** → `case_law` + `classified_opinions` + `judge_profiles` + `judge_quotes` + `case_feature_vectors` all rot. Every paid tier degrades. Refresh trigger: when a new state ingest needs body lookup.
- **`entities_statutes` for state X is empty** → DUI Playbook for state X cannot render statute citations; Case Decoder for state X has no charge taxonomy. Per-state weekly cron must run.
- **`attorney_discipline_events` for state X stale** → IB / X-Ray / War Room miss "opposing counsel disciplined" intelligence for that state. Per-state quarterly refresh.
- **USSC `ussc_matview_meta` >30 days stale** → `/api/data-status` returns `insufficient_data`; Federal Sentencing Distribution short-circuits. Annual USSC publish cycle drives this.
- **`pattern_jury_instructions` 2nd or DC Cir** → IB / X-Ray / FJIB show `[VERIFY]` placeholder for those circuits. Paywalled — no automatic fix.
- **`judge_profiles` thin states (AK/ND/WY/PR/VI/GU)** → Judge Report Card / IB / X-Ray for those states have <10 sitting judges in our index. State-judiciary directory scrape (G8b plan) is the unblock.
- **`case_feature_vectors` sparse (no FL DUI vectors)** → Similar Cases Analyzer for FL DUI returns "no comparable cases." Pipeline handles gracefully.
- **`co_defendant_analysis` only feeds Situation Room** — drift correction: this table EXISTS (per worry-data-orphans resolution) despite older Tier 9 readiness memo claiming absence.

## Maintenance triage rules

When a refresh fails or a dataset row count drops, ask:

1. Which row in this matrix is impacted?
2. Of the columns marked `R` for that row, which products are user-visible RIGHT NOW (live + selling)?
3. Triage by revenue × visibility — the `R` cells in `IB / X-Ray / War Room / Federal Sentencing Distribution` columns block paying customers.
4. The `C` and `O` cells degrade output but do not block a render — defer to the next refresh window.
