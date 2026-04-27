#!/usr/bin/env node
// Write .qa-state/<slug>.json sidecars after running gates against MDX files.
// One-off helper for QA-gate-flagged untracked posts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { runHumanizerCheck } from '../../ImNotAnAttorney/blog-pipeline/gates/humanizer.mjs';
import { runAntiHallucinationStructural } from '../../ImNotAnAttorney/blog-pipeline/gates/qa-anti-hallucination-structural.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/write-sidecar-for-files.mjs <file1.mdx> [file2.mdx ...]');
  process.exit(2);
}

for (const f of files) {
  const abs = resolve(process.cwd(), f);
  const mdx = readFileSync(abs, 'utf8');
  const slug = basename(f, '.mdx');

  const ah = await runAntiHallucinationStructural(mdx, { slug });
  const h = runHumanizerCheck(mdx);

  // published_hash matches the producer's hash format (sha256 of body)
  const parsed = matter(mdx);
  const published_hash = createHash('md5').update(parsed.content).digest('hex');

  const sidecar = {
    slug,
    last_checked: new Date().toISOString(),
    all_passed: ah.passed && h.passed,
    gates: {
      humanizer: {
        passed: h.passed,
        status: 'checked',
        score: h.score,
        details: h.details,
      },
      anti_hallucination: {
        passed: ah.passed,
        status: 'checked',
        details: ah.details,
      },
    },
    published_hash,
  };

  const sidecarDir = join(dirname(abs), '.qa-state');
  if (!existsSync(sidecarDir)) mkdirSync(sidecarDir, { recursive: true });
  const sidecarPath = join(sidecarDir, slug + '.json');
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
  console.log('wrote ' + sidecarPath + ' (humanizer=' + (h.passed ? 'PASS' : 'FAIL') + ' anti_hallucination=' + (ah.passed ? 'PASS' : 'FAIL') + ')');
}
