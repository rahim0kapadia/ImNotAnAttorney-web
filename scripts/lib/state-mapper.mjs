// Maps a CourtListener court (id + full_name) to a US state postal code.
// Returns null for federal-only courts that don't map to one state
// (SCOTUS, Federal Circuit, multi-state appeals, foreign).
//
// Strategy: substring-match the full_name against the 50-state name list
// (longest-name-first to avoid "Virginia" matching "West Virginia").

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

// Sorted by state-name length descending so e.g. "West Virginia" matches
// before "Virginia" when scanning court full_name strings.
const SORTED_STATES = [...US_STATES].sort((a, b) => b[1].length - a[1].length);

/**
 * Derive a US state postal code from a CourtListener court row.
 * @param {{ court_id?: string|null, court_name?: string|null }} court
 * @returns {string|null}
 */
export function deriveStateCode({ court_id, court_name }) {
  // Hard skips: federal-only, multi-state, foreign.
  const SKIP_IDS = new Set([
    'scotus',     // Supreme Court
    'cafc',       // Federal Circuit
    'ca1', 'ca2', 'ca3', 'ca4', 'ca5', 'ca6', 'ca7', 'ca8', 'ca9', 'ca10', 'ca11', 'cadc',
    'cit',        // Court of International Trade
    'tax',        // US Tax Court
    'cofc',       // Court of Federal Claims
    'fisc', 'fiscr',
    'mc',         // Military
    'armfor',     // Armed Forces
  ]);
  if (court_id && SKIP_IDS.has(court_id)) return null;

  if (!court_name || typeof court_name !== 'string') return null;
  for (const [code, name] of SORTED_STATES) {
    // Whole-word boundary match (avoids "Indianapolis" matching "Indiana")
    const re = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(court_name)) return code;
  }
  return null;
}
