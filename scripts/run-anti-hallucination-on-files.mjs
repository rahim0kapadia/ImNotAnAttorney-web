#!/usr/bin/env node
// Run anti-hallucination structural gate on specific MDX files.
// One-off helper for QA-gate-flagged untracked posts.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAntiHallucinationStructural } from '../../ImNotAnAttorney/blog-pipeline/gates/qa-anti-hallucination-structural.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/run-anti-hallucination-on-files.mjs <file1.mdx> [file2.mdx ...]');
  process.exit(2);
}

let anyFailed = false;
for (const f of files) {
  const abs = resolve(process.cwd(), f);
  const mdx = readFileSync(abs, 'utf8');
  console.log('\n=== ' + f + ' ===');
  const res = await runAntiHallucinationStructural(mdx, { slug: f });
  console.log('Overall: ' + res.result + ' (' + res.details.checks_passed + '/' + res.details.checks_total + ')');
  for (const r of res.details.results) {
    const icon = r.result === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log('  ' + icon + ' ' + r.check + ': ' + r.evidence);
  }
  if (!res.passed) anyFailed = true;
}
process.exit(anyFailed ? 1 : 0);
