#!/usr/bin/env node
/**
 * W3 UPL Audit Harness
 *
 * Seeds fake orders for the 5 HIGH-UPL products, invokes the generate-standalone
 * Edge Function, polls for completion, and downloads the generated HTML into
 * data/w3-audit/ for manual UPL/Psych/Legal review.
 *
 * Products audited (all currently isActive=false):
 *   - custody-impact
 *   - expungement-research
 *   - sentence-reduction
 *   - appeal-viability
 *   - ineffective-counsel
 *
 * 3 scenarios per product × 5 products = 15 reports.
 *
 * Usage:
 *   node scripts/audit-w3-upl.mjs
 *   node scripts/audit-w3-upl.mjs --product custody-impact
 *   node scripts/audit-w3-upl.mjs --scenario 0
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "w3-audit");

// Load env
const envPath = path.join(ROOT, ".env.local");
const envRaw = fs.readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// ─── Scenarios ────────────────────────────────────────────────────────
// Each scenario exercises a different charge type / state combo to catch
// state-specific hallucinations and cross-charge UPL slippage.

const SCENARIOS = {
  "custody-impact": [
    {
      label: "TX-DV-pending",
      intake: {
        state: "Texas",
        chargeType: "Domestic Assault - Family Violence",
        custodyStatus: "joint",
        pendingFamilyCase: true,
        childrenAges: "6 and 9",
        otherParentAwareness: "yes",
        chargeInvolves: "domestic violence",
      },
    },
    {
      label: "CA-DUI-sole",
      intake: {
        state: "California",
        chargeType: "DUI - First Offense",
        custodyStatus: "sole",
        pendingFamilyCase: false,
        childrenAges: "4",
        otherParentAwareness: "don't know",
        chargeInvolves: "substance",
      },
    },
    {
      label: "FL-drug-visitation",
      intake: {
        state: "Florida",
        chargeType: "Possession of Controlled Substance",
        custodyStatus: "visitation only",
        pendingFamilyCase: true,
        childrenAges: "12",
        otherParentAwareness: "yes",
        chargeInvolves: "substance",
      },
    },
  ],
  "expungement-research": [
    {
      label: "CA-misdemeanor-dismissed",
      intake: {
        state: "California",
        chargeType: "Misdemeanor Theft",
        convictionOrDismissal: "dismissed",
        convictionDate: "2021-06-15",
        sentenceCompleted: "not applicable",
        priorConvictions: "none",
        probationCompleted: "not applicable",
      },
    },
    {
      label: "TX-felony-completed",
      intake: {
        state: "Texas",
        chargeType: "State Jail Felony - Possession",
        convictionOrDismissal: "convicted",
        convictionDate: "2018-11-02",
        sentenceCompleted: "yes",
        priorConvictions: "none",
        probationCompleted: "yes",
      },
    },
    {
      label: "NY-DUI-pending-waiting",
      intake: {
        state: "New York",
        chargeType: "DWI - First Offense",
        convictionOrDismissal: "convicted",
        convictionDate: "2022-03-10",
        sentenceCompleted: "yes",
        priorConvictions: "one misdemeanor",
        probationCompleted: "yes",
      },
    },
  ],
  "sentence-reduction": [
    {
      label: "federal-drug-Rule35",
      intake: {
        state: "Federal",
        chargeType: "Federal Drug Conspiracy",
        sentenceImposed: "84 months imprisonment, 3 years supervised release",
        sentencingDate: "2024-09-12",
        basisForReduction: "Substantial assistance to government, post-sentencing rehabilitation, completed RDAP",
      },
    },
    {
      label: "CA-robbery-state",
      intake: {
        state: "California",
        chargeType: "Second Degree Robbery (PC 211)",
        sentenceImposed: "5 years state prison",
        sentencingDate: "2023-02-20",
        basisForReduction: "Proposition 57 credits, completed anger management, medical deterioration",
      },
    },
    {
      label: "FL-burglary-medical",
      intake: {
        state: "Florida",
        chargeType: "Burglary of Unoccupied Dwelling",
        sentenceImposed: "48 months Florida State Prison",
        sentencingDate: "2023-11-08",
        basisForReduction: "Medical release consideration, Stage 3 kidney disease diagnosis, first offense",
      },
    },
  ],
  "appeal-viability": [
    {
      label: "IL-jury-preserved",
      intake: {
        state: "Illinois",
        chargeType: "Aggravated Battery",
        convictionMethod: "jury trial",
        appealGrounds: "Improper admission of prior bad acts under 404(b), insufficient limiting instruction",
        appealDeadlineStatus: "within 30 days",
        trialIssues: "Defense objected on the record to 404(b) evidence; trial court overruled without Rule 23 analysis. Defense counsel did not request a limiting instruction per Illinois Pattern Instruction 3.14.",
      },
    },
    {
      label: "TX-plea-late",
      intake: {
        state: "Texas",
        chargeType: "Possession of Controlled Substance PG 1",
        convictionMethod: "plea",
        appealGrounds: "Ineffective assistance at plea; not advised of immigration consequences",
        appealDeadlineStatus: "deadline passed",
        trialIssues: "Client is legal permanent resident. Plea counsel said 'probably fine' when asked about green card impact. Client pled to state jail felony which is an aggravated felony under INA.",
      },
    },
    {
      label: "CA-bench-unpreserved",
      intake: {
        state: "California",
        chargeType: "DUI Causing Injury (VC 23153)",
        convictionMethod: "bench trial",
        appealGrounds: "Sufficiency of evidence on causation element",
        appealDeadlineStatus: "within 60 days",
        trialIssues: "Defense did not move for acquittal after prosecution case; did not argue causation in closing. Issue first raised in post-trial motion.",
      },
    },
  ],
  "ineffective-counsel": [
    {
      label: "GA-trial-witness-fail",
      intake: {
        state: "Georgia",
        chargeType: "Armed Robbery",
        issuesIdentified: "Trial counsel did not investigate alibi witness (girlfriend who was with client at the time). Did not subpoena surveillance video from nearby gas station that would have shown client 2 miles from scene. Met with client only twice before trial. Did not hire eyewitness identification expert despite cross-racial ID.",
        caseOutcome: "convicted at trial, 15 years",
      },
    },
    {
      label: "NC-plea-no-investigation",
      intake: {
        state: "North Carolina",
        chargeType: "Trafficking in Heroin",
        issuesIdentified: "Plea counsel never reviewed discovery with client. Told client 'they have you on camera' but surveillance footage was never produced in discovery. Did not file motion to suppress despite warrantless phone search. Advised client to plead to 225 months without explaining cooperation options.",
        caseOutcome: "pled guilty, 225 months",
      },
    },
    {
      label: "OH-trial-no-expert",
      intake: {
        state: "Ohio",
        chargeType: "Child Molestation (GSI)",
        issuesIdentified: "Defense counsel did not retain a forensic interview expert to challenge the CAC interview methodology. Did not investigate complainant's prior false allegations against a stepfather in a different state. Did not object to bolstering testimony from the SANE nurse.",
        caseOutcome: "convicted at trial, 8 years",
      },
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────

async function supabaseRequest(pathname, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${pathname} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function insertOrder(slug, intake, label) {
  const rows = await supabaseRequest("/rest/v1/orders", {
    method: "POST",
    body: JSON.stringify({
      email: `w3-audit+${slug}-${label}@test.internal`,
      tier: "standalone",
      amount: 0,
      status: "paid",
      product_type: "standalone",
      standalone_product_slug: slug,
      standalone_intake: intake,
      paid_at: new Date().toISOString(),
    }),
  });
  return rows[0];
}

async function invokeEdgeFunction(orderId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-standalone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Edge Function → ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function getOrderStatus(orderId) {
  const rows = await supabaseRequest(
    `/rest/v1/orders?id=eq.${orderId}&select=id,status,standalone_report_storage_path`
  );
  return rows[0];
}

async function downloadReport(storagePath) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${storagePath}`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Storage fetch ${storagePath} → ${res.status}`);
  }
  return await res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filterProduct = args.includes("--product")
    ? args[args.indexOf("--product") + 1]
    : null;
  const filterScenario = args.includes("--scenario")
    ? parseInt(args[args.indexOf("--scenario") + 1], 10)
    : null;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const runs = [];
  for (const [slug, scenarios] of Object.entries(SCENARIOS)) {
    if (filterProduct && slug !== filterProduct) continue;
    scenarios.forEach((scenario, idx) => {
      if (filterScenario !== null && idx !== filterScenario) return;
      runs.push({ slug, scenario, idx });
    });
  }

  console.log(`Running ${runs.length} audit generations...\n`);

  const results = [];

  // Run in batches of 3 to avoid hammering Claude API
  const BATCH_SIZE = 3;
  for (let i = 0; i < runs.length; i += BATCH_SIZE) {
    const batch = runs.slice(i, i + BATCH_SIZE);
    console.log(`\n--- Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(runs.length / BATCH_SIZE)} ---`);

    // Kick off all in batch in parallel
    const batchResults = await Promise.all(
      batch.map(async ({ slug, scenario, idx }) => {
        const label = `${slug}-${idx}-${scenario.label}`;
        try {
          console.log(`[${label}] Seeding order...`);
          const order = await insertOrder(slug, scenario.intake, scenario.label);
          console.log(`[${label}] Order ${order.id} created. Invoking Edge Function...`);
          await invokeEdgeFunction(order.id);

          // Poll for up to 150 seconds
          const maxAttempts = 30;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await sleep(5000);
            const status = await getOrderStatus(order.id);
            if (status.standalone_report_storage_path) {
              console.log(`[${label}] Report ready at ${status.standalone_report_storage_path}`);
              const html = await downloadReport(status.standalone_report_storage_path);
              const outPath = path.join(OUT_DIR, `${label}.html`);
              fs.writeFileSync(outPath, html);
              console.log(`[${label}] Saved to ${outPath} (${html.length} chars)`);
              return {
                label,
                slug,
                scenario: scenario.label,
                orderId: order.id,
                status: "success",
                path: outPath,
                size: html.length,
              };
            }
            if (status.status === "failed" || status.status === "error") {
              console.error(`[${label}] Order marked ${status.status}`);
              return { label, slug, scenario: scenario.label, orderId: order.id, status: "failed" };
            }
          }

          console.error(`[${label}] Timed out after 150s`);
          return { label, slug, scenario: scenario.label, orderId: order.id, status: "timeout" };
        } catch (err) {
          console.error(`[${label}] ERROR: ${err.message}`);
          return { label, slug, scenario: scenario.label, status: "error", error: err.message };
        }
      })
    );

    results.push(...batchResults);
  }

  // Write summary
  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status !== "success").length,
    results,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n━━━ SUMMARY ━━━`);
  console.log(`Success: ${summary.success}/${summary.total}`);
  console.log(`Failed:  ${summary.failed}/${summary.total}`);
  console.log(`Summary: ${path.join(OUT_DIR, "_summary.json")}`);
  console.log(`Reports: ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
