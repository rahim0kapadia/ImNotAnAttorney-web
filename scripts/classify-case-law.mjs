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

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map((s) => `"${String(s).split('"').join('\\"').split("'").join("''")}"` );
  return `'{${items.join(",")}}'`;
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

// ── Good Law Verification (negative treatment via citing opinions) ──────────
// Per CASE persona (CASE-LAW-VALIDATION-PERSONA.md):
// A case is BAD LAW if any later case overrules, abrogates, or supersedes it.
// We check this via CourtListener's citing-opinions endpoint.

const NEGATIVE_TREATMENT_SIGNALS = [
  "overruled",
  "overrule ",
  "overruling",
  "abrogated",
  "abrogating",
  "abrogate ",
  "superseded",
  "supersede ",
  "superseding",
  "receded from",
  "recede from",
  "no longer good law",
  "is no longer the law",
  "rejecting the holding",
  "expressly disapproved",
  "we disapprove",
];

/**
 * Check if a case has been overruled/abrogated/superseded by later opinions.
 * Returns { isGoodLaw, treatment, citingClusterId, checkedUrls }.
 *
 * isGoodLaw values:
 *   true  — checked, no negative treatment found
 *   false — checked, negative treatment found
 *   null  — could not check (no citing opinions or API error)
 *
 * checkedUrls: every CourtListener URL that was fetched during verification.
 * Per hard rule: no verification URL = unverified = does not exist in the system.
 * These get stored in source_urls[] so anyone can audit the verification chain.
 */
async function checkNegativeTreatment(clusterId) {
  if (!clusterId) {
    return { isGoodLaw: null, treatment: null, citingClusterId: null, checkedUrls: [] };
  }

  // Collect every URL we check so we can store the full verification chain
  const checkedUrls = [];

  try {
    // CourtListener v4: search for opinions that cite this cluster
    const searchUrl = `https://www.courtlistener.com/api/rest/v4/search/?type=o&cites=${clusterId}&order_by=dateFiled+desc&page_size=20`;
    checkedUrls.push(searchUrl);
    const result = await clFetch(`/api/rest/v4/search/?type=o&cites=${clusterId}&order_by=dateFiled+desc&page_size=20`);
    const citingOps = result.results || [];

    if (citingOps.length === 0) {
      // No citing opinions found — cannot verify negative treatment
      return { isGoodLaw: null, treatment: null, citingClusterId: null, checkedUrls };
    }

    // For each citing opinion, fetch its text and check for negative treatment
    for (const citingOp of citingOps) {
      const citingClusterId = citingOp.cluster_id;
      if (!citingClusterId) continue;

      try {
        const clusterUrl = `https://www.courtlistener.com/api/rest/v4/clusters/${citingClusterId}/`;
        checkedUrls.push(clusterUrl);
        const cluster = await clFetch(`/api/rest/v4/clusters/${citingClusterId}/?fields=sub_opinions`);
        const opUrls = cluster.sub_opinions || [];
        if (opUrls.length === 0) continue;

        // Select majority/lead opinion — avoid citing dissents
        let opPath;
        if (opUrls.length === 1) {
          opPath = opUrls[0].replace("https://www.courtlistener.com", "");
        } else {
          let majorityUrl = null;
          for (const url of opUrls) {
            const checkPath = url.replace("https://www.courtlistener.com", "");
            const opMeta = await clFetch(`${checkPath}?fields=type`);
            const opType = opMeta.type || "";
            if (opType === "010combined" || opType === "015lead" || opType === "") {
              majorityUrl = url;
              break;
            }
          }
          opPath = (majorityUrl || opUrls[0]).replace("https://www.courtlistener.com", "");
        }
        const opFullUrl = `https://www.courtlistener.com${opPath}`;
        checkedUrls.push(opFullUrl);
        const opinion = await clFetch(`${opPath}?fields=plain_text,html_with_citations`);
        const rawText = opinion.plain_text || stripHtml(opinion.html_with_citations || "");
        const lower = rawText.toLowerCase();

        // Check for negative treatment signals
        for (const signal of NEGATIVE_TREATMENT_SIGNALS) {
          if (lower.includes(signal)) {
            const idx = lower.indexOf(signal);
            const context = rawText.slice(Math.max(0, idx - 200), idx + 200);

            return {
              isGoodLaw: false,
              treatment: `${signal}: "${context.split(/\s+/).join(" ").trim().slice(0, 400)}"`,
              citingClusterId: String(citingClusterId),
              checkedUrls,
            };
          }
        }

        await sleep(CL_DELAY_MS);
      } catch {
        continue;
      }
    }

    // Checked all citing opinions, no negative treatment found
    return { isGoodLaw: true, treatment: null, citingClusterId: null, checkedUrls };
  } catch {
    return { isGoodLaw: null, treatment: null, citingClusterId: null, checkedUrls };
  }
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

    let goodLawResult = { isGoodLaw: null, treatment: null, citingClusterId: null };

    if (clId) {
      try {
        // Step 1: Get sub_opinions from cluster
        const cluster = await clFetch(`/api/rest/v4/clusters/${clId}/?fields=sub_opinions`);
        const opUrls = cluster.sub_opinions || [];

        if (opUrls.length > 0) {
          // Step 2: Fetch opinion text — select majority/lead opinion, avoid citing dissents
          let opPath;
          if (opUrls.length === 1) {
            opPath = opUrls[0].replace("https://www.courtlistener.com", "");
          } else {
            let majorityUrl = null;
            for (const url of opUrls) {
              const checkPath = url.replace("https://www.courtlistener.com", "");
              const opMeta = await clFetch(`${checkPath}?fields=type`);
              const opType = opMeta.type || "";
              if (opType === "010combined" || opType === "015lead" || opType === "") {
                majorityUrl = url;
                break;
              }
            }
            opPath = (majorityUrl || opUrls[0]).replace("https://www.courtlistener.com", "");
          }
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

        // Step 3: Good Law Verification — check negative treatment via citing opinions
        // Per CASE persona: every cited case must be verified not overruled
        process.stdout.write(" [checking good law...]");
        goodLawResult = await checkNegativeTreatment(clId);
      } catch (err) {
        result = classifyFromName(row.case_name);
        stats.errors++;
      }
    } else {
      result = classifyFromName(row.case_name);
    }

    const goodLawTag =
      goodLawResult.isGoodLaw === false
        ? " [BAD LAW]"
        : goodLawResult.isGoodLaw === true
          ? " [GOOD LAW]"
          : " [UNVERIFIED]";

    console.log(` -> ${result.partySide}${result.isBinding ? " [BINDING]" : ""}${goodLawTag}${result.outcome ? " -- " + result.outcome.slice(0, 50) : ""}`);
    stats[result.partySide] = (stats[result.partySide] || 0) + 1;

    if (goodLawResult.isGoodLaw === false) {
      stats.badLaw = (stats.badLaw || 0) + 1;
    } else if (goodLawResult.isGoodLaw === true) {
      stats.goodLaw = (stats.goodLaw || 0) + 1;
    } else {
      stats.unverified = (stats.unverified || 0) + 1;
    }

    if (!dryRun) {
      try {
        // Build is_good_law SQL value: NULL if unknown, true/false if checked
        const isGoodLawSql =
          goodLawResult.isGoodLaw === null
            ? "NULL"
            : goodLawResult.isGoodLaw
              ? "true"
              : "false";

        // Build verification URLs array — merge existing source_urls with
        // all URLs checked during classification + negative treatment verification.
        // Per hard rule: no verification URL = unverified = does not exist.
        const verificationUrls = [];
        // Add the cluster URL for the case itself
        if (clId) verificationUrls.push(`https://www.courtlistener.com/api/rest/v4/clusters/${clId}/`);
        // Add all URLs checked during negative treatment verification
        if (goodLawResult.checkedUrls) {
          for (const u of goodLawResult.checkedUrls) {
            if (!verificationUrls.includes(u)) verificationUrls.push(u);
          }
        }

        // Append new URLs to existing source_urls (don't overwrite)
        const sourceUrlsSql = verificationUrls.length > 0
          ? `source_urls = array_cat(COALESCE(source_urls, '{}'), ${escArray(verificationUrls)})`
          : `source_urls = source_urls`;

        await supabaseQuery(
          `UPDATE statute_case_law SET
            party_side = ${esc(result.partySide)},
            outcome = ${esc(result.outcome?.slice(0, 500) || null)},
            holding_excerpt = ${esc(result.holdingExcerpt?.slice(0, 500) || null)},
            key_quote = ${esc(result.keyQuote?.slice(0, 500) || null)},
            is_binding = ${result.isBinding},
            application = ${esc(result.application?.slice(0, 500) || null)},
            is_good_law = ${isGoodLawSql},
            negative_treatment = ${esc(goodLawResult.treatment)},
            negative_treatment_checked_at = now(),
            ${sourceUrlsSql}
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
