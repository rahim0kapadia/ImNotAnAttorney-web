#!/usr/bin/env node
// qa-existing-post.mjs — Unified QA runner for existing blog posts.
//
// Runs all 5 quality gates against a .mdx file (or every .mdx file with --all)
// and writes the outcome to a sidecar JSON at content/blog/.qa-state/<slug>.json.
// The sidecar is committed to the repo so blog.ts can hard-gate renders at
// build time without making LLM calls.
//
// Gate order (humanizer first — pure JS, always runs; LLM gates second):
//   1. humanizer          (pure JS — detects AI writing patterns)
//   2. anti_hallucination (Opus — safety-critical legal fact check)
//   3. slop               (Sonnet — 14 content quality checks)
//   4. upl                (Sonnet — 15 UPL compliance criteria)
//   5. dna                (Sonnet — 12 structural DNA checks)
//
// LLM gates run via `claude -p` headless subprocess (see claude-client.mjs).
// No Anthropic API credits are consumed — the CLI uses whatever auth you're
// signed into Claude Code with. If a gate throws, that single gate is recorded
// as { passed: false, status: "unchecked", reason: "<error>" } so a single
// flaky call doesn't nuke a 59-post baseline.
//
// Usage:
//   node scripts/qa-existing-post.mjs content/blog/foo.mdx
//   node scripts/qa-existing-post.mjs --all
//   node scripts/qa-existing-post.mjs --all --gate=dna
//   node scripts/qa-existing-post.mjs --all --skip-llm        # humanizer only
//   node scripts/qa-existing-post.mjs --all --only-stale      # re-run fails
//
// Exit codes:
//   0 = all targeted posts passed (or --skip-llm and humanizer passed)
//   1 = one or more posts failed
//   2 = runner-level error (missing file, bad args)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { runHumanizerCheck } from "./lib/blog-gen/humanizer.mjs";
import { runSlopAudit } from "./lib/blog-gen/qa-slop.mjs";
import { runUPLCheck } from "./lib/blog-gen/qa-upl.mjs";
import { runDNACheck } from "./lib/blog-gen/qa-dna.mjs";
import { runAntiHallucinationCheck } from "./lib/blog-gen/qa-anti-hallucination.mjs";
import { callClaude } from "./lib/blog-gen/claude-client.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(REPO_ROOT, "content", "blog");
const QA_STATE_DIR = path.join(BLOG_DIR, ".qa-state");

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { all: false, gate: null, skipLlm: false, onlyStale: false, parallel: false, file: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--all") args.all = true;
    else if (raw === "--skip-llm") args.skipLlm = true;
    else if (raw === "--only-stale") args.onlyStale = true;
    else if (raw === "--parallel") args.parallel = true;
    else if (raw.startsWith("--gate=")) args.gate = raw.slice("--gate=".length);
    else if (!raw.startsWith("--")) args.file = raw;
  }
  return args;
}

// ── Gate runners ─────────────────────────────────────────────────────────────

const GATE_ORDER = ["humanizer", "anti_hallucination", "slop", "upl", "dna"];

function uncheckedResult(reason) {
  return { passed: false, status: "unchecked", reason };
}

async function runGate(name, slug, fn) {
  const startMs = Date.now();
  try {
    const r = await fn();
    const dur = ((Date.now() - startMs) / 1000).toFixed(1);
    process.stdout.write(
      `    → ${name.padEnd(18)} ${r.passed ? "PASS" : "FAIL"} (${dur}s)\n`,
    );
    return { passed: r.passed, status: "checked", details: r.details };
  } catch (err) {
    const dur = ((Date.now() - startMs) / 1000).toFixed(1);
    const msg = String(err?.message || err).slice(0, 200);
    process.stdout.write(
      `    → ${name.padEnd(18)} UNCHECKED (${dur}s) — ${msg}\n`,
    );
    return uncheckedResult(String(err?.message || err).slice(0, 500));
  }
}

async function runAllGates(mdxContent, { gateFilter, skipLlm, parallel, slug }) {
  const gates = {};

  // ── 1. Humanizer (pure JS, always runs) ──
  if (!gateFilter || gateFilter === "humanizer") {
    const h = runHumanizerCheck(mdxContent);
    gates.humanizer = {
      passed: h.passed,
      status: "checked",
      score: h.score,
      details: h.details,
    };
    process.stdout.write(
      `    → humanizer ... ${h.passed ? "PASS" : "FAIL"} (score ${h.score})\n`,
    );
  }

  if (skipLlm) return gates;

  // Build gate list — each entry is [name, fn]. Order matters for sequential.
  const llmGates = [];
  if (!gateFilter || gateFilter === "anti_hallucination") {
    llmGates.push(["anti_hallucination", () => runAntiHallucinationCheck(mdxContent, { callClaude })]);
  }
  if (!gateFilter || gateFilter === "slop") {
    llmGates.push(["slop", () => runSlopAudit(mdxContent, null, { callClaude })]);
  }
  if (!gateFilter || gateFilter === "upl") {
    llmGates.push(["upl", () => runUPLCheck(mdxContent, { callClaude })]);
  }
  if (!gateFilter || gateFilter === "dna") {
    llmGates.push(["dna", () => runDNACheck(mdxContent, { callClaude })]);
  }

  if (parallel) {
    // --parallel: fire all 4 claude -p subprocesses at once. Fast (~65s/post)
    // but burns through Claude Code rate limits 4x faster.
    await Promise.all(
      llmGates.map(([name, fn]) =>
        runGate(name, slug, fn).then((r) => (gates[name] = r)),
      ),
    );
  } else {
    // Default: sequential. Slower (~4min/post) but rate-limit-friendly.
    // Each gate completes before the next starts.
    for (const [name, fn] of llmGates) {
      gates[name] = await runGate(name, slug, fn);
    }
  }

  return gates;
}

// ── Sidecar I/O ──────────────────────────────────────────────────────────────

function sidecarPath(slug) {
  return path.join(QA_STATE_DIR, `${slug}.json`);
}

function readExisting(slug) {
  const p = sidecarPath(slug);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function writeSidecar(slug, sidecar) {
  if (!fs.existsSync(QA_STATE_DIR)) fs.mkdirSync(QA_STATE_DIR, { recursive: true });
  fs.writeFileSync(sidecarPath(slug), JSON.stringify(sidecar, null, 2) + "\n");
}

function mergeGates(existing, fresh) {
  // When --gate=X is used, only refresh that single gate and keep the others.
  if (!existing || !existing.gates) return fresh;
  return { ...existing.gates, ...fresh };
}

function computeAllPassed(gates) {
  for (const name of GATE_ORDER) {
    const g = gates[name];
    if (!g) return false;
    if (g.passed !== true) return false;
    if (g.status !== "checked") return false;
  }
  return true;
}

// ── Per-post runner ──────────────────────────────────────────────────────────

async function processPost(filePath, opts) {
  const slug = path.basename(filePath, ".mdx");
  const mdx = fs.readFileSync(filePath, "utf-8");

  if (opts.onlyStale) {
    const existing = readExisting(slug);
    if (existing && existing.all_passed === true) {
      return { slug, skipped: true, passed: true };
    }
  }

  const freshGates = await runAllGates(mdx, {
    gateFilter: opts.gate,
    skipLlm: opts.skipLlm,
    parallel: opts.parallel,
    slug,
  });

  const existing = readExisting(slug);
  const mergedGates = mergeGates(existing, freshGates);
  const allPassed = computeAllPassed(mergedGates);

  const sidecar = {
    slug,
    last_checked: new Date().toISOString(),
    all_passed: allPassed,
    gates: mergedGates,
  };

  writeSidecar(slug, sidecar);

  return { slug, skipped: false, passed: allPassed, gates: mergedGates };
}

// ── Reporting ────────────────────────────────────────────────────────────────

function gateSummary(gates) {
  const parts = [];
  for (const name of GATE_ORDER) {
    const g = gates[name];
    if (!g) {
      parts.push(`${name}:-`);
      continue;
    }
    if (g.status === "unchecked") {
      parts.push(`${name}:?`);
    } else if (g.passed) {
      parts.push(`${name}:PASS`);
    } else {
      parts.push(`${name}:FAIL`);
    }
  }
  return parts.join(" ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!args.all && !args.file) {
    console.error("Usage: node scripts/qa-existing-post.mjs <file.mdx> | --all [--gate=name] [--skip-llm] [--only-stale]");
    process.exit(2);
  }

  let targets = [];
  if (args.all) {
    if (!fs.existsSync(BLOG_DIR)) {
      console.error(`Blog directory not found: ${BLOG_DIR}`);
      process.exit(2);
    }
    targets = fs
      .readdirSync(BLOG_DIR)
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => path.join(BLOG_DIR, f))
      .sort();
  } else {
    const abs = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
    if (!fs.existsSync(abs)) {
      console.error(`File not found: ${abs}`);
      process.exit(2);
    }
    targets = [abs];
  }

  console.log(`QA runner — ${targets.length} target(s), gate=${args.gate ?? "all"}, skipLlm=${args.skipLlm}, onlyStale=${args.onlyStale}`);

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const filePath = targets[i];
    const slug = path.basename(filePath, ".mdx");
    const prefix = `[${i + 1}/${targets.length}] ${slug}`;
    try {
      const r = await processPost(filePath, args);
      if (r.skipped) {
        skipCount++;
        console.log(`${prefix} SKIP (already passing)`);
        continue;
      }
      if (r.passed) {
        passCount++;
        console.log(`${prefix} PASS   ${gateSummary(r.gates)}`);
      } else {
        failCount++;
        failures.push({ slug, gates: r.gates });
        console.log(`${prefix} FAIL   ${gateSummary(r.gates)}`);
      }
    } catch (err) {
      failCount++;
      console.error(`${prefix} ERROR  ${err?.message || err}`);
    }
  }

  console.log("");
  console.log(`Summary: ${passCount} pass / ${failCount} fail / ${skipCount} skip`);

  if (failures.length > 0 && targets.length > 1) {
    console.log("");
    console.log("Failing posts:");
    for (const f of failures) {
      const failedGates = GATE_ORDER.filter(
        (name) => f.gates[name] && f.gates[name].passed !== true
      );
      console.log(`  ${f.slug}  →  ${failedGates.join(", ")}`);
    }
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(2);
});
