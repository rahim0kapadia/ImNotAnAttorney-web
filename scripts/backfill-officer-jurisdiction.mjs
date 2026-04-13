/**
 * Backfill officer_reliability.jurisdiction from brady_history cluster IDs.
 *
 * Uses statute-case-law-dump.json to map cluster_id → court name → state code.
 * For officers with clusters in multiple states, picks the majority state.
 *
 * Usage:
 *   node scripts/backfill-officer-jurisdiction.mjs              # Dry run
 *   node scripts/backfill-officer-jurisdiction.mjs --apply      # Apply updates
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");

const applyMode = process.argv.includes("--apply");

// ── Load env vars ────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
loadEnvFile(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// ── Court name → state code ──────────────────────────────────────────────────
const STATE_NAMES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "d.c.": "DC",
};

function deriveState(courtName) {
  if (!courtName) return null;
  const lc = courtName.toLowerCase();
  if (lc.indexOf("circuit") >= 0 || lc.indexOf("united states") >= 0) return "federal";
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (lc.indexOf(name) >= 0) return code;
  }
  return null;
}

function esc(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") out.push("''");
    else out.push(s[i]);
  }
  return "'" + out.join("") + "'";
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== OFFICER RELIABILITY JURISDICTION BACKFILL ===\n");

  // Build cluster → state map from dump
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const clusterToState = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id && r.court) {
      const state = deriveState(r.court);
      if (state) clusterToState.set(String(r.courtlistener_cluster_id), state);
    }
  }
  console.log("Cluster-to-state mappings from dump:", clusterToState.size);

  // Fetch all officers with jurisdiction='multi' (paginate via Range header)
  let allOfficers = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/officer_reliability?select=id,officer_name,brady_history&jurisdiction=eq.multi`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        },
      }
    );
    const rows = await resp.json();
    allOfficers = allOfficers.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log("Officers with jurisdiction='multi':", allOfficers.length);

  // Resolve jurisdiction per officer from cluster IDs
  const updates = [];
  let resolved = 0;
  let unresolved = 0;

  for (const officer of allOfficers) {
    const clusterIds = officer.brady_history || [];
    const stateCounts = {};
    for (const cid of clusterIds) {
      const state = clusterToState.get(String(cid));
      if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
    }
    const entries = Object.entries(stateCounts);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      updates.push({ id: officer.id, jurisdiction: entries[0][0] });
      resolved++;
    } else {
      unresolved++;
    }
  }
  console.log("Resolved:", resolved, "| Unresolved:", unresolved);

  if (!applyMode) {
    console.log("\nDry run — sample updates:");
    for (let i = 0; i < Math.min(10, updates.length); i++) {
      const u = updates[i];
      const off = allOfficers.find((o) => o.id === u.id);
      console.log(`  ${(off?.officer_name || "?").padEnd(25)} → ${u.jurisdiction}`);
    }
    console.log("\nRun with --apply to execute.");
    return;
  }

  // Build and apply SQL in batches
  const BATCH_SIZE = 200;
  let applied = 0;
  let errors = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const sql = batch
      .map((u) => `UPDATE officer_reliability SET jurisdiction = ${esc(u.jurisdiction)} WHERE id = ${esc(u.id)};`)
      .join("\n");

    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (resp.ok) {
      applied += batch.length;
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} updated`);
    } else {
      const t = await resp.text();
      console.error(`Batch failed: ${t.slice(0, 200)}`);
      errors++;
    }
  }

  console.log(`\nDone. Applied: ${applied}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
