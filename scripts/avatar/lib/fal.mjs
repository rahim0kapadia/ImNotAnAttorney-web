// fal.ai client wrapper for the INAA avatar pipeline.
// Reads FAL_KEY from .env.local (loaded via dotenv).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.mjs";

// Minimal dotenv loader — avoids adding a dependency for one env var.
function loadEnvLocal() {
  const path = join(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue; // don't override existing
    // Strip surrounding quotes if present
    const val = rawVal.replace(/^["'](.*)["']$/, "$1");
    process.env[key] = val;
  }
}

loadEnvLocal();

export const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  throw new Error("FAL_KEY not set. Add it to .env.local — see .env.example for format.");
}

const FAL_BASE = "https://queue.fal.run";
const FAL_REST = "https://rest.alpha.fal.ai";

/**
 * Upload a local file to fal.ai storage and return the CDN URL.
 * Used to pass image/audio inputs by reference rather than base64-inlining.
 */
export async function uploadFile(filePath, contentType) {
  const bytes = readFileSync(filePath);
  // Step 1: initiate upload
  const initResp = await fetch(`${FAL_REST}/storage/upload/initiate`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content_type: contentType,
      file_name: filePath.split(/[\\/]/).pop(),
    }),
  });
  if (!initResp.ok) {
    const err = await initResp.text();
    throw new Error(`fal upload init failed: HTTP ${initResp.status} ${err.slice(0, 300)}`);
  }
  const { upload_url, file_url } = await initResp.json();

  // Step 2: PUT the bytes
  const putResp = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (!putResp.ok) {
    const err = await putResp.text();
    throw new Error(`fal upload put failed: HTTP ${putResp.status} ${err.slice(0, 300)}`);
  }
  return file_url;
}

/**
 * Submit an inference job to a fal.ai model endpoint. Returns the job result.
 * Uses the queue API with polling so we don't hold a long connection.
 */
export async function runModel(modelEndpoint, payload, { pollIntervalMs = 3000, maxWaitMs = 600_000 } = {}) {
  // Submit
  const submitResp = await fetch(`${FAL_BASE}/${modelEndpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`fal submit failed: HTTP ${submitResp.status} ${err.slice(0, 500)}`);
  }
  const { request_id, status_url, response_url } = await submitResp.json();
  if (!request_id) throw new Error(`fal submit missing request_id: ${JSON.stringify(submitResp)}`);

  // Poll until done
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const statusResp = await fetch(status_url, {
      headers: { "Authorization": `Key ${FAL_KEY}` },
    });
    if (!statusResp.ok) continue;
    const status = await statusResp.json();
    if (status.status === "COMPLETED") {
      const resultResp = await fetch(response_url, {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });
      if (!resultResp.ok) throw new Error(`fal result fetch failed: ${resultResp.status}`);
      return await resultResp.json();
    }
    if (status.status === "FAILED") {
      throw new Error(`fal job failed: ${JSON.stringify(status).slice(0, 500)}`);
    }
    // else IN_QUEUE or IN_PROGRESS — keep polling
  }
  throw new Error(`fal job timed out after ${maxWaitMs}ms`);
}
