/**
 * src/lib/district-court/codes.ts
 *
 * Canonical list of the 94 federal district courts.
 * Source: PACER court list (https://www.pacer.gov/psco/cgi-bin/links.pl).
 * Static data — no live fetch required.
 *
 * Codes follow the CourtListener court_id convention (lower-case, hyphen-free
 * for most districts, matching cl_dockets.court_id).
 */

export interface FederalDistrict {
  /** CourtListener-style court_id used as URL slug and DB filter key. */
  code: string;
  /** Human-readable district name. */
  name: string;
  /** Two-letter state abbreviation (or territory code). */
  state: string;
}

export const FEDERAL_DISTRICTS: FederalDistrict[] = [
  // Alabama
  { code: "almd", name: "Middle District of Alabama", state: "AL" },
  { code: "alnd", name: "Northern District of Alabama", state: "AL" },
  { code: "alsd", name: "Southern District of Alabama", state: "AL" },
  // Alaska
  { code: "akd", name: "District of Alaska", state: "AK" },
  // Arizona
  { code: "azd", name: "District of Arizona", state: "AZ" },
  // Arkansas
  { code: "ared", name: "Eastern District of Arkansas", state: "AR" },
  { code: "arwd", name: "Western District of Arkansas", state: "AR" },
  // California
  { code: "cacd", name: "Central District of California", state: "CA" },
  { code: "caed", name: "Eastern District of California", state: "CA" },
  { code: "cand", name: "Northern District of California", state: "CA" },
  { code: "casd", name: "Southern District of California", state: "CA" },
  // Colorado
  { code: "cod", name: "District of Colorado", state: "CO" },
  // Connecticut
  { code: "ctd", name: "District of Connecticut", state: "CT" },
  // Delaware
  { code: "ded", name: "District of Delaware", state: "DE" },
  // District of Columbia
  { code: "dcd", name: "District of the District of Columbia", state: "DC" },
  // Florida
  { code: "flmd", name: "Middle District of Florida", state: "FL" },
  { code: "flnd", name: "Northern District of Florida", state: "FL" },
  { code: "flsd", name: "Southern District of Florida", state: "FL" },
  // Georgia
  { code: "gamd", name: "Middle District of Georgia", state: "GA" },
  { code: "gand", name: "Northern District of Georgia", state: "GA" },
  { code: "gasd", name: "Southern District of Georgia", state: "GA" },
  // Guam
  { code: "gud", name: "District of Guam", state: "GU" },
  // Hawaii
  { code: "hid", name: "District of Hawaii", state: "HI" },
  // Idaho
  { code: "idd", name: "District of Idaho", state: "ID" },
  // Illinois
  { code: "ilcd", name: "Central District of Illinois", state: "IL" },
  { code: "ilnd", name: "Northern District of Illinois", state: "IL" },
  { code: "ilsd", name: "Southern District of Illinois", state: "IL" },
  // Indiana
  { code: "innd", name: "Northern District of Indiana", state: "IN" },
  { code: "insd", name: "Southern District of Indiana", state: "IN" },
  // Iowa
  { code: "iand", name: "Northern District of Iowa", state: "IA" },
  { code: "iasd", name: "Southern District of Iowa", state: "IA" },
  // Kansas
  { code: "ksd", name: "District of Kansas", state: "KS" },
  // Kentucky
  { code: "kyed", name: "Eastern District of Kentucky", state: "KY" },
  { code: "kywd", name: "Western District of Kentucky", state: "KY" },
  // Louisiana
  { code: "laed", name: "Eastern District of Louisiana", state: "LA" },
  { code: "lamd", name: "Middle District of Louisiana", state: "LA" },
  { code: "lawd", name: "Western District of Louisiana", state: "LA" },
  // Maine
  { code: "med", name: "District of Maine", state: "ME" },
  // Maryland
  { code: "mdd", name: "District of Maryland", state: "MD" },
  // Massachusetts
  { code: "mad", name: "District of Massachusetts", state: "MA" },
  // Michigan
  { code: "mied", name: "Eastern District of Michigan", state: "MI" },
  { code: "miwd", name: "Western District of Michigan", state: "MI" },
  // Minnesota
  { code: "mnd", name: "District of Minnesota", state: "MN" },
  // Mississippi
  { code: "msnd", name: "Northern District of Mississippi", state: "MS" },
  { code: "mssd", name: "Southern District of Mississippi", state: "MS" },
  // Missouri
  { code: "moed", name: "Eastern District of Missouri", state: "MO" },
  { code: "mowd", name: "Western District of Missouri", state: "MO" },
  // Montana
  { code: "mtd", name: "District of Montana", state: "MT" },
  // Nebraska
  { code: "ned", name: "District of Nebraska", state: "NE" },
  // Nevada
  { code: "nvd", name: "District of Nevada", state: "NV" },
  // New Hampshire
  { code: "nhd", name: "District of New Hampshire", state: "NH" },
  // New Jersey
  { code: "njd", name: "District of New Jersey", state: "NJ" },
  // New Mexico
  { code: "nmd", name: "District of New Mexico", state: "NM" },
  // New York
  { code: "nyed", name: "Eastern District of New York", state: "NY" },
  { code: "nynd", name: "Northern District of New York", state: "NY" },
  { code: "nysd", name: "Southern District of New York", state: "NY" },
  { code: "nywd", name: "Western District of New York", state: "NY" },
  // North Carolina
  { code: "nced", name: "Eastern District of North Carolina", state: "NC" },
  { code: "ncmd", name: "Middle District of North Carolina", state: "NC" },
  { code: "ncwd", name: "Western District of North Carolina", state: "NC" },
  // North Dakota
  { code: "ndd", name: "District of North Dakota", state: "ND" },
  // Northern Mariana Islands
  { code: "nmid", name: "District of the Northern Mariana Islands", state: "MP" },
  // Ohio
  { code: "ohnd", name: "Northern District of Ohio", state: "OH" },
  { code: "ohsd", name: "Southern District of Ohio", state: "OH" },
  // Oklahoma
  { code: "oked", name: "Eastern District of Oklahoma", state: "OK" },
  { code: "oknd", name: "Northern District of Oklahoma", state: "OK" },
  { code: "okwd", name: "Western District of Oklahoma", state: "OK" },
  // Oregon
  { code: "ord", name: "District of Oregon", state: "OR" },
  // Pennsylvania
  { code: "paed", name: "Eastern District of Pennsylvania", state: "PA" },
  { code: "pamd", name: "Middle District of Pennsylvania", state: "PA" },
  { code: "pawd", name: "Western District of Pennsylvania", state: "PA" },
  // Puerto Rico
  { code: "prd", name: "District of Puerto Rico", state: "PR" },
  // Rhode Island
  { code: "rid", name: "District of Rhode Island", state: "RI" },
  // South Carolina
  { code: "scd", name: "District of South Carolina", state: "SC" },
  // South Dakota
  { code: "sdd", name: "District of South Dakota", state: "SD" },
  // Tennessee
  { code: "tned", name: "Eastern District of Tennessee", state: "TN" },
  { code: "tnmd", name: "Middle District of Tennessee", state: "TN" },
  { code: "tnwd", name: "Western District of Tennessee", state: "TN" },
  // Texas
  { code: "txed", name: "Eastern District of Texas", state: "TX" },
  { code: "txnd", name: "Northern District of Texas", state: "TX" },
  { code: "txsd", name: "Southern District of Texas", state: "TX" },
  { code: "txwd", name: "Western District of Texas", state: "TX" },
  // Utah
  { code: "utd", name: "District of Utah", state: "UT" },
  // Vermont
  { code: "vtd", name: "District of Vermont", state: "VT" },
  // Virgin Islands
  { code: "vid", name: "District of the Virgin Islands", state: "VI" },
  // Virginia
  { code: "vaed", name: "Eastern District of Virginia", state: "VA" },
  { code: "vawd", name: "Western District of Virginia", state: "VA" },
  // Washington
  { code: "waed", name: "Eastern District of Washington", state: "WA" },
  { code: "wawd", name: "Western District of Washington", state: "WA" },
  // West Virginia
  { code: "wvnd", name: "Northern District of West Virginia", state: "WV" },
  { code: "wvsd", name: "Southern District of West Virginia", state: "WV" },
  // Wisconsin
  { code: "wied", name: "Eastern District of Wisconsin", state: "WI" },
  { code: "wiwd", name: "Western District of Wisconsin", state: "WI" },
  // Wyoming
  { code: "wyd", name: "District of Wyoming", state: "WY" },
];

/** Quick O(1) lookup by code. Built once at module load. */
const BY_CODE = new Map<string, FederalDistrict>(
  FEDERAL_DISTRICTS.map((d) => [d.code, d])
);

/** Returns the district for a given code, or undefined if not found. */
export function getDistrictByCode(code: string): FederalDistrict | undefined {
  return BY_CODE.get(code.toLowerCase());
}

/** Returns all district codes — used by generateStaticParams. */
export function allDistrictCodes(): string[] {
  return FEDERAL_DISTRICTS.map((d) => d.code);
}

/** Returns all districts grouped by state code. */
export function districtsByState(): Map<string, FederalDistrict[]> {
  const map = new Map<string, FederalDistrict[]>();
  for (const d of FEDERAL_DISTRICTS) {
    const list = map.get(d.state) ?? [];
    list.push(d);
    map.set(d.state, list);
  }
  return map;
}
