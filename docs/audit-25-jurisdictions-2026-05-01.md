# 25-Jurisdiction Anti-Hallucination Audit

Date: 2026-05-01
Total rows: 19067
Total jurisdictions: 25

## Per-state results

| Jurisdiction | Rows | null_src | non_https | bad_hash | thin_body | wrong_juris | Status |
|---|---|---|---|---|---|---|---|
| AK | 361 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| AR | 1072 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| CA | 159 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| CO | 678 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| DC | 530 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| FL | 470 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| GA | 631 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| ID | 911 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| KY | 441 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| MN | 1130 | 0 | 0 | 0 | 10 | 0 | VIOLATIONS |
| MO | 574 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| MS | 754 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| NC | 3342 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| ND | 288 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| NE | 584 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| OH | 433 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| SC | 515 | 0 | 0 | 0 | 5 | 0 | VIOLATIONS |
| SD | 241 | 0 | 0 | 0 | 2 | 0 | VIOLATIONS |
| TN | 730 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| US | 2277 | 0 | 0 | 2241 | 2241 | 0 | VIOLATIONS |
| VA | 595 | 0 | 0 | 0 | 40 | 0 | VIOLATIONS |
| VT | 925 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| WA | 606 | 0 | 0 | 0 | 0 | 0 | CLEAN |
| WV | 540 | 0 | 0 | 0 | 38 | 0 | VIOLATIONS |
| WY | 280 | 0 | 0 | 0 | 0 | 0 | CLEAN |

## Aggregate

- Total rows: 19067
- Total CLEAN states: 19 / 25
- States with violations: MN, SC, SD, US, VA, WV

## Violations sample

### MN (10 thin_body violations)

- `ef91f9f7-584b-4c01-a9a5-9f9d32598ae5`: thin_body (text_length=36)
- `71658dc3-b759-4a49-a84c-e443aa300293`: thin_body (text_length=131)
- `5aedc749-a488-43ef-bc59-e127bb08caa0`: thin_body (text_length=131)

### SC (5 thin_body violations)

- `c1d63479-d037-4a9c-9e7d-06df063b7438`: thin_body (text_length=194)
- `be70ee90-9703-4b96-8e49-52e282a3b660`: thin_body (text_length=2091)
- `e53251df-7389-4398-9c2b-ab0949046ea6`: thin_body (text_length=26)

### SD (2 thin_body violations)

- `de8823f2-4ca5-4643-9a59-d64571c1a188`: thin_body (text_length=212)
- `51823296-0e25-48f7-9ec2-a64c2395806f`: thin_body (text_length=124)

### US (2241 bad_hash + thin_body violations)

Critical: 2241 US federal statute rows have either missing/empty text_hash OR section_text < 50 chars. These are generated USPTO records. Recommend: manual review or regeneration of US federal statute corpus.

### VA (40 thin_body violations)

- `c7ce99e2-7b2b-4a81-a44a-b2d9b2d7170c`: thin_body (text_length=318)
- `a3cbb61a-e7ad-4eff-aef2-0391c71ec3ba`: thin_body (text_length=94)
- `25d188e1-f9e4-46ca-9221-9b694543dc98`: thin_body (text_length=65)

### WV (38 thin_body violations)

WV rows with section_text < 50 chars. Manual verification pending.


