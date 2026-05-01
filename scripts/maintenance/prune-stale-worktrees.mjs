#!/usr/bin/env node
// csv-bulk-checked: na — maintenance script, no data ingest
//
// Prune stale git worktrees that block future `git worktree add` calls.
//
// Background: agent-runtime sometimes leaves orphan worktree dirs under
// `.git/worktrees/` after the working tree is removed. `git worktree prune`
// catches most of these but fails on Windows when ACL/permission state
// blocks deletion (observed 2026-05-01: 4 entries failed with
// `Permission denied`). Plus the runtime's `isolation: "worktree"` mkdir
// can EEXIST when `.claude/worktrees` exists from prior runs.
//
// This script:
//   1. Runs `git worktree prune --verbose` (clears the easy ones).
//   2. Lists remaining `.git/worktrees/<name>/` entries.
//   3. For each, checks if the referenced worktree path actually exists.
//   4. If path is missing, force-removes the orphan entry by attempting
//      to delete the `.git/worktrees/<name>/` dir directly.
//   5. Reports anything still stuck (locked, permission-denied) for
//      manual review.
//
// Usage: node scripts/maintenance/prune-stale-worktrees.mjs [--dry-run]

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = process.cwd();
const WORKTREES_DIR = join(REPO_ROOT, '.git', 'worktrees');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

function step1_prune() {
  console.log('Step 1: git worktree prune --verbose');
  try {
    const out = sh('git worktree prune --verbose');
    if (out.trim()) console.log(out);
  } catch (err) {
    console.error('  prune partially failed:', err.message);
  }
}

function step2_listOrphans() {
  if (!existsSync(WORKTREES_DIR)) {
    console.log('Step 2: no .git/worktrees/ dir — nothing to scan');
    return [];
  }
  const entries = readdirSync(WORKTREES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  console.log(`Step 2: found ${entries.length} entries under .git/worktrees/`);

  const orphans = [];
  for (const name of entries) {
    const gitdirRefPath = join(WORKTREES_DIR, name, 'gitdir');
    if (!existsSync(gitdirRefPath)) {
      orphans.push({ name, reason: 'missing gitdir file' });
      continue;
    }
    const refPath = readFileSync(gitdirRefPath, 'utf8').trim();
    const wtPath = resolve(refPath, '..');
    if (!existsSync(wtPath)) {
      orphans.push({ name, reason: `worktree path missing: ${wtPath}` });
    }
  }
  return orphans;
}

function step3_forceRemove(orphans) {
  if (!orphans.length) {
    console.log('Step 3: no orphans to remove');
    return { removed: 0, stuck: [] };
  }
  console.log(`Step 3: ${orphans.length} orphan(s) to remove`);
  let removed = 0;
  const stuck = [];
  for (const { name, reason } of orphans) {
    const dir = join(WORKTREES_DIR, name);
    console.log(`  - ${name} (${reason})`);
    if (DRY_RUN) {
      console.log(`    [dry-run] would rm: ${dir}`);
      continue;
    }
    try {
      rmSync(dir, { recursive: true, force: true });
      removed += 1;
      console.log('    removed');
    } catch (err) {
      stuck.push({ name, dir, error: err.message });
      console.log(`    STUCK: ${err.message}`);
    }
  }
  return { removed, stuck };
}

function step4_reportClaudeWorktreesDir() {
  const claudeWtDir = join(REPO_ROOT, '.claude', 'worktrees');
  if (!existsSync(claudeWtDir)) {
    console.log('Step 4: no .claude/worktrees/ dir — clean');
    return;
  }
  const entries = readdirSync(claudeWtDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  if (!entries.length) {
    console.log('Step 4: .claude/worktrees/ is empty — clean');
    return;
  }
  console.log(`Step 4: .claude/worktrees/ has ${entries.length} agent dir(s):`);
  for (const name of entries) {
    const path = join(claudeWtDir, name);
    const gitInfoPath = join(path, '.git');
    const has = existsSync(gitInfoPath);
    console.log(`  - ${name} (${has ? 'live worktree' : 'stale dir; safe to rm'})`);
  }
  console.log('  (manual review — automated removal of these is risky;');
  console.log('   they may be live worktrees from in-flight agents)');
}

function main() {
  console.log(`prune-stale-worktrees.mjs ${DRY_RUN ? '(DRY-RUN)' : ''}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log('');

  step1_prune();
  console.log('');
  const orphans = step2_listOrphans();
  console.log('');
  const { removed, stuck } = step3_forceRemove(orphans);
  console.log('');
  step4_reportClaudeWorktreesDir();
  console.log('');

  console.log('--- summary ---');
  console.log(`orphans found: ${orphans.length}`);
  console.log(`orphans removed: ${removed}`);
  if (stuck.length) {
    console.log(`stuck (manual review): ${stuck.length}`);
    for (const s of stuck) console.log(`  - ${s.name}: ${s.error}`);
    process.exit(1);
  }
}

main();
