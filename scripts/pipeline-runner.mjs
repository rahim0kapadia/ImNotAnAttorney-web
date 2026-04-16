#!/usr/bin/env node
/**
 * INA Tier 9 Pipeline Runner
 * Chains bulk-master-extractor → bulk-appeal-outcome-correlator (phases 1-4) → bulk-similar-case-matcher
 * Each stage runs sequentially with 8GB heap; never in parallel.
 *
 * Usage:
 *   node scripts/pipeline-runner.mjs
 *   node scripts/pipeline-runner.mjs --dry-run
 */

import { execSync } from 'child_process';
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
  {
    label: 'Stage 2a, appeal-outcome-correlator phase 1',
    cmd:   'node scripts/bulk-appeal-outcome-correlator.mjs --phase 1',
  },
  {
    label: 'Stage 2b, appeal-outcome-correlator phase 2',
    cmd:   'node scripts/bulk-appeal-outcome-correlator.mjs --phase 2',
  },
  {
    label: 'Stage 2c, appeal-outcome-correlator phase 3',
    cmd:   'node scripts/bulk-appeal-outcome-correlator.mjs --phase 3',
  },
  {
    label: 'Stage 2d, appeal-outcome-correlator phase 4 (apply)',
    cmd:   'node scripts/bulk-appeal-outcome-correlator.mjs --phase 4 --apply',
  },
  {
    label: 'Stage 3, bulk-similar-case-matcher',
    cmd:   'node --max-old-space-size=8192 scripts/bulk-similar-case-matcher.mjs --apply',
  },
];

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------

function sendTelegram(message) {
  try {
    execSync(
      `node "${TELEGRAM_SCRIPT}" --bot legal --message "${message.replace(/"/g, '\\"')}"`,
      { stdio: 'inherit', cwd: PROJECT_ROOT }
    );
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
  execSync(stage.cmd, {
    cwd:   PROJECT_ROOT,
    stdio: 'inherit',
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
