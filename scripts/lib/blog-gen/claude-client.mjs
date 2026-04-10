// claude-client.mjs — Claude Code headless subprocess wrapper for blog QA gates.
//
// Replaces the previous direct Anthropic SDK client. Spawns `claude -p` as a
// subprocess and pipes the prompt via stdin. Runs under whatever auth the local
// Claude Code CLI is signed into — no Anthropic API credits consumed.
//
// Why stdin (not argv): blog MDX content is routinely 5-15 KB. Windows cmd.exe
// caps command-line arguments at 8191 characters, so argv-style prompts would
// truncate. stdin has no practical size limit.
//
// Contract preserved: callClaude({jobType, systemPrompt, userPrompt, maxTokens,
// jobId, purpose, model}) → {text, usage, cost, model, latencyMs}. The 4 gate
// files (qa-slop, qa-upl, qa-dna, qa-anti-hallucination) work unchanged.
//
// systemPrompt handling: `claude -p` has no --system flag, so a non-empty
// systemPrompt is prepended to userPrompt with a blank-line separator. All 4
// current gates pass empty systemPrompt anyway — this is future-proofing only.

import { spawn } from "child_process";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min per call — allows Opus deep reasoning on long posts

export class ClaudeHeadlessError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClaudeHeadlessError";
  }
}

/**
 * Call the Claude Code CLI in headless print mode.
 * Spawns `claude -p`, pipes the prompt via stdin, returns stdout text.
 * Performs up to 2 retries on transient spawn errors.
 *
 * @param {object}  opts
 * @param {string}  [opts.jobType]       - Logical gate name (accepted for signature compatibility; unused)
 * @param {string}  [opts.systemPrompt]  - Prepended to userPrompt if non-empty
 * @param {string}  opts.userPrompt      - Required. The actual prompt to send
 * @param {number}  [opts.maxTokens]     - Accepted for signature compatibility; unused (CLI controls this)
 * @param {number}  [opts.timeoutMs]     - Per-call timeout. Default 10 minutes
 * @returns {Promise<{text: string, usage: object, cost: number, model: string, latencyMs: number}>}
 */
export async function callClaude({
  systemPrompt = "",
  userPrompt,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  // jobType, maxTokens, jobId, purpose, model — all accepted for signature
  // compatibility but unused. The CLI's configured session model is used.
} = {}) {
  if (!userPrompt || typeof userPrompt !== "string") {
    throw new ClaudeHeadlessError("callClaude: userPrompt is required and must be a string");
  }

  const combinedPrompt = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await spawnClaudeOnce(combinedPrompt, timeoutMs);
    } catch (err) {
      lastError = err;
      // Don't retry timeouts — something upstream is broken, fail fast
      if (String(err?.message || "").includes("timed out")) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw new ClaudeHeadlessError(
    `claude -p failed after ${maxAttempts} attempts: ${lastError?.message || lastError}`,
  );
}

function spawnClaudeOnce(prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();

    const proc = spawn("claude", ["-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new ClaudeHeadlessError(`Failed to spawn claude CLI: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new ClaudeHeadlessError(`claude -p timed out after ${timeoutMs}ms`));
      }
      if (code !== 0) {
        const msg = (stderr.trim() || stdout.trim() || "no output").slice(0, 500);
        return reject(new ClaudeHeadlessError(`claude -p exited ${code}: ${msg}`));
      }
      const text = stdout.trim();
      if (!text) {
        return reject(new ClaudeHeadlessError("claude -p returned empty stdout"));
      }
      resolve({
        text,
        usage: {},
        cost: 0,
        model: "claude-code-headless",
        latencyMs: Date.now() - startMs,
      });
    });

    // Write prompt to stdin. spawn handles backpressure internally on pipes,
    // so a single .write() + .end() is safe for typical blog-post-sized prompts.
    try {
      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      reject(new ClaudeHeadlessError(`Failed to write prompt to claude stdin: ${err.message}`));
    }
  });
}
