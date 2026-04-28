# State Arrest Procedure — Data Schema + Research Methodology

Per-state procedural facts surfaced in the Arrest Survival Kit ($47, Tier 9). One JSON file per state at `<lowercase-code>.json`. Loader at `src/lib/state-arrest-procedure/load.ts`. Types at `src/lib/state-arrest-procedure/types.ts`.

## Hard rule (do not break)

Per `~/.claude/rules/no-hallucinated-legal-data.md` and ARCHITECTURE.md invariant 13: **every populated field must be backed by at least one verification URL in `source_urls`**. If a field cannot be confirmed from an authoritative public source, write `null` and add the field name to `_unknown_fields`. Guessing is forbidden. The loader rejects any file that violates this rule.

## Schema

```jsonc
{
  "state_code": "FL",                     // 2-letter USPS code, uppercase
  "state_name": "Florida",                // Full state name
  "researched_at": "2026-04-28",          // ISO date the research was completed

  "first_appearance_window_hours": 24,    // Statutory window for first appearance / arraignment, in hours, or null
  "pd_attach_trigger": "at first appearance", // Plain prose: when public defender / appointed counsel attaches, or null
  "indigency_threshold": "200% of federal poverty level", // Plain prose, or null
  "bail_types_allowed": ["cash", "surety", "personal_recognizance"], // Subset of: cash, surety, signature, property, personal_recognizance
  "bail_default_amounts_by_charge": null, // Plain prose if a published bail schedule exists, else null
  "phone_call_rule": "Right to use the telephone within 3 hours of booking unless it interferes with the investigation.",
  "recording_police_consent": "one-party", // one-party | all-party | restricted | null
  "expungement_window_years": "10 years after probation completion (varies by charge)",
  "misc_quirks": [                        // 1-3 short, sourced bullets
    "Florida statute § 901.24 governs phone-call right",
    "Pinellas + Hillsborough counties run separate first-appearance dockets at 8:30am daily"
  ],

  "source_urls": [                        // Every populated field above must be backed by ≥1 entry here
    "https://www.floridabar.org/...",
    "https://www.flcourts.gov/..."
  ],
  "_unknown_fields": [                    // Field names whose values are null/empty because no source was found
    "bail_default_amounts_by_charge"
  ]
}
```

## Sources allowed (free, public, authoritative)

1. State public defender association websites
2. State bar websites (rules of criminal procedure)
3. lawhelp.org per state
4. Official .gov / state legislature pages
5. Wikipedia state-by-state arrest-procedure articles — **as a discovery aid only**. The URL Wikipedia cites is the authoritative source. Do not put the Wikipedia URL into `source_urls`; put the upstream URL it cites.

## Research methodology (per state)

1. WebSearch the state's name + "rules of criminal procedure" + "first appearance" + "right to counsel" + "bail" + "phone call" + "recording police".
2. Collect 5-10 authoritative URLs. Prefer state-bar / state-PD-association / .gov over secondary sources.
3. Extract structured fields. For each populated field, verify the value against at least one of the collected URLs and include that URL in `source_urls`.
4. Any field where the public source is silent or ambiguous is written as `null` and listed in `_unknown_fields`. Do not invent values.
5. `misc_quirks` — 1-3 short bullets that are state-specific and unusual enough to matter to a defendant. Each bullet must be reflected in at least one `source_urls` entry.

## UPL guardrail

The data is **information**, not advice. Field values describe what the law says. Do not put directive language in any field ("you should", "verify with attorney", "fire your attorney"). The kit reads as Mercer the back-room strategist showing the defendant what the system says — not telling them what to do.

## Bootstrap-mode constraints

- Public sources only.
- WebFetch and WebSearch only. No paid APIs.
- One JSON file per state. No DB tables, no migrations, no Edge Functions for this data.
- The loader is read-only and Node-side; ships in the Vercel build.

## File naming

Lowercase USPS code, `.json` extension. `fl.json`, `tx.json`, `ca.json`, etc. The 50 states only — DC, PR, VI, GU, AS, MP are out of scope for v3.
