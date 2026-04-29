import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"(.*)"$/,"$1")];}));

const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?tier=eq.arrest-survival-kit&order=created_at.desc&limit=3&select=id,email,tier,product_type,status,paid_at,created_at,standalone_intake_token,standalone_report_token_plaintext,plaintext_tokens_expires_at,standalone_intake,stripe_session_id`;
const r = await fetch(url, {
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
});
const orders = await r.json();
if (!Array.isArray(orders)) { console.error("ERR:", orders); process.exit(1); }
console.log(`${orders.length} arrest-survival-kit orders (newest first):\n`);
for (const o of orders) {
  console.log(`id: ${o.id}`);
  console.log(`  created_at: ${o.created_at}`);
  console.log(`  paid_at: ${o.paid_at}`);
  console.log(`  status: ${o.status}  product_type: ${o.product_type}`);
  console.log(`  intake_token (plaintext): ${o.standalone_intake_token ? `SET (${o.standalone_intake_token.slice(0,8)}...)` : '(null)'}`);
  console.log(`  report_token (plaintext): ${o.standalone_report_token_plaintext ? `SET (${o.standalone_report_token_plaintext.slice(0,8)}...)` : '(null)'}`);
  console.log(`  plaintext_expires: ${o.plaintext_tokens_expires_at}`);
  console.log(`  standalone_intake: ${o.standalone_intake ? Object.keys(o.standalone_intake).join(',') : '(null)'}`);
  console.log(`  stripe_session: ${(o.stripe_session_id||'').slice(0,30)}...`);
  console.log();
}
