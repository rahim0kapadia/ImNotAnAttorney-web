import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const QA_DIR = 'content/blog/.qa-state';
const BLOG_DIR = 'content/blog';

const sidecars = fs.readdirSync(QA_DIR).filter(f => f.endsWith('.json'));
let updated = 0;

for (const file of sidecars) {
  const sidecarPath = path.join(QA_DIR, file);
  const slug = file.replace('.json', '');
  const mdxPath = path.join(BLOG_DIR, slug + '.mdx');

  if (!fs.existsSync(mdxPath)) {
    console.log(`SKIP: no MDX for ${slug}`);
    continue;
  }

  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  if (sidecar.published_hash) {
    console.log(`SKIP: ${slug} already has published_hash`);
    continue;
  }

  const mdxContent = fs.readFileSync(mdxPath, 'utf8');
  // MD5 for change detection only, not cryptographic. Used by editorial
  // flywheel to detect post-publish edits by comparing current hash vs stored.
  sidecar.published_hash = crypto.createHash('md5').update(mdxContent).digest('hex');
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
  updated++;
  console.log(`OK: ${slug} → ${sidecar.published_hash}`);
}

console.log(`\nDone. Updated ${updated}/${sidecars.length} sidecars.`);
