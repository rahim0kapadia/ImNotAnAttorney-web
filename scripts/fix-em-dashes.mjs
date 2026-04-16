// fix-em-dashes.mjs, Replace em dashes across the project tree.
//
// Em dashes are a top AI writing tell. This script replaces them with commas.
//
// File-type rules:
//   - Markdown (.md, .mdx): replace BOTH Unicode em dash and double-hyphen.
//     Prose uses these as em dashes; both must die.
//   - Source code (.ts, .tsx, .js, .jsx, .mjs, .cjs): ONLY replace Unicode em dash.
//     Double-hyphen is legitimate JS/TS syntax (--flag strings, i-- decrement, comments).
//     Unicode em dash is never valid JS/TS syntax so it is always safe to replace.
//
// Space handling: em dashes appear with spaces on both sides, one side, or neither.
// All variants must normalize to a single ", " with no doubled or orphan spaces.
// Order of replacements on each token (Unicode em dash or "--"):
//   1. " X " -> ", "   (both sides)
//   2. " X"  -> ","    (leading space only, e.g. end of line)
//   3. "X "  -> ", "   (trailing space only, e.g. after a quote or punctuation)
//   4. "X"   -> ", "   (bare)
//
// Usage: node scripts/fix-em-dashes.mjs [--dry-run] [--path <dir>]
//
// Skips: node_modules, .next, .git, .turbo, .vercel, dist, build, coverage, .qa-state.

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = join(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const pathArgIdx = process.argv.indexOf("--path");
const scanRoot = pathArgIdx >= 0 ? process.argv[pathArgIdx + 1] : ROOT;

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "coverage",
  ".qa-state",
]);

const MARKDOWN_EXTS = new Set([".md", ".mdx"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const EM = "\u2014";

function countEmDashes(text, { markdown }) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === EM) {
      count++;
      continue;
    }
    if (!markdown) continue;
    if (text[i] === "-" && text[i + 1] === "-" && text[i + 2] !== "-") {
      if (i === 0 || text[i - 1] !== "-") {
        count++;
        i++;
      }
    }
  }
  return count;
}

function replaceToken(text, token) {
  let r = text;
  r = r.split(` ${token} `).join(", ");
  r = r.split(` ${token}`).join(",");
  r = r.split(`${token} `).join(", ");
  r = r.split(token).join(", ");
  return r;
}

function replaceEmDashes(text, { markdown }) {
  let result = text;

  if (markdown) {
    const PLACEHOLDER = "\x00TRIPLE_DASH\x00";
    result = result.split("---").join(PLACEHOLDER);
    result = replaceToken(result, "--");
    result = result.split(PLACEHOLDER).join("---");
  }

  result = replaceToken(result, EM);

  return result;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full);
      continue;
    }
    const ext = extname(entry);
    if (MARKDOWN_EXTS.has(ext) || CODE_EXTS.has(ext)) {
      yield { path: full, ext };
    }
  }
}

let totalFiles = 0;
let totalChanged = 0;
let totalDashes = 0;
const incomplete = [];
const byExt = {};

for (const { path: filePath, ext } of walk(scanRoot)) {
  totalFiles++;
  const markdown = MARKDOWN_EXTS.has(ext);
  const content = readFileSync(filePath, "utf8");
  const before = countEmDashes(content, { markdown });

  if (before === 0) continue;

  totalDashes += before;
  byExt[ext] = (byExt[ext] || 0) + before;

  const fixed = replaceEmDashes(content, { markdown });
  const after = countEmDashes(fixed, { markdown });

  if (!dryRun) {
    writeFileSync(filePath, fixed, "utf8");
  }

  totalChanged++;
  if (after > 0) {
    incomplete.push({ file: filePath, after });
  }
}

console.log(dryRun ? "[DRY RUN]" : "[APPLIED]");
console.log(`Scanned: ${totalFiles} files`);
console.log(`Changed: ${totalChanged} files`);
console.log(`Em dashes replaced: ${totalDashes}`);
console.log("");
console.log("By extension:");
for (const [ext, n] of Object.entries(byExt).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ext.padEnd(6)} ${n}`);
}
console.log("");

if (incomplete.length > 0) {
  console.log("WARNING, files with remaining em dashes:");
  for (const r of incomplete) {
    console.log(`  ${r.after} remaining\t${r.file}`);
  }
} else {
  console.log("All em dashes removed successfully.");
}
