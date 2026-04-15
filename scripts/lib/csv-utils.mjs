/** Strip surrounding quotes from CSV values (CL CSVs quote ALL values). */
export function stripQuotes(val) {
  if (!val) return val;
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  return val;
}
