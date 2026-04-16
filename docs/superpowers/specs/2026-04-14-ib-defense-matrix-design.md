# IB Defense Intelligence Matrix, Spec

## Problem
Intelligence Brief uses Claude to guess at legal strategy patterns. We have 4.2M classified opinions with real motion success rates and defense theory outcomes. The data should render mechanically (no hallucination risk, faster, cheaper), with Claude only personalizing the connection to the defendant's facts.

## Architecture

### Data Flow
```
intake (charge_type + state)
  → fetchDefenseIntelligenceForIB() [raw PostgREST]
    → defense_theory_outcomes (jurisdiction-wide, N >= 5)
    → motion_success_patterns (jurisdiction-wide, judge_id IS NULL, N >= 5)
  → TWO outputs:
    1. renderDefenseMatrix() → HTML appendix (mechanical, no Claude)
    2. Structured summary → injected into IBVariables for Claude section prompts
```

### Tier Boundaries (HARD GATE)
| Data | IB ($997) | X-Ray ($2,497) | War Room ($4,997) |
|------|---------, |----------------|-------------------|
| Motion rates (jurisdiction-wide) | Mechanical matrix | Yes | Yes |
| Defense theory outcomes | Mechanical matrix | Yes | Yes |
| Top opinions + holdings | 3 cases | 10 cases | 25 cases |
| Judge-specific patterns | NO | Yes | Yes |
| Judge vs jurisdiction comparison | NO | Yes | Yes |
| Prosecutor pairing | NO | NO | Yes |
| Similar case matching | NO | NO | Yes |

### Changes (1 file: `supabase/functions/generate-report/index.ts`)

The Edge Function is self-contained (~4000 lines, Deno, no npm imports). It has its OWN copies of prompt builders and render functions separate from the Next.js modules. All changes below are in this file.

**IMPORTANT: The Edge Function's `renderIBReportHtml()` (~line 5366) is a SEPARATE copy from `src/lib/intelligence-brief/render.ts`. It currently LACKS the `tier9-data-appendix` slot. Must add it.**

**IMPORTANT: The Edge Function's `buildIBPrompt()` (~line 4704) is SEPARATE from `src/lib/intelligence-brief/prompts.ts`. The `<defense_intelligence>` block must be injected in the Edge Function's prompt builder, not in prompts.ts.**

#### 1. `fetchDefenseIntelligenceForIB(chargeType, state, supabaseUrl, supabaseKey)`
Raw PostgREST queries (select only needed columns):
- `GET /rest/v1/defense_theory_outcomes?charge_slug=eq.{chargeType}&jurisdiction=eq.{state}&attempts=gte.5&order=attempts.desc&limit=10&select=defense_theory,attempts,successes,motion_success_rate,best_combined_motion,sample_source_urls,data_source_note`
- `GET /rest/v1/motion_success_patterns?charge_slug=eq.{chargeType}&jurisdiction=eq.{state}&judge_id=is.null&filed_count=gte.5&order=filed_count.desc&limit=10&select=motion_type,filed_count,granted_count,denied_count,grant_rate,sample_source_urls,data_source_note`

Note: `judge_id=is.null` returns jurisdiction-wide aggregates only (IB tier gate). This differs from `query.ts` which returns ALL rows when judgeId is null. Raw PostgREST is intentional here to enforce the tier boundary.

Note: `charge_slug` must match `intake.charge_type` values. Both use the `common_charges.slug` taxonomy (e.g., "dui-dwi", "drug-possession", "assault"). If no match, queries return empty, graceful degradation.

Returns: `{ theories: TheoryOutcome[], motions: MotionPattern[], isEmpty: boolean }`

Graceful degradation: returns `{ theories: [], motions: [], isEmpty: true }` on any error or empty tables.

#### 2. `renderDefenseMatrix(data, chargeLabel, state)`
Pure HTML render. No Claude call. Includes `data_source_note` from DB (appellate bias caveat). Template:

```html
<h2 class="section-h2">Appendix F: Data-Driven Defense Intelligence</h2>
<p class="body-text"><strong>{N} verified data points</strong> compiled from classified court opinions in {state}.</p>

<h3 class="section-h3">Defense Theory Success Rates</h3>
<table class="report-table">
  <tr><th>Theory</th><th>Cases</th><th>Success Rate</th><th>Best Motion Pairing</th></tr>
  ...rows with data from defense_theory_outcomes...
</table>

<h3 class="section-h3">Motion Filing Patterns</h3>
<table class="report-table">
  <tr><th>Motion Type</th><th>Filed</th><th>Granted</th><th>Grant Rate</th></tr>
  ...rows with data from motion_success_patterns...
</table>

<p class="source-note">{data_source_note from DB, includes appellate bias caveat}</p>
<p class="source-note">Every data point traces to a public court opinion. This is historical pattern data, not a prediction for your case.</p>
```

If `isEmpty`: returns empty string (no appendix rendered, IB identical to before).

#### 3. Add `tier9-data-appendix` slot to `renderIBReportHtml()`
The Edge Function's render function (~line 5366) section array must add:
```js
// Appendix F: Data-Driven Defense Intelligence (mechanical render, no Claude)
allOutputs["tier9-data-appendix"] || "",
```
After `buildYourRights(stateForRights)` (~line 5380), matching the slot that already exists in `src/lib/intelligence-brief/render.ts:341`.

#### 4. Inject data summary into `buildIBPrompt()` for Claude sections
In the Edge Function's IB prompt builder (~line 4704), add the `<defense_intelligence>` block to the `case-intelligence` and `legal-options` section prompts:

```xml
<defense_intelligence context="IB tier, jurisdiction-level, verified court data. DO NOT fabricate statistics.">
MOTION FILING PATTERNS ({state}, {charge}):
- Motion to suppress: 43% granted (156 filed)
- Motion to dismiss: 22% granted (89 filed)

DEFENSE THEORY OUTCOMES:
- Self-defense: 38% success (47 attempts)
- Lack of intent: 52% success (23 attempts)

RULES: Reference specific rates when presenting legal information. Never invent statistics beyond what is provided here. If this block is empty, do not fabricate rates.
</defense_intelligence>
```

This data is fetched once in `buildUserPrompt()` and formatted into a string that gets injected into the relevant section prompts. Pattern matches how JUSTFAIR data is post-injected (~line 4251).

#### 5. Pass mechanical HTML as `allOutputs["tier9-data-appendix"]`
In the IB generation flow, after fetching defense intelligence data and before the Phase A/B section generation:
```js
// Mechanical render, bypasses Claude for Appendix F
if (!defenseIntel.isEmpty) {
  allOutputs["tier9-data-appendix"] = renderDefenseMatrix(defenseIntel, intake.charge_type, intake.state);
}
```
This means `buildTier9DataAppendix()` in prompts.ts is never called for this section, the mechanical HTML takes its place.

### What Does NOT Change
- `src/lib/intelligence-brief/prompts.ts`, NOT used by Edge Function (it has own prompt builders)
- `src/lib/intelligence-brief/variables.ts`, NOT used by Edge Function
- `src/lib/intelligence-brief/render.ts`, NOT used by Edge Function (it has own render)
- Case Decoder generation flow, defense intelligence only injected for IB path
- Graceful degradation: empty tables = no matrix = IB identical to before
