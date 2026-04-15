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

// Load enrichment data
const idEnrichment = JSON.parse(fs.readFileSync('data/charge-taxonomy/enrichment/ID.json', 'utf8'));
const scEnrichment = JSON.parse(fs.readFileSync('data/charge-taxonomy/enrichment/SC.json', 'utf8'));

// Helper to escape SQL string literals (single quote doubling)
function escapeSql(str) {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

// Build SQL statements - using ARRAY constructor with proper quoting
function buildUpdateStatements(enrichment, jurisdiction) {
  const statements = [];

  for (const entry of enrichment) {
    const slug = entry.common_charge_slug;
    const prosecutionStrengths = entry.prosecution_strengths || [];
    const defenseOpportunities = entry.defense_opportunities || [];
    const commonDefenses = entry.common_defenses || [];

    // Format as ARRAY constructor with proper SQL escaping
    const psStrengths = 'ARRAY[' + prosecutionStrengths.map(s => `'${escapeSql(s)}'`).join(',') + ']';
    const psOpportunities = 'ARRAY[' + defenseOpportunities.map(o => `'${escapeSql(o)}'`).join(',') + ']';
    const psDefenses = 'ARRAY[' + commonDefenses.map(d => `'${escapeSql(d)}'`).join(',') + ']';

    const sql = `UPDATE jurisdiction_statutes SET prosecution_strengths = ${psStrengths}::text[], defense_opportunities = ${psOpportunities}::text[], common_defenses = ${psDefenses}::text[] WHERE common_charge_slug = '${escapeSql(slug)}' AND jurisdiction = '${jurisdiction}';`;

    statements.push(sql);
  }

  return statements;
}

const idStatements = buildUpdateStatements(idEnrichment, 'ID');
const scStatements = buildUpdateStatements(scEnrichment, 'SC');
const allStatements = [...idStatements, ...scStatements];

console.log(`Generated ${idStatements.length} statements for ID, ${scStatements.length} for SC`);
console.log(`Total: ${allStatements.length} statements`);

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
            console.error(`Batch ${batchIndex + 1} failed (HTTP ${res.statusCode}):`, result);
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
  const numBatches = Math.ceil(allStatements.length / 50);

  for (let i = 0; i < numBatches; i++) {
    const applied = await applyBatch(allStatements, i);
    totalApplied += applied;
    // Small delay between batches to avoid rate limits
    if (i < numBatches - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nTask 1 Complete: ${totalApplied} SQL statements applied`);
  process.exit(0);
})();
