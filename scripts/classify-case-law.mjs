/**
 * Case Law Classifier — Defense vs Prosecution
 *
 * Aligns with INAA source-of-truth schema (case_law_references + verified_case_law).
 * Uses CASE persona framework: "Can you USE this case in THIS motion?"
 *
 * For each statute_case_law row with a CourtListener cluster ID:
 *   1. Fetch opinion text via CourtListener Opinions API
 *   2. Strip HTML tags using split/join (no regex on content)
 *   3. Extract outcome using string .includes() signals
 *   4. Classify: DEFENSE / PROSECUTION / NEUTRAL / UNKNOWN
 *   5. Extract key_quote, holding_excerpt, determine is_binding
 *   6. Update DB row
 *
 * CASE persona signals (from CASE-LAW-VALIDATION-PERSONA.md):
 *   Defense: reversed, vacated, quashed, remanded, suppressed, error to admit
 *   Prosecution: affirmed, harmless error, properly admitted, no abuse of discretion
 *   Binding: FL Supreme Court or same DCA district
 *
 * Usage:
 *   node scripts/classify-case-law.mjs              # All unclassified
 *   node scripts/classify-case-law.mjs --limit 50   # First 50
 *   node scripts/classify-case-law.mjs --dry-run    # Show without updating
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const CL_DELAY_MS = 750;

// Tokens
const parentEnv = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
const supabaseToken = parentEnv.match(/SUPABASE_ACCESS_TOKEN=([^\r\n]+)/)?.[1];

const webEnv = fs.readFileSync(
  path.resolve(__dirname, "..", ".env.local"), "utf8"
);
const clToken = webEnv.match(/COURTLISTENER_TOKEN=([^\r\n]+)/)?.[1];

if (!supabaseToken || !clToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or COURTLISTENER_TOKEN");
  process.exit(1);
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`SQL ${res.statusCode}: ${body.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function clFetch(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(`https://www.courtlistener.com${urlPath}`, {
      headers: {
        Authorization: `Token ${clToken}`,
        "User-Agent": "INAA-Legal-Research/1.0",
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`CL ${res.statusCode}`));
        }
      });
    }).on("error", reject);
  });
}

/**
 * Strip HTML tags using split/join — no regex on content.
 * Splits on '<', takes text after '>' from each chunk.
 */
function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const textParts = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const closeIdx = part.indexOf(">");
    if (closeIdx >= 0) {
      textParts.push(part.slice(closeIdx + 1));
    } else {
      textParts.push(part);
    }
  }
  return textParts.join("").trim();
}

// ── Classification Engine (string .includes() only — no regex) ──────────

const DEFENSE_SIGNALS = [
  "reversed", "vacated", "quashed", "remanded",
  "we reverse", "we quash", "we vacate", "we remand",
  "is reversed", "is vacated", "is quashed", "is remanded",
  "error to admit", "error to deny", "error in admitting",
  "should have been suppressed", "must be suppressed",
  "trial court erred", "the trial court erred",
  "conviction is reversed", "judgment is reversed",
  "violated defendant", "rights were violated",
  "unconstitutional as applied",
];

const PROSECUTION_SIGNALS = [
  "affirmed", "we affirm", "is affirmed",
  "per curiam affirmed",
  "harmless error", "harmless beyond a reasonable doubt",
  "properly admitted", "properly denied",
  "no abuse of discretion", "did not abuse",
  "conviction is affirmed", "judgment is affirmed",
  "petition denied", "petition is denied",
  "without merit", "no merit", "no error",
  "conviction upheld",
];

// Binding authority: FL Supreme Court or FL DCA opinions bind FL courts
const BINDING_COURTS = [
  "supreme court of florida",
  "district court of appeal of florida",
];

function classifyOpinion(plainText, court) {
  const lower = plainText.toLowerCase();

  // Count signals
  let defenseScore = 0;
  let prosecutionScore = 0;

  for (const signal of DEFENSE_SIGNALS) {
    if (lower.includes(signal)) defenseScore++;
  }
  for (const signal of PROSECUTION_SIGNALS) {
    if (lower.includes(signal)) prosecutionScore++;
  }

  // Extract outcome — find conclusion sentence using .includes()
  let outcome = "";
  const sentences = plainText.split(".");
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 30); i--) {
    const s = sentences[i].trim();
    const sLower = s.toLowerCase();
    if (sLower.includes("accordingly") || sLower.includes("therefore") ||
        sLower.includes("we reverse") || sLower.includes("we affirm") ||
        sLower.includes("we quash") || sLower.includes("we vacate") ||
        sLower.includes("is affirmed") || sLower.includes("is reversed") ||
        sLower.includes("we remand") || sLower.includes("petition denied")) {
      outcome = s.slice(0, 300);
      break;
    }
  }

  // Extract key quote — first sentence with "we hold" or "we conclude"
  let keyQuote = "";
  for (let i = 0; i < sentences.length; i++) {
    const sLower = sentences[i].toLowerCase().trim();
    if (sLower.includes("we hold") || sLower.includes("we conclude") ||
        sLower.includes("the court holds") || sLower.includes("we find that")) {
      keyQuote = sentences[i].trim().slice(0, 500);
      break;
    }
  }

  // Extract holding excerpt — first substantive paragraph (>150 chars, not header)
  let holdingExcerpt = "";
  const paragraphs = plainText.split("\n");
  for (const p of paragraphs) {
    const stripped = p.trim();
    if (stripped.length > 150 && !stripped.startsWith("No.") && !stripped.startsWith("*")) {
      holdingExcerpt = stripped.slice(0, 500);
      break;
    }
  }

  // Determine party_side from signals
  let partySide = "UNKNOWN";
  if (defenseScore > 0 && prosecutionScore === 0) {
    partySide = "DEFENSE";
  } else if (prosecutionScore > 0 && defenseScore === 0) {
    partySide = "PROSECUTION";
  } else if (defenseScore > 0 && prosecutionScore > 0) {
    // Mixed — check conclusion
    const outLower = outcome.toLowerCase();
    if (outLower.includes("reverse") || outLower.includes("vacate") ||
        outLower.includes("quash") || outLower.includes("remand")) {
      partySide = "DEFENSE";
    } else if (outLower.includes("affirm")) {
      partySide = "PROSECUTION";
    } else {
      partySide = "NEUTRAL";
    }
  }

  // Binding authority check
  const courtLower = (court || "").toLowerCase();
  let isBinding = false;
  for (const bc of BINDING_COURTS) {
    if (courtLower.includes(bc)) {
      isBinding = true;
      break;
    }
  }

  // Application text — how this case can be used (matches case_law_references.application)
  let application = "";
  if (partySide === "DEFENSE") {
    application = "Defense-favorable: " + (outcome || "trial court ruling reversed/vacated");
  } else if (partySide === "PROSECUTION") {
    application = "Prosecution-favorable: " + (outcome || "conviction/ruling affirmed");
  } else if (partySide === "NEUTRAL") {
    application = "Mixed signals — review holding for specific applicability";
  }

  return { partySide, outcome, holdingExcerpt, keyQuote, isBinding, application };
}

function classifyFromName(caseName) {
  const lower = (caseName || "").toLowerCase();
  if (lower.includes("jury instruction") || lower.includes("amendment") ||
      lower.includes("in re:") || lower.includes("in re ") ||
      lower.includes("standard jury")) {
    return {
      partySide: "NEUTRAL", outcome: "Procedural/administrative",
      holdingExcerpt: "", keyQuote: "", isBinding: false,
      application: "Procedural — not directly applicable to defense or prosecution arguments",
    };
  }
  return {
    partySide: "UNKNOWN", outcome: "", holdingExcerpt: "", keyQuote: "",
    isBinding: false, application: "",
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Case Law Classifier ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}`);

  const q = String.fromCharCode(39);
  const rows = await supabaseQuery(
    `SELECT id, case_name, court, courtlistener_cluster_id FROM statute_case_law WHERE party_side = ${q}UNKNOWN${q} ORDER BY courtlistener_cluster_id IS NOT NULL DESC LIMIT ${limit}`
  );

  console.log(`${rows.length} unclassified cases\n`);

  const stats = { DEFENSE: 0, PROSECUTION: 0, NEUTRAL: 0, UNKNOWN: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const clId = row.courtlistener_cluster_id;

    process.stdout.write(`[${i + 1}/${rows.length}] ${(row.case_name || "").slice(0, 50)}...`);

    let result;

    if (clId) {
      try {
        // Step 1: Get sub_opinions from cluster
        const cluster = await clFetch(`/api/rest/v4/clusters/${clId}/?fields=sub_opinions`);
        const opUrls = cluster.sub_opinions || [];

        if (opUrls.length > 0) {
          // Step 2: Fetch opinion text
          const opPath = opUrls[0].replace("https://www.courtlistener.com", "");
          const opinion = await clFetch(`${opPath}?fields=html_with_citations,plain_text`);
          const rawText = opinion.html_with_citations || opinion.plain_text || "";
          const plainText = stripHtml(rawText);

          if (plainText.length > 200) {
            result = classifyOpinion(plainText, row.court);
          } else {
            result = classifyFromName(row.case_name);
          }
        } else {
          result = classifyFromName(row.case_name);
        }

        await sleep(CL_DELAY_MS);
      } catch (err) {
        result = classifyFromName(row.case_name);
        stats.errors++;
      }
    } else {
      result = classifyFromName(row.case_name);
    }

    console.log(` -> ${result.partySide}${result.isBinding ? " [BINDING]" : ""}${result.outcome ? " -- " + result.outcome.slice(0, 50) : ""}`);
    stats[result.partySide] = (stats[result.partySide] || 0) + 1;

    if (!dryRun) {
      try {
        await supabaseQuery(
          `UPDATE statute_case_law SET
            party_side = ${esc(result.partySide)},
            outcome = ${esc(result.outcome?.slice(0, 500) || null)},
            holding_excerpt = ${esc(result.holdingExcerpt?.slice(0, 500) || null)},
            key_quote = ${esc(result.keyQuote?.slice(0, 500) || null)},
            is_binding = ${result.isBinding},
            application = ${esc(result.application?.slice(0, 500) || null)}
          WHERE id = ${esc(row.id)}`
        );
      } catch (err) {
        console.log(`  DB err: ${err.message}`);
      }
    }
  }

  console.log("\n=== RESULTS ===");
  Object.entries(stats).forEach(([k, v]) => console.log(`${k}: ${v}`));
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
