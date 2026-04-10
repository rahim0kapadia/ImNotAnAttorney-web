import fs from 'fs';
import https from 'https';

// Read the pre-generated verification SQL
const sqlPath = 'data/bulk-verify/verification-updates.sql';
const sqlContent = fs.readFileSync(sqlPath, 'utf8');
const statements = sqlContent.trim().split('\n').filter(s => s.trim().length > 0);

console.log(`Task 2: Applying CAP verification to ${statements.length} rows`);

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
        'Authorization': `Bearer sbp_c48b0dc14342c5a996a4721d9f06b5ee93d96105`,
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

  console.log(`\nTask 2 Complete: ${totalApplied} CAP verification rows applied`);
  process.exit(0);
})();
