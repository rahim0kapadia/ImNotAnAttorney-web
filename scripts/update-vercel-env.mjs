#!/usr/bin/env node
// Update (or create) a single env var on the Vercel production project.
// Targets the production project prj_zqxNgG9xcM235bnKRoEgP5kBOEEr (imnotanattorney)
//, NOT the stale prj_fgx7OUbudHbS2WrfoaLKb07jJAnB (imnotanattorney-web) in .env.local.
//
// Usage:
//   node scripts/update-vercel-env.mjs <KEY> <VALUE>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const [key, value] = process.argv.slice(2);
if (!key || !value) {
  console.error("Usage: node scripts/update-vercel-env.mjs <KEY> <VALUE>");
  process.exit(1);
}

const env = loadEnv();
const projectFile = path.join(__dirname, "..", ".vercel", "project.json");
if (!fs.existsSync(projectFile)) {
  console.error("Missing .vercel/project.json, cannot determine project.");
  process.exit(1);
}
const { projectId, orgId } = JSON.parse(fs.readFileSync(projectFile, "utf8"));
const token = env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN missing from .env.local");
  process.exit(1);
}

console.log("Project:", projectId);
console.log("Team:", orgId);
console.log("Key:", key);

const base = `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${orgId}`;
const listUrl = `${base}&decrypt=false`;
const listResp = await fetch(listUrl, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!listResp.ok) {
  console.error("List env failed:", listResp.status, await listResp.text());
  process.exit(1);
}
const listBody = await listResp.json();
const existing = (listBody.envs || []).filter((e) => e.key === key);

console.log(`Existing entries for ${key}: ${existing.length}`);

// Delete any existing entries for production target (keep preview/dev intact).
for (const e of existing) {
  if (!e.target || !e.target.includes("production")) continue;
  const delUrl = `https://api.vercel.com/v9/projects/${projectId}/env/${e.id}?teamId=${orgId}`;
  const delResp = await fetch(delUrl, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (delResp.ok) {
    console.log(`  deleted id=${e.id} target=${JSON.stringify(e.target)}`);
  } else {
    console.error(`  delete failed for id=${e.id}:`, delResp.status, await delResp.text());
    process.exit(1);
  }
}

// Create new production entry.
const createUrl = `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${orgId}`;
const createResp = await fetch(createUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    key,
    value,
    type: "encrypted",
    target: ["production"],
  }),
});
if (!createResp.ok) {
  console.error("Create failed:", createResp.status, await createResp.text());
  process.exit(1);
}
const createBody = await createResp.json();
console.log("OK created production entry:");
console.log("  id:", createBody.created?.id || createBody.id);
console.log("  target:", createBody.created?.target || createBody.target);
console.log();
console.log("NOTE: takes effect on next deployment. Push to master or trigger redeploy.");
