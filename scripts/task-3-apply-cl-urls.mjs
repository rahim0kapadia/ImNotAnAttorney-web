import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load SUPABASE_ACCESS_TOKEN from parent project env
const _envFile = fs.readFileSync(path.resolve(__dirname, '..', '..', 'ImNotAnAttorney', '.env.local'), 'utf8');
const _tokenLine = _envFile.split('\n').find(l => l.startsWith('SUPABASE_ACCESS_TOKEN='));
const SUPABASE_TOKEN = _tokenLine ? _tokenLine.slice(_tokenLine.indexOf('=') + 1).trim() : null;
if (!SUPABASE_TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN in ImNotAnAttorney/.env.local'); process.exit(1); }

// Check if pre-generated CL SQL file exists, otherwise run the bulk script first
const clSqlPath = 'data/bulk-verify/cl-verification-updates.sql';

let statements = [];

if (fs.existsSync(clSqlPath)) {
  console.log('Using pre-generated CL verification SQL...');
  const sqlContent = fs.readFileSync(clSqlPath, 'utf8');
  statements = sqlContent.trim().split('\n').filter(s => s.trim().length > 0);
} else {
  console.log('CL SQL file not found. Skipping Task 3.');
  process.exit(0);
}

console.log(`Task 3: Applying CourtListener URL verification to ${statements.length} rows`);

if (statements.length === 0) {
  console.log('No statements to apply.');
  process.exit(0);
}

// Apply in batches of 50
async function applyBatch(statements, batchIndex) {
  const batch = statements.slice(batchIndex * 50, (batchIndex + 1) * 50);
  if (batch.length === 0) return 0;

  const query = batch.join('\n');

  // Properly escape for JSON
  const payload = {
    query: query
  };
  const postData = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: '/v1/projects/jxjbjmgdukwkoclydqdr/database/query',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Batch ${batchIndex + 1}: ${batch.length} statements applied (HTTP ${res.statusCode})`);
            resolve(batch.length);
          } else {
            console.error(`Batch ${batchIndex + 1} failed (HTTP ${res.statusCode}):`, result.message || result);
            resolve(0);
          }
        } catch (e) {
          console.error(`Batch ${batchIndex + 1} parse error:`, e.message);
          resolve(0);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Batch ${batchIndex + 1} request error:`, e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Apply batches sequentially
(async () => {
  let totalApplied = 0;
  const numBatches = Math.ceil(statements.length / 50);

  for (let i = 0; i < numBatches; i++) {
    const applied = await applyBatch(statements, i);
    totalApplied += applied;
    // Small delay between batches to avoid rate limits
    if (i < numBatches - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nTask 3 Complete: ${totalApplied} CourtListener URL rows applied`);
  process.exit(0);
})();
