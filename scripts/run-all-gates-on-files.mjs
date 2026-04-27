#!/usr/bin/env node
// Run ALL blog-destination gates on specific MDX files.
// Confirms full gate pass before commit.

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { runAllGates } from '../../ImNotAnAttorney/blog-pipeline/gates/run-all.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/run-all-gates-on-files.mjs <file1.mdx> [file2.mdx ...]');
  process.exit(2);
}

let anyFailed = false;
for (const f of files) {
  const abs = resolve(process.cwd(), f);
  const mdx = readFileSync(abs, 'utf8');
  const slug = basename(f, '.mdx');
  console.log('\n=== ' + f + ' (slug=' + slug + ') ===');
  const res = await runAllGates(mdx, { destination: 'blog', articleType: 'spoke', slug });
  console.log('Overall: ' + res.result);
  for (const [id, g] of Object.entries(res.gates)) {
    const icon = g.passed ? '[PASS]' : '[FAIL]';
    const score = g.score !== undefined ? ' score=' + g.score : '';
    console.log('  ' + icon + ' ' + id + score);
  }
  if (res.failures.length > 0) {
    console.log('  Failures:');
    for (const m of res.failures) console.log('    - ' + m);
  }
  if (res.advisoryWarnings.length > 0) {
    console.log('  Advisory warnings:');
    for (const m of res.advisoryWarnings) console.log('    - ' + m);
  }
  if (!res.passed) anyFailed = true;
}
process.exit(anyFailed ? 1 : 0);
