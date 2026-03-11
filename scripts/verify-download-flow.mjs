/**
 * Verify Download Flow — Tests the full download pipeline for all 8 playbooks
 *
 * For each tier:
 *   1. Creates a test order with download_token + 72h expiry
 *   2. GETs /api/download/{token} with redirect: "manual"
 *   3. Asserts 302/307 redirect to Supabase signed URL
 *   4. Cleans up test orders
 *
 * Run: node scripts/verify-download-flow.mjs
 *   Options:
 *     --skip-cleanup   Leave test data for inspection
 *     --skip-api       Skip HTTP calls (DB-only assertions)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// ENV LOADING
// ================================================================

function loadEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  const lines = fs.readFileSync(filepath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, "..", ".env.local"));

// ================================================================
// CONFIG
// ================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const skipCleanup = args.includes("--skip-cleanup");
const skipApi = args.includes("--skip-api");

const TEST_EMAIL = "verify-download@imnotanattorney.com";
const testOrderIds = [];

// ================================================================
// TIERS
// ================================================================

const PLAYBOOK_TIERS = [
  { slug: "dui-first-offense", label: "DUI Defense" },
  { slug: "drug-possession", label: "Drug Possession" },
  { slug: "probation-violation", label: "Probation Violation" },
  { slug: "white-collar", label: "White Collar" },
  { slug: "sex-offense", label: "Sex Offense" },
  { slug: "federal-criminal", label: "Federal Criminal" },
  { slug: "drug-trafficking", label: "Drug Trafficking" },
  { slug: "self-defense", label: "Self-Defense" },
];

let totalPass = 0;
let totalFail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`    ✓ ${label}`);
    totalPass++;
  } else {
    console.error(`    ✗ FAIL: ${label}`);
    totalFail++;
  }
  return condition;
}

// ================================================================
// TEST EACH TIER
// ================================================================

async function testTier(tier) {
  console.log(`\n  --- ${tier.label} (${tier.slug}) ---`);

  // Step 1: Verify charge_packs row exists with pdf_storage_path
  const { data: pack, error: packError } = await supabase
    .from("charge_packs")
    .select("slug, display_name, pdf_storage_path, is_active")
    .eq("slug", tier.slug)
    .single();

  if (!assert(!packError && !!pack, `charge_packs row exists for ${tier.slug}`)) {
    console.error(`    Error: ${packError?.message || "No row found"}`);
    return;
  }
  assert(!!pack.pdf_storage_path, `pdf_storage_path set: ${pack.pdf_storage_path}`);
  assert(pack.is_active === true, "is_active: true");

  // Step 2: Verify PDF exists in storage
  const storagePath = pack.pdf_storage_path.replace("charge-packs/", "");
  const { data: fileList, error: listError } = await supabase.storage
    .from("charge-packs")
    .list(storagePath.split("/").slice(0, -1).join("/"));

  const fileName = storagePath.split("/").pop();
  const fileExists = fileList?.some((f) => f.name === fileName);
  assert(fileExists, `PDF exists in storage: ${storagePath}`);

  // Step 3: Create test order with download token
  const orderId = randomUUID();
  const downloadToken = randomUUID();
  testOrderIds.push(orderId);

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    email: TEST_EMAIL,
    tier: tier.slug,
    amount: 9700,
    status: "paid",
    stripe_session_id: `verify_download_${orderId}`,
    paid_at: new Date().toISOString(),
    product_type: "digital-product",
    download_token: downloadToken,
    download_token_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  });
  assert(!orderError, `Test order created with download token`);

  if (orderError) {
    console.error(`    Error: ${orderError.message}`);
    return;
  }

  // Step 4: Test download endpoint
  if (!skipApi) {
    try {
      const res = await fetch(`${SITE_URL}/api/download/${downloadToken}`, {
        redirect: "manual",
      });

      const status = res.status;
      const location = res.headers.get("location");

      assert(
        status === 302 || status === 307 || status === 308,
        `Download redirects (${status})`
      );
      assert(
        location && location.includes("supabase"),
        `Redirect to Supabase signed URL`
      );

      if (location) {
        // Verify the signed URL actually resolves (HEAD request)
        try {
          const headRes = await fetch(location, { method: "HEAD" });
          assert(
            headRes.ok,
            `Signed URL resolves (${headRes.status}, content-type: ${headRes.headers.get("content-type")})`
          );
        } catch (e) {
          assert(false, `Signed URL resolves (fetch error: ${e.message})`);
        }
      }
    } catch (err) {
      assert(false, `Download endpoint reachable (${err.message})`);
    }

    // Step 5: Verify download count incremented
    await new Promise((r) => setTimeout(r, 1000)); // wait for fire-and-forget update
    const { data: orderAfter } = await supabase
      .from("orders")
      .select("download_count")
      .eq("id", orderId)
      .single();
    assert(
      orderAfter?.download_count >= 1,
      `Download count incremented (${orderAfter?.download_count})`
    );
  } else {
    console.log("    [skip-api] Skipping download endpoint test");
  }
}

// ================================================================
// CLEANUP
// ================================================================

async function cleanup() {
  if (skipCleanup) {
    console.log("\n⚠ --skip-cleanup: Test orders left in DB");
    return;
  }

  console.log("\n=== Cleanup ===");
  for (const id of testOrderIds) {
    await supabase.from("orders").delete().eq("id", id);
  }
  console.log(`  Cleaned: ${testOrderIds.length} test orders`);
}

// ================================================================
// MAIN
// ================================================================

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Verify Download Flow — All 8 Playbooks               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Site URL: ${SITE_URL}`);
  console.log(`  Skip API: ${skipApi}`);

  try {
    for (const tier of PLAYBOOK_TIERS) {
      await testTier(tier);
    }
  } finally {
    await cleanup();
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Total: ${totalPass} passed, ${totalFail} failed`);

  if (totalFail > 0) {
    console.log("\n  ✗ SOME TESTS FAILED — see details above");
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ ALL DOWNLOAD FLOWS VERIFIED");
  }
}

run().catch((err) => {
  console.error("\nFatal error:", err);
  cleanup().catch(() => {});
  process.exitCode = 1;
});
