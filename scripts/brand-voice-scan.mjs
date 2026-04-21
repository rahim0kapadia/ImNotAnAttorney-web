#!/usr/bin/env node
/**
 * Brand-voice heuristic flagger for partner-surface copy.
 *
 * NOT an auto-fixer. Output is advisory — ranked candidates with reasons
 * and file:line references. User triages which to fix.
 *
 * Usage:
 *   node scripts/brand-voice-scan.mjs           # default paths, colorized summary
 *   node scripts/brand-voice-scan.mjs --json    # JSON lines for tooling
 *   node scripts/brand-voice-scan.mjs path/foo.tsx path/bar.tsx
 *
 * Exits 0 always (flags are advisory, not failures). Emit exit code 2 on
 * read/parse errors so CI can distinguish tool failure from clean output.
 *
 * Rules enforced: see docs/plans/2026-04-21-partner-portal-phase-3-hardening.md
 * + .claude/rules/brand-voice.md.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function dirname(p) {
  const i = p.replace(/\\/g, "/").lastIndexOf("/");
  return i < 0 ? "." : p.slice(0, i);
}

// ── Rule catalog ─────────────────────────────────────────────────────
// Each rule has: id, severity, reason, and one of:
//   - pattern: RegExp (case-insensitive, global)
//   - fn: (line) => boolean (heuristic check per line)
//
// Severity: "hard" (should not appear), "soft" (flag for review).

const RULES = [
  // Hard
  {
    id: "speed-sell",
    severity: "hard",
    reason: "Speed-selling — brand forbids selling on speed/time. Quality is the hook.",
    pattern: /\b(?:fast|quick|quickly|instantly|instant|rapid|in\s+minutes|under\s+60\s+seconds|within\s+an\s+hour|same-day|blazing|lightning)\b/gi,
  },
  {
    id: "burden-on-defendant",
    severity: "hard",
    reason: "Burden-back-on-defendant. Brand rule: 'We Research, You Ask' — never 'You Do'.",
    pattern: /\b(?:you\s+ask\b|you\s+do\b|your\s+job\s+is|you\s+need\s+to|you\s+have\s+to\b)/gi,
  },
  {
    id: "corporate-lawyer",
    severity: "hard",
    reason: "Corporate-lawyer voice. Brand is insider-defendant, not corporate legal.",
    pattern: /\b(?:hereby|pursuant\s+to|hereinafter|aforementioned|wherein|notwithstanding)\b/gi,
  },
  {
    id: "outcome-guarantee",
    severity: "hard",
    reason: "Outcome guarantee. UPL risk + brand ban.",
    pattern: /\b(?:we\s+guarantee|guaranteed\s+(?:dismissal|acquittal|outcome|win)|will\s+win|will\s+prevail|ensures?\s+(?:a|your)\s+(?:dismissal|acquittal))\b/gi,
  },
  {
    id: "gavel-cliche",
    severity: "hard",
    reason: "Gavel / scales-of-justice visual cliché. Brand rule explicitly bans.",
    pattern: /\b(?:gavel|scales\s+of\s+justice)\b/gi,
  },
  {
    id: "attorney-verification",
    severity: "hard",
    reason: "Attorney-verification framing. Defendants have no attorney to verify anything.",
    pattern: /\b(?:ask\s+your\s+attorney\s+to\s+verify|verify\s+with\s+your\s+attorney|your\s+attorney\s+can\s+confirm|have\s+your\s+attorney\s+verify)\b/gi,
  },

  // Soft
  {
    id: "we-are-attorneys",
    severity: "soft",
    reason: "Co-occurrence of 'we/our' + 'attorney' — brand rule forbids implying we ARE attorneys.",
    fn: (line) => {
      const lower = line.toLowerCase();
      if (!/\bour\s+attorneys?\b/.test(lower)) return false;
      return true;
    },
  },
  {
    id: "passive-voice",
    severity: "soft",
    reason: "Passive voice in sales copy — active voice is stronger.",
    pattern: /\b(?:is|are|was|were|be|been|being)\s+(?:guaranteed|processed|sent|delivered|provided)\s+(?:by|within|at|in)\b/gi,
  },
  {
    id: "high-adjective-density",
    severity: "soft",
    reason: "Adjective density > 20% — copy-smell, marketing puffery.",
    fn: (line) => {
      // Rough adjective heuristic: count -ly-less words ending in common
      // adj suffixes, divided by total words. Skip short lines (<8 words).
      const words = line.replace(/<[^>]+>/g, " ").match(/\b\w+\b/g) ?? [];
      if (words.length < 8) return false;
      const adjSuffixes = /(?:ive|ful|ous|able|ible|al|ic|ant|ent|ish|less|like|y|est)$/i;
      const adjExcluded = /(?:very|only|really|just|also|then|even|still)$/i;
      let adjCount = 0;
      for (const w of words) {
        if (w.length < 4) continue;
        if (adjExcluded.test(w)) continue;
        if (adjSuffixes.test(w)) adjCount++;
      }
      return adjCount / words.length > 0.2;
    },
  },
  {
    id: "you-we-imbalance",
    severity: "soft",
    reason: "'you' outnumbers 'we' > 2:1 — brand imbalance (We Research carries more verbs).",
    fn: (line) => {
      const lower = line.toLowerCase();
      const words = lower.match(/\b\w+\b/g) ?? [];
      if (words.length < 15) return false;
      const you = words.filter((w) => w === "you" || w === "your" || w === "you're").length;
      const we = words.filter((w) => w === "we" || w === "our" || w === "we're" || w === "us").length;
      if (you < 3) return false;
      return we === 0 ? you >= 3 : you / we > 2;
    },
  },
];

// ── Default target list ──────────────────────────────────────────────

const DEFAULT_TARGETS = [
  "src/app/r/[code]/page.tsx",
  "src/app/r/[code]/[product]/page.tsx",
  "src/app/r/[code]/quiz/page.tsx",
  "src/app/r/[code]/reminders/page.tsx",
  "src/app/checkin/[code]/page.tsx",
  "src/components/BridgePage.tsx",
];

// Partner-facing pages — glob if the dir exists.
function discoverPartnerPages() {
  const base = path.join(REPO_ROOT, "src", "app", "partner");
  if (!existsSync(base)) return [];
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (/^page\.tsx$/.test(name)) out.push(path.relative(REPO_ROOT, full));
    }
  }
  walk(base);
  return out;
}

// ── Main scan ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const explicitTargets = args.filter((a) => !a.startsWith("--"));
const targets = explicitTargets.length > 0
  ? explicitTargets
  : [...DEFAULT_TARGETS, ...discoverPartnerPages()];

function scanFile(relPath) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
  if (!existsSync(full)) {
    return { file: relPath, findings: [], error: "not found" };
  }
  const source = readFileSync(full, "utf8");
  const lines = source.split(/\r?\n/);
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Skip lines that are pure imports / JSX-attribute noise / comments
    if (/^\s*(?:import |\/\/|\*|\/\*)/.test(line)) continue;

    for (const rule of RULES) {
      if (rule.pattern) {
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        const matches = [...line.matchAll(re)];
        for (const m of matches) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            line: i + 1,
            column: (m.index ?? 0) + 1,
            match: m[0],
            context: line.trim().slice(0, 160),
            reason: rule.reason,
          });
        }
      } else if (rule.fn) {
        if (rule.fn(line)) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            line: i + 1,
            context: line.trim().slice(0, 160),
            reason: rule.reason,
          });
        }
      }
    }
  }

  return { file: relPath, findings };
}

const results = targets.map(scanFile);

if (outputJson) {
  for (const r of results) {
    for (const f of r.findings) {
      console.log(JSON.stringify({ ...f, file: r.file }));
    }
  }
} else {
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED = "\x1b[31m";
  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  let hardCount = 0;
  let softCount = 0;
  for (const r of results) {
    if (r.findings.length === 0) continue;
    const hard = r.findings.filter((f) => f.severity === "hard").length;
    const soft = r.findings.filter((f) => f.severity === "soft").length;
    hardCount += hard;
    softCount += soft;
    console.log(`${BOLD}${r.file}${RESET}  ${RED}${hard} hard${RESET}  ${YELLOW}${soft} soft${RESET}`);
    // Sort: hard first, then by line
    const sorted = [...r.findings].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "hard" ? -1 : 1;
      return a.line - b.line;
    });
    for (const f of sorted) {
      const color = f.severity === "hard" ? RED : YELLOW;
      const lineRef = `${r.file}:${f.line}${f.column ? ":" + f.column : ""}`;
      console.log(`  ${color}${f.severity.toUpperCase()}${RESET}  ${f.rule.padEnd(24)}  ${DIM}${lineRef}${RESET}`);
      console.log(`         ${f.reason}`);
      if (f.match) console.log(`         ${DIM}match: "${f.match}"${RESET}`);
      console.log(`         ${DIM}${f.context}${RESET}`);
      console.log("");
    }
    console.log("");
  }

  console.log(`${BOLD}Summary${RESET}: ${RED}${hardCount} hard${RESET}, ${YELLOW}${softCount} soft${RESET} across ${results.filter((r) => r.findings.length).length} files.`);
  if (hardCount === 0 && softCount === 0) {
    console.log(`${GREEN}Clean.${RESET} All scanned files pass every heuristic.`);
  } else {
    console.log(`Review is advisory. Fix hard findings first; soft findings are triage candidates.`);
  }
}

process.exit(0);
