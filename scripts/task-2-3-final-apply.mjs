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
const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';

// Helper to apply SQL batches
async function applyBatch(statements, batchIndex, taskName) {
  const batch = statements.slice(batchIndex * 50, (batchIndex + 1) * 50);
  if (batch.length === 0) return 0;

  const query = batch.join('\n');
  const payload = { query };
  const postData = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${PROJECT_REF}/database/query`,
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
            if ((batchIndex + 1) % 10 === 0) {
              console.log(`  ${taskName} Batch ${batchIndex + 1}: ${batch.length} statements applied`);
            }
            resolve(batch.length);
          } else {
            console.error(`  ${taskName} Batch ${batchIndex + 1} failed:`, result.message || result);
            resolve(0);
          }
        } catch (e) {
          console.error(`  ${taskName} Batch ${batchIndex + 1} parse error:`, e.message);
          resolve(0);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`  ${taskName} Batch ${batchIndex + 1} error:`, e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Process a single task
async function processTask(taskName, sqlPath) {
  if (!fs.existsSync(sqlPath)) {
    console.log(`\n${taskName}: File not found, skipping.`);
    return 0;
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  const statements = sqlContent.trim().split('\n').filter(s => s.trim().length > 0);

  if (statements.length === 0) {
    console.log(`\n${taskName}: No statements to apply.`);
    return 0;
  }

  console.log(`\n${taskName}: Applying ${statements.length} statements...`);

  let totalApplied = 0;
  const numBatches = Math.ceil(statements.length / 50);

  for (let i = 0; i < numBatches; i++) {
    const applied = await applyBatch(statements, i, taskName);
    totalApplied += applied;

    // Delay between batches
    if (i < numBatches - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`${taskName}: Complete — ${totalApplied} rows applied`);
  return totalApplied;
}

// Run both tasks sequentially
(async () => {
  console.log('=== Sequential Data Push Operations ===\n');

  const task2Applied = await processTask('Task 2 (CAP Verification)', 'data/bulk-verify/verification-updates.sql');
  await new Promise(r => setTimeout(r, 2000)); // 2s delay between tasks

  const task3Applied = await processTask('Task 3 (CourtListener URLs)', 'data/bulk-verify/cl-verification-updates.sql');

  console.log('\n=== Summary ===');
  console.log(`Task 1 (Enrichment):    313 rows`);
  console.log(`Task 2 (CAP Verify):    ${task2Applied} rows`);
  console.log(`Task 3 (CL URLs):       ${task3Applied} rows`);
  console.log(`TOTAL:                  ${313 + task2Applied + task3Applied} rows updated`);

  process.exit(0);
})();
