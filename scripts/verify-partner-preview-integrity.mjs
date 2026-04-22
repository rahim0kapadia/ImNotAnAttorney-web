#!/usr/bin/env node
/**
 * CV probe: partner preview link integrity (INNA-H12).
 *
 * Validates that the top-3 active partners (by total_referrals) serve a
 * working OG image on imnotanattorney.com. Detects silent breakages in
 * CDN / Supabase storage / the opengraph-image route that partners
 * would otherwise only notice when their shared links render blank in
 * iMessage/FB/Slack.
 *
 * Contract for each probed partner:
 *   - GET https://imnotanattorney.com/r/{CODE}/opengraph-image
 *   - Status 200
 *   - Content-Type matches image/png
 *   - Body byteLength > 10KB
 *
 * Output: JSON-lines, one line per probe result. Exits 0 if all pass,
 * 1 if any fail. Intended to be wired into
 *   ~/projects/continuous-verification/verify.mjs as hypothesis H12.
 *
 * Usage:
 *   node scripts/verify-partner-preview-integrity.mjs
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL        supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY       service role key (bypasses RLS)
 *
 * Optional:
 *   INNA_H12_BASE_URL               override https://imnotanattorney.com
 *   INNA_H12_MIN_BYTES              override 10240 byte floor
 *   INNA_H12_TIMEOUT_MS             override 10000ms fetch timeout
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from repo root if present  allows local runs without
// having to pre-export. Silently no-ops if the file is absent.
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.INNA_H12_BASE_URL || "https://imnotanattorney.com";
const MIN_BYTES = Number(process.env.INNA_H12_MIN_BYTES) || 10 * 1024;
const TIMEOUT_MS = Number(process.env.INNA_H12_TIMEOUT_MS) || 10_000;

function emit(result) {
  // JSON-lines  each result is its own line, aggregator-friendly.
  console.log(JSON.stringify(result));
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  emit({
    hypothesis: "INNA-H12",
    status: "ERROR",
    reason: "missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  });
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Fetch the top-3 approved partners by total_referrals. Ties broken by
 * promo_code alphabetically (deterministic). Partners with 0 referrals
 * still count  a brand-new partner's preview should also work.
 */
async function fetchTopPartners() {
  const { data, error } = await sb
    .from("partners")
    .select("promo_code, name, total_referrals")
    .eq("status", "approved")
    .not("promo_code", "is", null)
    .order("total_referrals", { ascending: false })
    .order("promo_code", { ascending: true })
    .limit(3);

  if (error) throw new Error(`supabase query failed: ${error.message}`);
  return data ?? [];
}

async function probePartner(partner) {
  const code = (partner.promo_code ?? "").toUpperCase();
  const url = `${BASE_URL}/r/${code}/opengraph-image`;
  const start = Date.now();

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    const status = res.status;
    const contentType = res.headers.get("content-type") || "";

    if (status !== 200) {
      return {
        hypothesis: "INNA-H12",
        status: "FAIL",
        partner_code: code,
        partner_name: partner.name,
        reason: `status ${status} (expected 200)`,
        url,
        latency_ms: Date.now() - start,
      };
    }

    if (!/image\/png/i.test(contentType)) {
      return {
        hypothesis: "INNA-H12",
        status: "FAIL",
        partner_code: code,
        partner_name: partner.name,
        reason: `content-type "${contentType}" (expected image/png)`,
        url,
        latency_ms: Date.now() - start,
      };
    }

    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    if (bytes < MIN_BYTES) {
      return {
        hypothesis: "INNA-H12",
        status: "FAIL",
        partner_code: code,
        partner_name: partner.name,
        reason: `body ${bytes} bytes (expected > ${MIN_BYTES})`,
        url,
        latency_ms: Date.now() - start,
      };
    }

    return {
      hypothesis: "INNA-H12",
      status: "PASS",
      partner_code: code,
      partner_name: partner.name,
      bytes,
      url,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    const reason = err?.name === "AbortError"
      ? `fetch timeout after ${TIMEOUT_MS}ms`
      : `fetch error: ${err?.message ?? err}`;
    return {
      hypothesis: "INNA-H12",
      status: "FAIL",
      partner_code: code,
      partner_name: partner.name,
      reason,
      url,
      latency_ms: Date.now() - start,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  let partners;
  try {
    partners = await fetchTopPartners();
  } catch (err) {
    emit({
      hypothesis: "INNA-H12",
      status: "ERROR",
      reason: err?.message ?? String(err),
    });
    process.exit(1);
  }

  if (partners.length === 0) {
    emit({
      hypothesis: "INNA-H12",
      status: "SKIP",
      reason: "no approved partners with promo_code found",
    });
    process.exit(0);
  }

  const results = await Promise.all(partners.map(probePartner));
  for (const r of results) emit(r);

  const anyFail = results.some((r) => r.status !== "PASS");
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  emit({
    hypothesis: "INNA-H12",
    status: "ERROR",
    reason: err?.message ?? String(err),
  });
  process.exit(1);
});
