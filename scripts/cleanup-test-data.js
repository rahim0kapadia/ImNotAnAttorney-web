/**
 * Test Data Cleanup Script
 *
 * Purges all test records matching the `e2e-*@example.com` email pattern
 * from Supabase (all tables + storage). Used after running e2e-test.js.
 *
 * Safety:
 * - Only deletes emails matching /^e2e-.*@example\.com$/
 * - Dry-run mode by default (--confirm to actually delete)
 * - Respects FK constraints (deletes in correct order)
 * - Logs every deletion for audit trail
 *
 * Usage:
 *   node scripts/cleanup-test-data.js          # dry run — shows what would be deleted
 *   node scripts/cleanup-test-data.js --confirm # actually deletes
 *
 * Run from project root (ImNotAnAttorney-web/).
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_EMAIL_PATTERN = /^e2e-.*@example\.com$/;

const dryRun = !process.argv.includes("--confirm");

// ---------------------------------------------------------------------------
// Supabase client (same pattern as e2e-test.js)
// ---------------------------------------------------------------------------

const env = fs.readFileSync(".env.local", "utf8");
const get = (key) => env.match(new RegExp(key + "=(.+)"))?.[1]?.trim();

const supabaseUrl = get("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTestEmail(email) {
  return TEST_EMAIL_PATTERN.test(email);
}

/**
 * Fetch all test records from a table by email column.
 * Returns only rows whose email matches the test pattern (double-checked in JS).
 */
async function fetchTestRecords(table, emailColumn = "email") {
  // Use ilike for the DB filter, then verify in JS for safety
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .ilike(emailColumn, "e2e-%@example.com");

  if (error) {
    console.error(`  ERROR fetching ${table}:`, error.message);
    return [];
  }

  // Double-check every row matches the exact pattern (defense in depth)
  return (data || []).filter((row) => isTestEmail(row[emailColumn]));
}

/**
 * Delete rows by ID array. Logs each deletion.
 */
async function deleteByIds(table, ids) {
  if (ids.length === 0) return 0;
  if (dryRun) return ids.length;

  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) {
    console.error(`  ERROR deleting from ${table}:`, error.message);
    return 0;
  }
  return ids.length;
}

// ---------------------------------------------------------------------------
// Main cleanup
// ---------------------------------------------------------------------------

async function run() {
  console.log("=== TEST DATA CLEANUP ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --confirm to delete)" : "LIVE — DELETING"}`);
  console.log(`Pattern: ${TEST_EMAIL_PATTERN}`);
  console.log("");

  const summary = {};

  // -----------------------------------------------------------------------
  // 1. CASES (must delete first — FK references orders.id and intakes.id)
  // -----------------------------------------------------------------------
  console.log("--- cases ---");
  const cases = await fetchTestRecords("cases");
  console.log(`  Found: ${cases.length} test case(s)`);
  for (const c of cases) {
    console.log(`  ${dryRun ? "[DRY]" : "[DEL]"} case ${c.id} | ${c.email} | tier=${c.tier} | status=${c.status}`);
  }

  // Clean up storage files for each case before deleting the case record
  let storageFilesDeleted = 0;
  for (const c of cases) {
    if (c.file_urls && c.file_urls.length > 0) {
      console.log(`  Storage: ${c.file_urls.length} file(s) for case ${c.id}`);
      if (!dryRun) {
        // file_urls contain paths like "caseId/timestamp-filename"
        // We list all files under the caseId prefix to catch any not in file_urls
        const { data: files, error: listError } = await supabase.storage
          .from("discovery-files")
          .list(c.id);

        if (listError) {
          console.error(`  ERROR listing storage for case ${c.id}:`, listError.message);
        } else if (files && files.length > 0) {
          const paths = files.map((f) => `${c.id}/${f.name}`);
          const { error: removeError } = await supabase.storage
            .from("discovery-files")
            .remove(paths);

          if (removeError) {
            console.error(`  ERROR removing storage files:`, removeError.message);
          } else {
            storageFilesDeleted += paths.length;
            console.log(`  Removed ${paths.length} storage file(s) for case ${c.id}`);
          }
        }
      } else {
        storageFilesDeleted += c.file_urls.length;
      }
    }
  }
  summary.storage_files = storageFilesDeleted;

  const casesDeleted = await deleteByIds("cases", cases.map((c) => c.id));
  summary.cases = casesDeleted;

  // -----------------------------------------------------------------------
  // 2. ORDERS (safe to delete after cases are gone)
  // -----------------------------------------------------------------------
  console.log("");
  console.log("--- orders ---");
  const orders = await fetchTestRecords("orders");
  console.log(`  Found: ${orders.length} test order(s)`);
  for (const o of orders) {
    console.log(`  ${dryRun ? "[DRY]" : "[DEL]"} order ${o.id} | ${o.email} | tier=${o.tier} | $${(o.amount / 100).toFixed(2)} | status=${o.status}`);
  }
  const ordersDeleted = await deleteByIds("orders", orders.map((o) => o.id));
  summary.orders = ordersDeleted;

  // -----------------------------------------------------------------------
  // 3. INTAKES (safe to delete after cases are gone)
  // -----------------------------------------------------------------------
  console.log("");
  console.log("--- intakes ---");
  const intakes = await fetchTestRecords("intakes");
  console.log(`  Found: ${intakes.length} test intake(s)`);
  for (const i of intakes) {
    console.log(`  ${dryRun ? "[DRY]" : "[DEL]"} intake ${i.id} | ${i.email} | charge=${i.charge_type}`);
  }
  const intakesDeleted = await deleteByIds("intakes", intakes.map((i) => i.id));
  summary.intakes = intakesDeleted;

  // -----------------------------------------------------------------------
  // 4. DRIP EMAILS (must delete before subscribers — FK on subscriber_id)
  // -----------------------------------------------------------------------
  console.log("");
  console.log("--- subscribers + drip_emails ---");
  const subscribers = await fetchTestRecords("subscribers");
  console.log(`  Found: ${subscribers.length} test subscriber(s)`);

  let dripDeleted = 0;
  for (const s of subscribers) {
    console.log(`  ${dryRun ? "[DRY]" : "[DEL]"} subscriber ${s.id} | ${s.email} | source=${s.source}`);

    // Find and delete drip_emails linked to this subscriber
    const { data: drips, error: dripError } = await supabase
      .from("drip_emails")
      .select("id, email_key")
      .eq("subscriber_id", s.id);

    if (dripError) {
      console.error(`  ERROR fetching drip_emails for ${s.id}:`, dripError.message);
    } else if (drips && drips.length > 0) {
      console.log(`    ${drips.length} drip email(s): ${drips.map((d) => d.email_key).join(", ")}`);
      if (!dryRun) {
        const { error: dripDelError } = await supabase
          .from("drip_emails")
          .delete()
          .in("id", drips.map((d) => d.id));
        if (dripDelError) {
          console.error(`    ERROR deleting drip_emails:`, dripDelError.message);
        }
      }
      dripDeleted += drips.length;
    }
  }
  summary.drip_emails = dripDeleted;

  // -----------------------------------------------------------------------
  // 5. SUBSCRIBERS (safe to delete after drip_emails are gone)
  // -----------------------------------------------------------------------
  const subscribersDeleted = await deleteByIds("subscribers", subscribers.map((s) => s.id));
  summary.subscribers = subscribersDeleted;

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`  Cases:        ${summary.cases}`);
  console.log(`  Orders:       ${summary.orders}`);
  console.log(`  Intakes:      ${summary.intakes}`);
  console.log(`  Subscribers:  ${summary.subscribers}`);
  console.log(`  Drip emails:  ${summary.drip_emails}`);
  console.log(`  Storage files: ${summary.storage_files}`);

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (dryRun) {
    console.log("");
    console.log(`${total} record(s) would be deleted. Run with --confirm to execute.`);
  } else {
    console.log("");
    console.log(`${total} record(s) deleted.`);
  }
}

run().catch((e) => {
  console.error("FATAL:", e.message, e.stack);
  process.exit(1);
});
