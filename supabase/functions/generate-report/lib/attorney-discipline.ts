// supabase/functions/generate-report/lib/attorney-discipline.ts
//
// T1.2 (worry-attorney-discipline-wire v2.4) — RPC client for the attorney
// directory + discipline-events lookup, used by the IB renderer.
//
// Hard rules baked in:
//   - CA-only jurisdiction guard (defense-in-depth — multi-state expansion is
//     blocked on per-state fair-report memos; see T0b memo).
//   - Sanitization in fixed order; ANY garbage / wildcard / control-char input
//     short-circuits to no-match WITHOUT a DB roundtrip.
//   - NO JS-side unaccent shim. Postgres applies `lower(immutable_unaccent($1))`
//     on both sides; raw input goes to the RPC.
//   - Ambiguous match (>1 row) → return no-match. Disambiguation is out of v2.
//
// See also:
//   - migrations/20260425a_attorney_discipline_rls.sql       (T0a — RLS)
//   - migrations/20260425c_attorney_unaccent.sql              (T1.1a — RPC)
//   - lib/render-attorney-discipline.ts                       (T2.2 — renderer)
//   - __tests__/attorney-discipline.test.ts                   (T1.4 — unit tests)

export type AttorneyRow = {
  id: number;
  jurisdiction: string;
  bar_number: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  admission_date: string | null;        // ISO date YYYY-MM-DD
  current_status: string | null;        // 'active' | 'inactive' | 'disbarred' | 'suspended' | 'resigned'
  firm: string | null;
  city: string | null;
  source_url: string | null;
  last_seen_at: string;                  // timestamptz
  created_at: string;                    // timestamptz
};

export type DisciplineEvent = {
  id?: number;
  attorney_id?: number | null;
  jurisdiction?: string;
  bar_number?: string;
  full_name?: string;
  order_date: string | null;            // ISO date
  effective_date?: string | null;
  discipline_type: string;
  discipline_raw: string | null;
  violation_summary: string | null;
  order_url: string | null;
  source_url: string | null;
  scraped_at?: string;
};

export type DisciplineLookupResult =
  | {
      status: "matched";
      attorney: AttorneyRow;
      events: DisciplineEvent[];
    }
  | {
      status: "no-match";
      attorney: null;
      events: [];
    };

export type DisciplineLookupOptions = {
  /** Supabase project URL (e.g., https://<ref>.supabase.co). */
  supabaseUrl: string;
  /** Service-role key. anon-key callers will hit a 404 PGRST202 on the RPC. */
  serviceRoleKey: string;
  /**
   * Optional fetch override for tests. Production code passes `globalThis.fetch`
   * implicitly. Tests inject a mock to verify garbage-input short-circuits skip
   * the DB roundtrip entirely.
   */
  fetchImpl?: typeof fetch;
};

const NO_MATCH: DisciplineLookupResult = {
  status: "no-match",
  attorney: null,
  events: [],
};

// Garbage-input regex — fires AFTER trim+collapse-whitespace+length-check+
// no-whitespace check. Multi-token garbage like "asdf foo" passes this gate
// and reaches the DB (harmless DB roundtrip — returns no-match).
const GARBAGE_REGEX =
  /^(asdf|qwerty|test|n\s*\/?\s*a|none|na|null|undefined|tbd|tbc|x{2,}|z{2,})$/i;

// Control characters — \r, \n, \x00 — reject outright.
const CTRL_REGEX = /[\r\n\x00]/;

// PostgREST-special characters — wildcards and filter delimiters.
//   * % → ilike wildcards (defamation surface — "Smith*" matches all Smith*)
//   , ( ) → PostgREST filter separators
//   : → PostgREST operator delimiter
//   _ → SQL LIKE single-char wildcard
//   . → reserved in PostgREST identifiers
const POSTGREST_SPECIAL_REGEX = /[*%_,():.]/;

/**
 * Sanitize the raw attorney name input. Returns `null` on rejected inputs.
 * Steps applied IN ORDER (changing the order opens new bypass paths):
 *   0. type gate
 *   1. trim
 *   2. collapse interior whitespace
 *   3. garbage-input gate (single-token only — multi-token reaches DB harmlessly)
 *   4. control-char gate
 *   5. postgrest-special gate
 *   6. cap to 200 chars
 *   7. empty-after-sanitize gate
 */
function sanitizeAttorneyName(input: unknown): string | null {
  // Step 0 — type gate. Closes the JS-coercion path where `String(null)`
  // returns "null" (4 chars, no whitespace) and bypasses the empty-check.
  if (typeof input !== "string") return null;

  // Step 1 — trim.
  let s = input.trim();

  // Step 2 — control-char gate (BEFORE whitespace collapse). \n, \r, \t are
  // whitespace and would be eaten by the next step; \x00 is the only ctrl
  // char left after collapse — but checking pre-collapse covers all of them
  // and surfaces injection attempts that use non-printable separators.
  if (CTRL_REGEX.test(s)) return null;

  // Step 3 — collapse interior whitespace.
  s = s.replace(/\s+/g, " ");

  // Step 4 — length gate.
  if (s.length < 3) return null;

  // Step 5 — garbage-input gate. Runs on multi-token AND single-token forms
  // so "n a" / "n / a" boilerplate is rejected before any DB call.
  if (GARBAGE_REGEX.test(s)) return null;

  // Step 6 — single-token rejection (real attorney names have first + last;
  // exact-match-only requires whitespace separator).
  if (!/\s/.test(s)) return null;

  // Step 7 — postgrest-special gate.
  if (POSTGREST_SPECIAL_REGEX.test(s)) return null;

  // Step 8 — cap.
  if (s.length > 200) s = s.slice(0, 200);

  // Step 9 — empty after sanitize.
  if (s.length === 0) return null;

  return s;
}

/**
 * Lookup attorney + their disciplinary history by raw intake name.
 *
 * Returns `{ status: "matched", attorney, events[] }` on EXACTLY-ONE match,
 * `{ status: "no-match", attorney: null, events: [] }` on zero / 2+ /
 * sanitize-fail / non-CA / network-error.
 */
export async function getAttorneyDiscipline(
  attorneyName: unknown,
  jurisdiction: unknown,
  options: DisciplineLookupOptions
): Promise<DisciplineLookupResult> {
  // Jurisdiction guard — defense-in-depth for v2's CA-only fair-report scope.
  // TODO(per-state-memo): when adding a state, write the per-state fair-report
  // memo first (T0b extension), then add the state code here.
  if (jurisdiction !== "CA") return NO_MATCH;

  const sanitized = sanitizeAttorneyName(attorneyName);
  if (sanitized === null) return NO_MATCH;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  let attorneys: AttorneyRow[];
  try {
    const r = await fetchImpl(
      `${options.supabaseUrl}/rest/v1/rpc/attorney_match_by_raw_name`,
      {
        method: "POST",
        headers: {
          apikey: options.serviceRoleKey,
          Authorization: `Bearer ${options.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jur: jurisdiction, raw_name: sanitized }),
      }
    );
    if (!r.ok) {
      console.error(
        `attorney_match_by_raw_name HTTP ${r.status}: ${await r.text()}`
      );
      return NO_MATCH;
    }
    attorneys = (await r.json()) as AttorneyRow[];
  } catch (err) {
    console.error("attorney_match_by_raw_name fetch error", err);
    return NO_MATCH;
  }

  if (!Array.isArray(attorneys) || attorneys.length !== 1) {
    // 0 → no match. 2+ → ambiguous → no match (Code v1 WARN #15).
    return NO_MATCH;
  }
  const attorney = attorneys[0];

  // Pull discipline events for this attorney.
  let events: DisciplineEvent[];
  try {
    const r2 = await fetchImpl(
      `${options.supabaseUrl}/rest/v1/attorney_discipline_events?attorney_id=eq.${attorney.id}&select=*&order=order_date.desc`,
      {
        headers: {
          apikey: options.serviceRoleKey,
          Authorization: `Bearer ${options.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!r2.ok) {
      console.error(
        `attorney_discipline_events HTTP ${r2.status}: ${await r2.text()}`
      );
      events = [];
    } else {
      events = (await r2.json()) as DisciplineEvent[];
    }
  } catch (err) {
    console.error("attorney_discipline_events fetch error", err);
    events = [];
  }

  return { status: "matched", attorney, events };
}

// Visible for tests (string predicates) — single-source-of-truth so tests
// don't drift from implementation. NOT part of the public contract.
export const __INTERNALS = {
  sanitizeAttorneyName,
  GARBAGE_REGEX,
  CTRL_REGEX,
  POSTGREST_SPECIAL_REGEX,
};
