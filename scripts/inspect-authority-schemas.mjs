#!/usr/bin/env node
// Inspect live schema + sample rows for the 4 tables backing charge-authority-pack.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env.local parser (no dotenv dep)
const envPath = resolve(process.cwd(), ".env.local");
try {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch (e) {
  console.error("Could not read .env.local:", e.message);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const tables = [
  "charge_type_top_authorities",
  "authority_quotes_criminal",
  "citation_authority_criminal",
  "citation_velocity_criminal",
];

for (const t of tables) {
  console.log(`\n===== ${t} =====`);
  const { data, error, count } = await sb
    .from(t)
    .select("*", { count: "exact", head: false })
    .limit(3);
  if (error) {
    console.error("ERR:", error.message);
    continue;
  }
  console.log("count:", count);
  if (data && data.length > 0) {
    console.log("columns:", Object.keys(data[0]).join(", "));
    console.log("sample row 0:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("(no rows returned)");
  }
}

console.log("\n===== DISTINCT charge_type_top_authorities.charge_type =====");
const { data: cts } = await sb
  .from("charge_type_top_authorities")
  .select("charge_type")
  .limit(1000);
if (cts) {
  const uniq = [...new Set(cts.map((r) => r.charge_type))].sort();
  console.log("distinct charge_type count:", uniq.length);
  console.log("values:", uniq.join(", "));
}

console.log("\n===== citation_authority_by_jurisdiction (optional join table) =====");
const { data: cabj, error: cabjErr, count: cabjCount } = await sb
  .from("citation_authority_by_jurisdiction")
  .select("*", { count: "exact", head: false })
  .limit(3);
if (cabjErr) console.error("ERR:", cabjErr.message);
else {
  console.log("count:", cabjCount);
  if (cabj && cabj.length > 0) {
    console.log("columns:", Object.keys(cabj[0]).join(", "));
    console.log("sample:", JSON.stringify(cabj[0], null, 2));
  }
}
