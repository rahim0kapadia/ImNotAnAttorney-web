/**
 * Setup Storage Bucket + Upload PDFs + Seed charge_packs table
 *
 * Single script that:
 *   1. Creates 'charge-packs' storage bucket (private, handles "already exists")
 *   2. Uploads all 8 PDFs from the content/playbooks directory
 *   3. Upserts all 8 charge_packs table rows (corrects DUI path from migration-006)
 *
 * Run: node scripts/setup-storage-and-seed.mjs
 *   Options:
 *     --skip-upload    Skip PDF upload (only seed DB)
 *     --skip-seed      Skip DB seed (only upload PDFs)
 *     --dry-run        Show what would happen without making changes
 */

import { createClient } from "@supabase/supabase-js";
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET_NAME = "charge-packs";

// Source directory for PDFs
const PDF_SOURCE_DIR = path.resolve("C:/Users/email/projects/ImNotAnAttorney/content/playbooks");

// CLI args
const args = process.argv.slice(2);
const skipUpload = args.includes("--skip-upload");
const skipSeed = args.includes("--skip-seed");
const dryRun = args.includes("--dry-run");

// ================================================================
// TIER DATA
// ================================================================

const TIERS = [
  {
    slug: "dui-first-offense",
    pdfFile: "dui-first-offense-playbook.pdf",
    storagePath: "dui-first-offense/dui-first-offense-playbook.pdf",
    displayName: "DUI Defense Playbook",
    chargeType: "dui",
    priceCents: 9700,
    description: "Instant DUI defense playbook with 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Plain-English DUI first offense breakdown, elements, dual-track (DMV + criminal), sentencing ranges", anchor_value: 297 },
      { section: 2, title: "26 Questions Your DUI Attorney Hopes You Never Ask", description: "Elite defense attorney methodologies in 6-part format per question", anchor_value: 197 },
      { section: 3, title: "DUI Case Stage Roadmap", description: "Arrest through resolution timeline with milestones and deadlines", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "12 evidence and procedural red flags, breathalyzer calibration, FST protocol, 15-min observation", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "drug-possession",
    pdfFile: "drug-possession-playbook.pdf",
    storagePath: "drug-possession/drug-possession-playbook.pdf",
    displayName: "Drug Possession Defense Playbook",
    chargeType: "drug-possession",
    priceCents: 9700,
    description: "Drug possession defense playbook with charge-specific questions, constitutional search issues, diversion program eligibility, and attorney accountability checklist.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Drug possession charge breakdown, schedule classifications, possession types, quantity thresholds", anchor_value: 297 },
      { section: 2, title: "Defense Questions Your Attorney Hopes You Never Ask", description: "Targeted questions on search legality, chain of custody, lab testing, and informant reliability", anchor_value: 197 },
      { section: 3, title: "Drug Case Stage Roadmap", description: "Arrest through resolution timeline with suppression hearing milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Search warrant issues, Miranda violations, lab testing irregularities", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "probation-violation",
    pdfFile: "probation-violation-playbook.pdf",
    storagePath: "probation-violation/probation-violation-playbook.pdf",
    displayName: "Probation Violation Defense Playbook",
    chargeType: "probation-violation",
    priceCents: 9700,
    description: "Probation violation defense playbook covering technical vs. substantive violations, hearing preparation, compliance documentation strategy, and modification options.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Probation violation breakdown, technical vs. substantive, standard of proof, sentencing exposure", anchor_value: 297 },
      { section: 2, title: "Defense Questions for Your Probation Violation Hearing", description: "Targeted questions on violation type, compliance history, officer conduct", anchor_value: 197 },
      { section: 3, title: "Violation Hearing Roadmap", description: "From violation report through disposition with key deadlines", anchor_value: 97 },
      { section: 4, title: "Compliance Documentation Checklist", description: "Every document that proves compliance, the strongest defense in PV cases", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "white-collar",
    pdfFile: "white-collar-playbook.pdf",
    storagePath: "white-collar/white-collar-playbook.pdf",
    displayName: "White Collar Defense Playbook",
    chargeType: "white-collar",
    priceCents: 9700,
    description: "White collar defense playbook covering fraud charges, forensic accounting issues, document preservation, cooperation strategies, and sentencing guidelines.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "White collar charge breakdown, fraud elements, conspiracy exposure, sentencing guidelines", anchor_value: 297 },
      { section: 2, title: "Defense Questions for White Collar Cases", description: "Targeted questions on document production, forensic analysis, cooperation agreements", anchor_value: 197 },
      { section: 3, title: "White Collar Case Stage Roadmap", description: "Investigation through resolution timeline with grand jury and plea milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Document production gaps, forensic accounting irregularities, cooperation pitfalls", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "sex-offense",
    pdfFile: "sex-offense-playbook.pdf",
    storagePath: "sex-offense/sex-offense-playbook.pdf",
    displayName: "Sex Offense Defense Playbook",
    chargeType: "sex-offense",
    priceCents: 9700,
    description: "Sex offense defense playbook covering charge classifications, registry implications, forensic evidence issues, and constitutional defense strategies.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Sex offense charge breakdown, classifications, registration requirements, collateral consequences", anchor_value: 297 },
      { section: 2, title: "Defense Questions for Sex Offense Cases", description: "Targeted questions on forensic evidence, witness credibility, digital evidence handling", anchor_value: 197 },
      { section: 3, title: "Sex Offense Case Stage Roadmap", description: "Arrest through resolution timeline with pretrial motion milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Forensic evidence handling, witness interview protocols, digital evidence chain of custody", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "federal-criminal",
    pdfFile: "federal-criminal-playbook.pdf",
    storagePath: "federal-criminal/federal-criminal-playbook.pdf",
    displayName: "Federal Criminal Defense Playbook",
    chargeType: "federal-criminal",
    priceCents: 9700,
    description: "Federal criminal defense playbook covering federal sentencing guidelines, mandatory minimums, cooperation agreements, and federal procedural differences.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Federal charge breakdown, guidelines calculations, mandatory minimums, relevant conduct", anchor_value: 297 },
      { section: 2, title: "Defense Questions for Federal Cases", description: "Targeted questions on guidelines calculations, cooperation agreements, Bureau of Prisons designations", anchor_value: 197 },
      { section: 3, title: "Federal Case Stage Roadmap", description: "Indictment through sentencing timeline with federal procedural milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Guidelines miscalculations, cooperation agreement pitfalls, relevant conduct overreach", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "drug-trafficking",
    pdfFile: "drug-trafficking-playbook.pdf",
    storagePath: "drug-trafficking/drug-trafficking-playbook.pdf",
    displayName: "Drug Trafficking Defense Playbook",
    chargeType: "drug-trafficking",
    priceCents: 9700,
    description: "Drug trafficking defense playbook covering conspiracy charges, mandatory minimums, cooperation strategies, safety valve provisions, and surveillance evidence issues.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Drug trafficking breakdown, conspiracy elements, mandatory minimums, safety valve eligibility", anchor_value: 297 },
      { section: 2, title: "Defense Questions for Trafficking Cases", description: "Targeted questions on wiretap legality, informant reliability, quantity attribution, conspiracy scope", anchor_value: 197 },
      { section: 3, title: "Drug Trafficking Case Stage Roadmap", description: "Investigation through sentencing timeline with cooperation and plea milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Wiretap authorization issues, informant handling, drug quantity disputes, co-defendant cooperation", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
  {
    slug: "self-defense",
    pdfFile: "self-defense-playbook.pdf",
    storagePath: "self-defense/self-defense-playbook.pdf",
    displayName: "Self-Defense / Justifiable Force Defense Playbook",
    chargeType: "self-defense",
    priceCents: 9700,
    description: "Self-defense playbook covering justifiable force standards, Stand Your Ground vs. Duty to Retreat, Castle Doctrine, proportionality analysis, and witness documentation.",
    contents: [
      { section: 1, title: "Charge Reality Report", description: "Self-defense law breakdown, justifiable force standards, Castle Doctrine, Stand Your Ground, proportionality", anchor_value: 297 },
      { section: 2, title: "Defense Questions for Self-Defense Cases", description: "Targeted questions on force proportionality, initial aggressor doctrine, witness identification, scene evidence", anchor_value: 197 },
      { section: 3, title: "Self-Defense Case Stage Roadmap", description: "Arrest through immunity hearing / trial with self-defense specific milestones", anchor_value: 97 },
      { section: 4, title: "Red Flag Checklist", description: "Scene evidence preservation, witness identification gaps, use-of-force analysis issues", anchor_value: 97 },
      { section: 5, title: "Case Progress Scorecard", description: "10 behaviors to rate your attorney on before it is too late to switch", anchor_value: 97 },
    ],
  },
];

// ================================================================
// STEP 1: CREATE STORAGE BUCKET
// ================================================================

async function createBucket() {
  console.log("\n=== Step 1: Create Storage Bucket ===");

  if (dryRun) {
    console.log(`  [dry-run] Would create bucket: ${BUCKET_NAME} (private)`);
    return true;
  }

  const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: false,
  });

  if (error) {
    if (error.message?.includes("already exists") || error.statusCode === "409") {
      console.log(`  ✓ Bucket '${BUCKET_NAME}' already exists`);
      return true;
    }
    console.error(`  ✗ Failed to create bucket:`, error.message);
    return false;
  }

  console.log(`  ✓ Bucket '${BUCKET_NAME}' created (private)`);
  return true;
}

// ================================================================
// STEP 2: UPLOAD PDFs
// ================================================================

async function uploadPdfs() {
  console.log("\n=== Step 2: Upload PDFs ===");

  if (!fs.existsSync(PDF_SOURCE_DIR)) {
    console.error(`  ✗ PDF source directory not found: ${PDF_SOURCE_DIR}`);
    return false;
  }

  let allOk = true;

  for (const tier of TIERS) {
    const localPath = path.join(PDF_SOURCE_DIR, tier.pdfFile);

    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ PDF not found: ${localPath}`);
      allOk = false;
      continue;
    }

    const fileBuffer = fs.readFileSync(localPath);
    const fileSizeKB = (fileBuffer.length / 1024).toFixed(1);

    if (dryRun) {
      console.log(`  [dry-run] Would upload: ${tier.pdfFile} (${fileSizeKB} KB) → ${tier.storagePath}`);
      continue;
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(tier.storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      console.error(`  ✗ Upload failed for ${tier.pdfFile}:`, error.message);
      allOk = false;
    } else {
      console.log(`  ✓ ${tier.pdfFile} (${fileSizeKB} KB) → ${tier.storagePath}`);
    }
  }

  return allOk;
}

// ================================================================
// STEP 3: UPSERT charge_packs ROWS
// ================================================================

async function seedChargePacks() {
  console.log("\n=== Step 3: Upsert charge_packs Rows ===");

  let allOk = true;

  for (const tier of TIERS) {
    const row = {
      slug: tier.slug,
      display_name: tier.displayName,
      charge_type: tier.chargeType,
      price_cents: tier.priceCents,
      description: tier.description,
      contents: tier.contents,
      pdf_storage_path: `${BUCKET_NAME}/${tier.storagePath}`,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (dryRun) {
      console.log(`  [dry-run] Would upsert: ${tier.slug} → pdf_storage_path: ${row.pdf_storage_path}`);
      continue;
    }

    const { error } = await supabase
      .from("charge_packs")
      .upsert(row, { onConflict: "slug" });

    if (error) {
      console.error(`  ✗ Upsert failed for ${tier.slug}:`, error.message);
      allOk = false;
    } else {
      console.log(`  ✓ ${tier.slug} → ${row.pdf_storage_path}`);
    }
  }

  return allOk;
}

// ================================================================
// MAIN
// ================================================================

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Setup Storage + Upload PDFs + Seed charge_packs      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  PDF source: ${PDF_SOURCE_DIR}`);
  console.log(`  Bucket: ${BUCKET_NAME}`);
  if (dryRun) console.log("  MODE: DRY RUN");
  if (skipUpload) console.log("  SKIP: PDF upload");
  if (skipSeed) console.log("  SKIP: DB seed");

  let allOk = true;

  // Step 1: Create bucket
  const bucketOk = await createBucket();
  allOk = allOk && bucketOk;

  // Step 2: Upload PDFs
  if (!skipUpload) {
    const uploadOk = await uploadPdfs();
    allOk = allOk && uploadOk;
  }

  // Step 3: Seed DB
  if (!skipSeed) {
    const seedOk = await seedChargePacks();
    allOk = allOk && seedOk;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  if (allOk) {
    console.log("  ✓ ALL STEPS COMPLETED SUCCESSFULLY");
  } else {
    console.log("  ✗ SOME STEPS FAILED, see details above");
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("\nFatal error:", err);
  process.exitCode = 1;
});
