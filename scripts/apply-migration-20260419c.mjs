// Apply 20260419c_partner_peer_benchmark_revoke_authenticated.sql via direct Postgres.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260419c_partner_peer_benchmark_revoke_authenticated.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("revoke applied");

// Verify authenticated no longer has EXECUTE. pg_proc.proacl stores ACL as
// {role=privs/grantor}. "authenticated=X/" would indicate EXECUTE; absence
// of that entry (or empty ACL) proves the revoke worked.
const acl = await query(
  `SELECT proacl::text AS acl
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'partner_peer_benchmark';`,
);
console.log("acl:", JSON.stringify(acl, null, 2));
const aclText = acl[0]?.acl || "";
if (aclText.includes("authenticated=")) {
  console.error("FAIL: authenticated still has grants on partner_peer_benchmark");
  process.exit(1);
}
console.log("OK — authenticated has no grants on partner_peer_benchmark");

await end();
