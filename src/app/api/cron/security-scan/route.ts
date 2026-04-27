/**
 * @file /api/cron/security-scan — L3 scheduled security pattern scan.
 *
 * Bootstrap-mode pattern scanner: greps source for common OWASP Top 10 red flags
 * (hardcoded secrets, eval, dangerouslySetInnerHTML, raw SQL concat, cleartext
 * HTTP, process.env leaks). Writes findings to `security_scan_history` and
 * deltas-vs-last-run as Telegram digest.
 *
 * Patterns cited by OWASP Top 10 2021 IDs (A01-A10). Full reference cache:
 *   C:\Users\email\.claude\references\owasp-top-10-2021\
 *
 * Why patterns, not a full Claude-agent audit: serverless cron has 30s compute
 * budget. Full agent audits run from desktop hooks (L1/L2). This layer is the
 * daily heartbeat. Upgrade path: swap `scanFile()` to dispatch a RemoteTrigger
 * to a Claude Code Routine when worker available.
 *
 * Schedule: 06:00 UTC daily (cron-job.org).
 * Auth: CRON_AUTH_TOKEN bearer header.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Finding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  owasp: string;
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

// Patterns mapped to OWASP risk IDs. Keep narrow to avoid false-positive noise.
const PATTERNS: { severity: Finding["severity"]; owasp: string; re: RegExp; name: string }[] = [
  // A02 Cryptographic Failures
  { severity: "CRITICAL", owasp: "A02", name: "hardcoded-api-key", re: /(sk_live|pk_live|sk_test|AIza|ghp_|gho_|ghs_)[A-Za-z0-9_-]{20,}/ },
  { severity: "CRITICAL", owasp: "A02", name: "hardcoded-password", re: /\b(password|PASSWORD|secret|SECRET)\s*[:=]\s*['"][^'"]{6,}['"]/ },
  { severity: "HIGH",     owasp: "A02", name: "cleartext-http", re: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/ },

  // A03 Injection
  { severity: "CRITICAL", owasp: "A03", name: "eval-usage", re: /\beval\s*\(/ },
  { severity: "HIGH",     owasp: "A03", name: "function-constructor", re: /new\s+Function\s*\(/ },
  { severity: "HIGH",     owasp: "A03", name: "sql-string-concat", re: /(SELECT|INSERT|UPDATE|DELETE)\s+[^`'"]*['"]\s*\+\s*\w+/i },
  { severity: "HIGH",     owasp: "A03", name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML\s*[:=]\s*\{\s*__html\s*:\s*(?!DOMPurify|sanitize)/ },
  { severity: "HIGH",     owasp: "A03", name: "exec-shell", re: /\b(exec|execSync|spawn)\s*\(\s*(?:`|['"])[^`'"]*\$\{/ },

  // A05 Security Misconfiguration
  { severity: "MEDIUM",   owasp: "A05", name: "permissive-cors", re: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*/ },
  { severity: "MEDIUM",   owasp: "A05", name: "cookie-no-secure", re: /Set-Cookie[^;]*(?!.*Secure)/ },

  // A09 Logging Failures
  { severity: "MEDIUM",   owasp: "A09", name: "console-log-password", re: /console\.(log|error|warn)\([^)]*(password|token|secret|api[_-]?key)/i },
];

const TARGET_DIRS = ["src/app", "src/lib", "src/middleware.ts", "src/components"];
const SKIP_SUBSTRINGS = ["node_modules/", "__tests__/", ".test.", ".spec.", "/tests/", "generated/", ".d.ts"];
const MAX_FILES = 800;
const MAX_FILE_BYTES = 200 * 1024;

async function walkDir(root: string, out: string[]): Promise<void> {
  if (out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const full = path.join(root, entry.name);
    const normalized = full.replace(/\\/g, "/");
    if (SKIP_SUBSTRINGS.some(s => normalized.includes(s))) continue;
    if (entry.isDirectory()) {
      await walkDir(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

async function scanFile(file: string, projectRoot: string): Promise<Finding[]> {
  let text: string;
  try {
    const stat = await fs.stat(file);
    if (stat.size > MAX_FILE_BYTES) return [];
    text = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const rel = file.replace(projectRoot, "").replace(/\\/g, "/").replace(/^\//, "");
  const lines = text.split("\n");
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 2000) continue;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        findings.push({
          severity: p.severity,
          owasp: p.owasp,
          file: rel,
          line: i + 1,
          pattern: p.name,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
  return findings;
}

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    });
  } catch { /* best effort */ }
}

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const projectRoot = process.cwd();
  const targetFiles: string[] = [];

  for (const target of TARGET_DIRS) {
    const full = path.join(projectRoot, target);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) await walkDir(full, targetFiles);
      else if (stat.isFile()) targetFiles.push(full);
    } catch { /* missing dir — skip */ }
  }

  const findings: Finding[] = [];
  for (const f of targetFiles) {
    const hits = await scanFile(f, projectRoot);
    findings.push(...hits);
  }

  const critical = findings.filter(f => f.severity === "CRITICAL").length;
  const high = findings.filter(f => f.severity === "HIGH").length;
  const medium = findings.filter(f => f.severity === "MEDIUM").length;

  const supabase = createAdminClient();

  // Load previous run for delta
  const { data: prev } = await supabase
    .from("security_scan_history")
    .select("findings_json, critical_count")
    .eq("project", "inaa")
    .order("scan_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevFingerprints = new Set<string>(
    (prev?.findings_json as Finding[] | null || []).map(f => `${f.file}:${f.line}:${f.pattern}`)
  );
  const newCritical = findings.filter(f =>
    f.severity === "CRITICAL" && !prevFingerprints.has(`${f.file}:${f.line}:${f.pattern}`)
  );

  await supabase.from("security_scan_history").insert({
    project: "inaa",
    scan_date: new Date().toISOString(),
    files_scanned: targetFiles.length,
    findings_json: findings,
    critical_count: critical,
    high_count: high,
    medium_count: medium,
  });

  if (newCritical.length > 0) {
    const lines = newCritical.slice(0, 10).map(f =>
      `- *${f.owasp}* ${f.file}:${f.line} — ${f.pattern}`
    ).join("\n");
    const more = newCritical.length > 10 ? `\n_+${newCritical.length - 10} more_` : "";
    await sendTelegram(
      `*SECURITY SCAN — INAA — ${new Date().toISOString().slice(0, 10)}*\n` +
      `${newCritical.length} NEW critical findings (total ${critical}C/${high}H/${medium}M, ${targetFiles.length} files)\n\n` +
      lines + more
    );
  }

  return NextResponse.json({
    ok: true,
    files_scanned: targetFiles.length,
    findings: findings.length,
    critical,
    high,
    medium,
    new_critical: newCritical.length,
  });
}
