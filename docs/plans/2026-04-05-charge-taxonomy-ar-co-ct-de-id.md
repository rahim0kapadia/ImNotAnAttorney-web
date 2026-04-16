# Plan: Add Charge Taxonomy Files for AR, CO, CT, DE, ID

## Summary
Write 5 new JSON charge taxonomy files to `data/charge-taxonomy/` for Arkansas, Colorado, Connecticut, Delaware, and Idaho. Each file follows the existing format (AL.json) with 80 charges per state covering DUI, drugs, violent crimes, property, domestic, weapons, fraud, sex offenses, public order, probation/parole, and other (conspiracy, aiding-abetting, attempt).

## Files to Create
1. `data/charge-taxonomy/AR.json`, Arkansas (Ark. Code Ann. citations), DONE
2. `data/charge-taxonomy/CO.json`, Colorado (C.R.S. citations), DONE
3. `data/charge-taxonomy/CT.json`, Connecticut (Conn. Gen. Stat. citations), DONE
4. `data/charge-taxonomy/DE.json`, Delaware (Del. C. citations), DONE
5. `data/charge-taxonomy/ID.json`, Idaho (Idaho Code citations), PENDING

## Files to Modify
None.

## Tasks
1. [x] Read AL.json to understand exact format and slug values
2. [x] Write AR.json with 80 charges using Ark. Code Ann. citation format
3. [x] Write CO.json with 80 charges using C.R.S. citation format
4. [x] Write CT.json with 80 charges using Conn. Gen. Stat. citation format
5. [x] Write DE.json with 80 charges using 11 Del. C. / 16 Del. C. citation format
6. [ ] Write ID.json with 80 charges using Idaho Code citation format
7. [ ] Validate all 5 files are valid JSON

## Research
Statute data sourced from official state legislature websites. All citation formats match state conventions. Each state uses real statute numbers for their specific criminal code.
