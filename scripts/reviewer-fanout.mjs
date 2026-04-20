#!/usr/bin/env node
/**
 * reviewer-fanout.mjs — Fateev/Temporal-pattern durable reviewer fan-out.
 *
 * Replaces the Anthropic Agent tool for reviewer passes where 4-of-7 agents
 * hanging used to cost 30 min of status-theater per session. Shells out to
 * `claude -p <prompt>` subprocesses in parallel, enforces per-reviewer
 * schedule_to_close_timeout at the OS level, collects partial results when
 * stragglers blow the deadline, never blocks the parent indefinitely.
 *
 * Based on Maxim Fateev's durable-execution pattern (Temporal.io):
 *  1. Each agent wrapped as an Activity with hard timeout.
 *  2. Supervisor fans out parallel, awaits Promise.allSettled, collects partial.
 *  3. Output written to file per reviewer — hung agent doesn't destroy siblings.
 *  4. Idempotent: re-runs safe, just overwrites files.
 *
 * Usage:
 *   node scripts/reviewer-fanout.mjs --config docs/reviewer-panels/default.json
 *   node scripts/reviewer-fanout.mjs --config <path> --out docs/reviews/<slug>
 *   node scripts/reviewer-fanout.mjs --config <path> --concurrency 4
 *
 * Config shape (JSON array):
 *   [
 *     {
 *       "slug": "code",
 *       "model": "sonnet",        // "sonnet" | "opus" | "haiku"
 *       "timeoutSec": 480,        // per-reviewer kill deadline (default 480)
 *       "prompt": "Review the diff at {{FILE:.tmp-core-diff.txt}}..."
 *     },
 *     { "slug": "laja", "model": "opus", "prompt": "..." }
 *   ]
 *
 * Prompt placeholders:
 *   {{FILE:<path>}}  — inline contents of <path> (relative to cwd or absolute)
 *   {{CWD}}          — current working directory absolute path
 *
 * Output:
 *   <out>/<slug>.md           — raw reviewer output (stdout) per reviewer
 *   <out>/<slug>.meta.json    — {status, durationMs, exitCode, bytes}
 *   <out>/_summary.md         — table of returned vs timed-out reviewers
 *
 * Exit codes:
 *   0 — all reviewers returned within deadline
 *   1 — at least one reviewer timed out (partial results still written)
 *   2 — usage error / config malformed
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_SEC = 480;
const DEFAULT_CONCURRENCY = 4;
const PLACEHOLDER_OPEN = "{{";
const PLACEHOLDER_CLOSE = "}}";

function parseArgs(argv) {
  const args = { concurrency: DEFAULT_CONCURRENCY };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") args.config = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/reviewer-fanout.mjs --config <panel.json> [--out <dir>] [--concurrency <n>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!args.config) {
    console.error("Missing --config <panel.json>");
    process.exit(2);
  }
  return args;
}

/**
 * Expand {{FILE:...}} and {{CWD}} placeholders in a prompt string.
 *
 * Non-regex indexOf scanner — per hook policy, regex on file contents is
 * banned. This iterates the prompt string, locates {{ ... }} tokens, and
 * splices in the resolved value. Unknown tokens pass through unchanged so
 * bad templates surface visibly in the reviewer output instead of silently
 * disappearing.
 */
async function expandPrompt(prompt, cwd) {
  let out = "";
  let i = 0;
  while (i < prompt.length) {
    const open = prompt.indexOf(PLACEHOLDER_OPEN, i);
    if (open === -1) {
      out += prompt.slice(i);
      break;
    }
    out += prompt.slice(i, open);
    const close = prompt.indexOf(PLACEHOLDER_CLOSE, open + PLACEHOLDER_OPEN.length);
    if (close === -1) {
      // No close brace found — keep the tail literal rather than silently eating it.
      out += prompt.slice(open);
      break;
    }
    const token = prompt.slice(open + PLACEHOLDER_OPEN.length, close).trim();
    if (token === "CWD") {
      out += cwd;
    } else if (token.startsWith("FILE:")) {
      const rel = token.slice("FILE:".length).trim();
      const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
      if (!existsSync(abs)) {
        throw new Error(
          `{{FILE:${rel}}} does not exist (resolved to ${abs})`,
        );
      }
      const body = await readFile(abs, "utf8");
      out += body;
    } else {
      // Unknown placeholder — pass through literally for visibility.
      out += PLACEHOLDER_OPEN + token + PLACEHOLDER_CLOSE;
    }
    i = close + PLACEHOLDER_CLOSE.length;
  }
  return out;
}

/** Spawn `claude -p` and capture stdout with hard timeout.
 *
 * Prompt is piped via stdin, not argv. Inlined diffs routinely exceed the
 * Windows 32 KB command-line limit (ENAMETOOLONG) and even on POSIX the
 * 128 KB ARG_MAX ceiling blows up on large multi-file reviews. stdin is
 * the only safe channel.
 */
function runReviewer(reviewer, outDir, cwd) {
  return new Promise((resolve) => {
    const timeoutSec = reviewer.timeoutSec || DEFAULT_TIMEOUT_SEC;
    const slug = reviewer.slug;
    const startedAt = Date.now();

    // `-p` with no positional + stdin prompt = headless print mode reading
    // from stdin (Claude Code CLI convention: `echo "prompt" | claude -p`).
    const cliArgs = ["-p"];
    if (reviewer.model) cliArgs.push("--model", reviewer.model);

    const outFile = path.join(outDir, `${slug}.md`);
    const metaFile = path.join(outDir, `${slug}.meta.json`);

    const child = spawn("claude", cliArgs, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      // Windows needs shell for .cmd/.ps1 lookup on PATH.
      shell: process.platform === "win32",
    });

    // Stream the prompt in and close — claude reads stdin until EOF.
    child.stdin.write(reviewer.prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Fateev: schedule_to_close_timeout. Hard kill on overrun.
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
            shell: true,
          });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // Already dead — fine.
      }
      finish({
        status: "timeout",
        exitCode: null,
        durationMs: Date.now() - startedAt,
      });
    }, timeoutSec * 1000);

    async function finish(meta) {
      clearTimeout(deadline);
      const body =
        stdout.length > 0
          ? stdout
          : `<!-- reviewer ${slug} produced no stdout; stderr follows -->\n\n${stderr}`;
      try {
        await writeFile(outFile, body, "utf8");
        await writeFile(
          metaFile,
          JSON.stringify(
            {
              slug,
              model: reviewer.model || "default",
              timeoutSec,
              ...meta,
              bytes: body.length,
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch (err) {
        console.error(`[${slug}] write failed: ${err.message}`);
      }
      resolve({ slug, ...meta, bytes: body.length, outFile });
    }

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      stderr += `\n[spawn error] ${err.message}`;
      finish({
        status: "spawn_error",
        exitCode: null,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      finish({
        status: code === 0 ? "ok" : "nonzero_exit",
        exitCode: code,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

/** Bounded-concurrency worker pool. Preserves input order in results. */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let i = 0;
  const slotCount = Math.max(1, Math.min(concurrency, items.length));
  const slots = new Array(slotCount).fill(null).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(slots);
  return results;
}

function renderSummary(results, startedAt, outDir) {
  const total = results.length;
  const ok = results.filter((r) => r.status === "ok").length;
  const timeout = results.filter((r) => r.status === "timeout").length;
  const nonzero = results.filter((r) => r.status === "nonzero_exit").length;
  const spawnErr = results.filter((r) => r.status === "spawn_error").length;
  const wallMs = Date.now() - startedAt;

  const lines = [
    `# Reviewer fan-out summary`,
    ``,
    `Started: ${new Date(startedAt).toISOString()}`,
    `Wall clock: ${(wallMs / 1000).toFixed(1)}s`,
    `Output dir: ${outDir}`,
    ``,
    `**Totals:** ${ok} ok · ${timeout} timed out · ${nonzero} nonzero exit · ${spawnErr} spawn error · ${total} total`,
    ``,
    `| slug | status | exit | duration (s) | bytes | output |`,
    `|------|--------|------|--------------|-------|--------|`,
  ];
  for (const r of results) {
    lines.push(
      `| ${r.slug} | ${r.status} | ${r.exitCode ?? "—"} | ${(r.durationMs / 1000).toFixed(1)} | ${r.bytes} | ${r.outFile} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();

  // Load + validate config.
  const raw = await readFile(args.config, "utf8");
  let panel;
  try {
    panel = JSON.parse(raw);
  } catch (e) {
    console.error(`Config ${args.config} is not valid JSON: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(panel) || panel.length === 0) {
    console.error(`Config ${args.config} must be a non-empty JSON array.`);
    process.exit(2);
  }
  const slugs = new Set();
  for (const r of panel) {
    if (!r.slug || !r.prompt) {
      console.error(`Reviewer missing slug or prompt: ${JSON.stringify(r)}`);
      process.exit(2);
    }
    if (slugs.has(r.slug)) {
      console.error(`Duplicate reviewer slug: ${r.slug}`);
      process.exit(2);
    }
    slugs.add(r.slug);
  }

  // Expand placeholders in each prompt.
  for (const r of panel) {
    r.prompt = await expandPrompt(r.prompt, cwd);
  }

  // Prepare output dir.
  const outDir =
    args.out ||
    path.join(
      cwd,
      "docs",
      "reviews",
      new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"),
    );
  await mkdir(outDir, { recursive: true });

  const startedAt = Date.now();
  console.log(
    `Dispatching ${panel.length} reviewer${panel.length === 1 ? "" : "s"} (concurrency=${args.concurrency}) → ${outDir}`,
  );

  const results = await runPool(panel, args.concurrency, (reviewer) =>
    runReviewer(reviewer, outDir, cwd),
  );

  const summary = renderSummary(results, startedAt, outDir);
  await writeFile(path.join(outDir, "_summary.md"), summary, "utf8");
  console.log("\n" + summary);

  const anyTimeout = results.some((r) => r.status === "timeout");
  process.exit(anyTimeout ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal: ${err.stack || err.message}`);
  process.exit(2);
});
