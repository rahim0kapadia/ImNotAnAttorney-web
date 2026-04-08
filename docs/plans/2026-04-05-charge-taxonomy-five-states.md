# Plan: Add Charge Taxonomy Files for SD, TN, TX, UT, VT

## Summary
Write 5 new JSON charge taxonomy files to `data/charge-taxonomy/` for South Dakota, Tennessee, Texas, Utah, and Vermont. Each file follows the existing format (FL.json, GA.json, etc.) with 80-100 charges per state covering DUI, drugs, violent crimes, property, domestic, weapons, fraud, sex offenses, public order, and probation.

## Files to Create
1. `data/charge-taxonomy/SD.json` — South Dakota (SDCL citations)
2. `data/charge-taxonomy/TN.json` — Tennessee (Tenn. Code Ann. citations)
3. `data/charge-taxonomy/TX.json` — Texas (Tex. Penal Code / Tex. Health & Safety Code citations)
4. `data/charge-taxonomy/UT.json` — Utah (Utah Code citations)
5. `data/charge-taxonomy/VT.json` — Vermont (V.S.A. citations)

## Files to Modify
None.

## Tasks
1. Write SD.json with ~85 charges using SDCL citation format
2. Write TN.json with ~90 charges using Tenn. Code Ann. citation format
3. Write TX.json with ~95 charges using Tex. Penal Code / Tex. Health & Safety Code citation format
4. Write UT.json with ~85 charges using Utah Code citation format
5. Write VT.json with ~85 charges using V.S.A. citation format
6. Validate all 5 files are valid JSON

## Research
Statute data sourced from official state legislature websites and verified legal reference sites. All citation formats match state conventions.
