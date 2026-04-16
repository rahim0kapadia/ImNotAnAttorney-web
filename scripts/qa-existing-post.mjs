#!/usr/bin/env node
// DEPRECATED: LLM gates now run session-native via /blog-pipeline skill.
// This script is retained for humanizer-only mode (pre-commit hook outside CC session).
//
// qa-existing-post.mjs — Humanizer-only QA runner for existing blog posts.
//
// Runs the humanizer gate (pure JS) against a .mdx file (or every .mdx file
// with --all) and writes the outcome to a sidecar JSON at
// content/blog/.qa-state/<slug>.json.
//
// Usage:
//   node scripts/qa-existing-post.mjs content/blog/foo.mdx
//   node scripts/qa-existing-post.mjs --all
//   node scripts/qa-existing-post.mjs --all --only-stale
//
// Exit codes:
//   0 = all targeted posts passed humanizer
//   1 = one or more posts failed
//   2 = runner-level error (missing file, bad args)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { runHumanizerCheck } from "./lib/blog-gen/humanizer.mjs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function loadAdaptiveThreshold() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 45;

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("demand_feedback")
      .select("qa_humanizer_threshold")
      .eq("charge_type_slug", "_global")
      .maybeSingle();
    return data?.qa_humanizer_threshold ?? 45;
  } catch {
    return 45;
  }
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(REPO_ROOT, "content", "blog");
const QA_STATE_DIR = path.join(BLOG_DIR, ".qa-state");

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { all: false, onlyStale: false, file: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--all") args.all = true;
    else if (raw === "--only-stale") args.onlyStale = true;
    else if (!raw.startsWith("--")) args.file = raw;
  }
  return args;
}

// ── Gate runners ─────────────────────────────────────────────────────────────
// LLM gates (anti-hallucination, slop, UPL, DNA) removed — now run
// session-native via /blog-pipeline skill. Only humanizer (pure JS) remains.

const GATE_ORDER = ["humanizer"];

async function runAllGates(mdxContent) {
  const gates = {};
  const adaptiveThreshold = await loadAdaptiveThreshold();
  const h = runHumanizerCheck(mdxContent, { threshold: adaptiveThreshold });
  gates.humanizer = {
    passed: h.passed,
    status: "checked",
    score: h.score,
    details: h.details,
  };
  process.stdout.write(
    `    → humanizer ... ${h.passed ? "PASS" : "FAIL"} (score ${h.score})\n`,
  );
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

  const freshGates = await runAllGates(mdx);

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
