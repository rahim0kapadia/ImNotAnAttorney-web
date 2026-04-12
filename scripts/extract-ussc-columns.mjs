/**
 * Pre-processor: extract only needed columns from the 27K-column USSC CSV.
 * csv-parse cannot handle 27K columns, so we use line-by-line splitting.
 *
 * Input:  data/bulk-verify/external-intel/ussc/opafy24nid.csv (1.6GB, ~27K cols)
 * Output: data/bulk-verify/external-intel/ussc-individual.csv (~7 cols)
 *
 * Columns extracted (1-indexed positions from header):
 *   684=SENTTOT, 685=SENSPLT0, 724=DISTRICT, 808=MONSEX,
 *   821=OFFGUIDE, 844=SENTRNGE, 875=XCRHISSR
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel", "ussc", "opafy24nid.csv");
const OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel", "ussc-individual.csv");

// 0-indexed column positions
const COLS = [683, 684, 723, 807, 820, 843, 874];
const OUT_HEADERS = ["SENTTOT", "SENSPLT0", "DISTRICT", "MONSEX", "OFFGUIDE", "SENTRNGE", "XCRHISSR"];

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("Input not found:", INPUT);
    process.exit(1);
  }

  console.log("Extracting columns from USSC CSV...");
  console.log("Input:", INPUT);
  console.log("Output:", OUTPUT);

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const out = fs.createWriteStream(OUTPUT, { encoding: "utf8" });
  out.write(OUT_HEADERS.join(",") + "\n");

  let lineNum = 0;
  let written = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) {
      // Verify header positions
      const hdr = line.split(",");
      for (let i = 0; i < COLS.length; i++) {
        const actual = (hdr[COLS[i]] || "").replace(/"/g, "");
        if (actual !== OUT_HEADERS[i]) {
          console.error(`Column mismatch at position ${COLS[i]}: expected "${OUT_HEADERS[i]}", got "${actual}"`);
          process.exit(1);
        }
      }
      console.log("Header verified OK");
      continue;
    }

    const fields = line.split(",");
    const extracted = COLS.map(c => fields[c] || "");
    out.write(extracted.join(",") + "\n");
    written++;

    if (written % 10000 === 0) process.stdout.write(`  ${(written / 1000).toFixed(0)}K rows...\r`);
  }

  out.end();
  console.log(`\nDone. ${written} rows written to ${OUTPUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
