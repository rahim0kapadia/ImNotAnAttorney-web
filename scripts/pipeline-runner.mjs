#!/usr/bin/env node
/**
 * INA Tier 9 Pipeline Runner
 * Chains bulk-master-extractor (all 8 tables incl. appellate_trends via Phase 0+1
 * DB-first, 2026-05-04) → bulk-similar-case-matcher.
 * Each stage runs sequentially with 8GB heap; never in parallel.
 *
 * History: bulk-appeal-outcome-correlator stages 2a-2d removed 2026-05-04.
 * That script was deprecated for csv-parse corruption (PRs #309/#312/#313);
 * bulk-master-extractor's Phase 0+1 produces the same appellate_trends data.
 *
 * Usage:
 *   node scripts/pipeline-runner.mjs
 *   node scripts/pipeline-runner.mjs --dry-run
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = 'C:/Users/email/projects/ImNotAnAttorney-web';
const LOGS_DIR     = join(PROJECT_ROOT, 'logs');
const TELEGRAM_SCRIPT = 'C:/Users/email/.claude/scripts/telegram/telegram-send.js';

const isDryRun = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const runDate  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const logFile  = join(LOGS_DIR, `pipeline-run-${runDate}.log`);

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(logFile, line + '\n', 'utf8');
  } catch (_) {
    // never crash on log write failure
  }
}

// ---------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------

/**
 * Each entry: { label, cmd }
 * cmd is the full command string to pass to execSync.
 */
const STAGES = [
  {
    label: 'Stage 1, bulk-master-extractor',
    cmd:   'node --max-old-space-size=8192 scripts/bulk-master-extractor.mjs --apply',
  },
  // ──────────────────────────────────────────────────────────────────────
  // Stages 2a-2d below were removed 2026-05-04. bulk-appeal-outcome-correlator.mjs
  // is DEPRECATED — uses broken csv-parse over 50 GB opinions bz2 (PRs #309/
  // #312/#313). bulk-master-extractor.mjs Stage 1 above already produces the
  // appellate_trends data via its DB-first Phase 0+1 pipeline (Phase 0 reads
  // cl_citation_map; Phase 1 reads cl_opinion_bodies; both DB-native, no
  // parser).
  //
  // To re-add: nothing to do — Stage 1's `bulk-master-extractor.mjs --apply`
  // (no --tables filter) already populates appellate_trends.
  // ──────────────────────────────────────────────────────────────────────
  {
    label: 'Stage 3, bulk-similar-case-matcher',
    cmd:   'node --max-old-space-size=8192 scripts/bulk-similar-case-matcher.mjs --apply',
  },
];

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------

function sendTelegram(message) {
  // spawnSync array form (shell:false) — message can contain stage error
  // text with backticks, $(...), \n, ;, etc. that MUST NOT go through a
  // shell. Backport from blog-pipeline/scripts/quora-auto.mjs:912 (parent-
  // canonical pattern). 1000-char cap matches parent. windowsHide:true per
  // ~/.claude/rules/drafts/enforce-windowshide.md.
  try {
    if (!existsSync(TELEGRAM_SCRIPT)) {
      log('WARN: Telegram script not found, skipping notification');
      return;
    }
    const r = spawnSync(
      'node',
      [TELEGRAM_SCRIPT, '--bot', 'legal', '--message', String(message).slice(0, 1000)],
      { cwd: PROJECT_ROOT, stdio: 'inherit', shell: false, timeout: 15000, windowsHide: true }
    );
    if (r.status !== 0) {
      log(`WARN: Telegram notification exit=${r.status}`);
    }
  } catch (err) {
    log(`WARN: Telegram notification failed, ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function runStage(stage) {
  log(`START  ${stage.label}`);
  log(`CMD    ${stage.cmd}`);

  if (isDryRun) {
    log(`DRY-RUN, skipping execution`);
    return;
  }

  const t0 = Date.now();
  // stage.cmd is a hardcoded string from STAGES (no user input flows in),
  // so shell-mode is safe here. windowsHide:true suppresses conhost flash
  // per ~/.claude/rules/drafts/enforce-windowshide.md.
  execSync(stage.cmd, {
    cwd:   PROJECT_ROOT,
    stdio: 'inherit',
    windowsHide: true,
    // surface non-zero exit as thrown error
  });
  const elapsed = Date.now() - t0;
  log(`DONE   ${stage.label} (${formatDuration(elapsed)})`);
}

async function main() {
  ensureLogsDir();

  log('='.repeat(72));
  log(`INA Tier 9 Pipeline Runner${isDryRun ? ' [DRY-RUN]' : ''}`);
  log(`Log file: ${logFile}`);
  log('='.repeat(72));

  const pipelineStart = Date.now();
  let failedStage     = null;

  for (const stage of STAGES) {
    try {
      runStage(stage);
    } catch (err) {
      failedStage = stage;
      log(`FAIL   ${stage.label}`);
      log(`ERROR  ${err.message}`);
      log('Pipeline halted, skipping remaining stages.');
      break;
    }
  }

  const totalElapsed = Date.now() - pipelineStart;
  const summary      = failedStage
    ? `FAILED at "${failedStage.label}" after ${formatDuration(totalElapsed)}`
    : `COMPLETED successfully in ${formatDuration(totalElapsed)}`;

  log('='.repeat(72));
  log(`Pipeline ${summary}`);
  log('='.repeat(72));

  // Telegram notification, always attempt, never throw
  const telegramMsg = isDryRun
    ? `[DRY-RUN] INA Tier 9 pipeline would have run ${STAGES.length} stages`
    : failedStage
      ? `INA Tier 9 pipeline FAILED: ${failedStage.label}, ${formatDuration(totalElapsed)} elapsed`
      : `INA Tier 9 pipeline DONE in ${formatDuration(totalElapsed)}`;

  sendTelegram(telegramMsg);

  process.exit(failedStage ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Entry, catch-all so the script itself never crashes
// ---------------------------------------------------------------------------

main().catch((err) => {
  try {
    log(`FATAL  Unhandled error in pipeline runner: ${err.message}`);
    log(err.stack ?? '(no stack)');
    sendTelegram(`INA Tier 9 pipeline FATAL error: ${err.message}`);
  } catch (_) {
    // truly last-resort, can't even log
    console.error('FATAL (unloggable):', err);
  }
  process.exit(1);
});
