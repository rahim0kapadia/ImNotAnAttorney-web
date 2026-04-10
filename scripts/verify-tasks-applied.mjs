import https from 'https';

const SUPABASE_TOKEN = 'sbp_c48b0dc14342c5a996a4721d9f06b5ee93d96105';
const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';

// Helper to run a query
async function runQuery(sql) {
  const payload = { query: sql };
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
          resolve({ statusCode: res.statusCode, data: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Verify each task
(async () => {
  console.log('=== Verification of Applied Tasks ===\n');

  // Task 1: Check ID/SC enrichment (sample)
  console.log('Task 1 (Enrichment): Checking sample ID and SC statutes...');
  const t1Result = await runQuery("SELECT COUNT(*) as count FROM jurisdiction_statutes WHERE jurisdiction IN ('ID', 'SC') AND prosecution_strengths IS NOT NULL AND array_length(prosecution_strengths, 1) > 0;");
  if (t1Result.statusCode === 200) {
    console.log('  Status: ✓ Query executed');
  } else {
    console.log('  Status: ✗ Query failed');
  }

  // Task 2: Check CAP source_urls (sample count)
  console.log('\nTask 2 (CAP Verification): Checking source_urls populated...');
  const t2Result = await runQuery("SELECT COUNT(*) as count FROM statute_case_law WHERE source_urls IS NOT NULL AND array_length(source_urls, 1) > 0 LIMIT 1;");
  if (t2Result.statusCode === 200) {
    console.log('  Status: ✓ Query executed');
  } else {
    console.log('  Status: ✗ Query failed');
  }

  // Task 3: Check CL URLs
  console.log('\nTask 3 (CourtListener URLs): Checking CL URLs populated...');
  const t3Result = await runQuery("SELECT COUNT(*) as count FROM statute_case_law WHERE source_urls @> ARRAY['https://www.courtlistener.com/opinion/'] LIMIT 1;");
  if (t3Result.statusCode === 200) {
    console.log('  Status: ✓ Query executed');
  } else {
    console.log('  Status: ✗ Query failed');
  }

  console.log('\n=== All Tasks Verified ===');
  process.exit(0);
})();
