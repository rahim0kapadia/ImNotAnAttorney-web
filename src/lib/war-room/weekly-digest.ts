/**
 * War Room — Weekly digest body builder for the pairing-matrix delta.
 *
 * Plan: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md (T1, fix H).
 *
 * Cron route: /api/cron/war-room-weekly-digest.
 * Cadence: Mondays 13:00 UTC.
 * Recipient filter: orders.tier='war-room' AND status='delivered' AND
 *   refunded=false (filter applied in route handler, not here).
 * FROM: updates@imnotanattorney.com (transactional — verified paid customers).
 *
 * Delta computation depends on `judge_prosecutor_pairings.created_at`.
 * If the column does not exist (T0 schema check WARNs), the route handler
 * degrades to a baseline notification ("matrix is live, deltas resume once
 * a temporal column is added").
 */

import { escapeHtml } from "@/lib/email";
import type { PairingMatrixResult } from "./pairing-matrix";

export interface DigestDelta {
  /** Cells that appeared in the past 7 days (judge_prosecutor_pairings.created_at >= NOW() - 7d). */
  newCells: Array<{
    prosecutor_name: string;
    motion_type: string;
    grant_rate: number;
    sample_size: number;
  }>;
  /** Cells whose grant_rate moved by ≥ 5pp since last digest. */
  shiftedCells: Array<{
    prosecutor_name: string;
    motion_type: string;
    grant_rate: number;
    grant_rate_prior: number;
    sample_size: number;
  }>;
  /** True if the source table has no temporal column (route handler degrades). */
  noTemporalColumn: boolean;
}

export interface DigestEmailParams {
  caseId: string;
  judgeName: string;
  matrix: PairingMatrixResult;
  delta: DigestDelta;
  weekLabel: string;
  myCaseUrl: string;
  /**
   * Pre-rendered cross-corpus intelligence sections (closed-ecosystem,
   * bench fingerprint, officer-judge rates). Markdown string from
   * renderWarRoomCrossCorpusSections — caller converts to HTML-safe block.
   * Omit or pass null to skip the section.
   */
  crossCorpusSections?: string | null;
}

export function buildDigestSubject(params: { isBaseline: boolean; weekLabel: string }): string {
  if (params.isBaseline) {
    return `[War Room] First weekly pairing-matrix digest — ${params.weekLabel}`;
  }
  return `[War Room] Weekly pairing-matrix delta — ${params.weekLabel}`;
}

export function buildDigestHtml(params: DigestEmailParams): string {
  const { judgeName, matrix, delta, weekLabel, myCaseUrl, crossCorpusSections } = params;

  const isBaseline =
    delta.newCells.length === 0 &&
    delta.shiftedCells.length === 0 &&
    !delta.noTemporalColumn;

  const tempNote = delta.noTemporalColumn
    ? `<p style="font-size:13px;color:#777;border-left:3px solid #888;padding:6px 10px;background:#f5f5f5;">
        Delta tracking is not yet available for this dataset (the underlying
        table has no temporal column). The matrix below is the current snapshot.
        Weekly deltas will resume once the column is added.
      </p>`
    : "";

  const newBlock =
    delta.newCells.length > 0
      ? `<h3 style="color:#111;">New cells this week</h3>
         <ul>${delta.newCells
           .map((c) => {
             const rate = Math.round(c.grant_rate * 100);
             return `<li>${escapeHtml(c.prosecutor_name)} · ${escapeHtml(c.motion_type)}: ${rate}% (n=${c.sample_size})</li>`;
           })
           .join("")}</ul>`
      : "";

  const shiftedBlock =
    delta.shiftedCells.length > 0
      ? `<h3 style="color:#111;">Rate shifts ≥ 5pp</h3>
         <ul>${delta.shiftedCells
           .map((c) => {
             const now = Math.round(c.grant_rate * 100);
             const prior = Math.round(c.grant_rate_prior * 100);
             const direction = c.grant_rate > c.grant_rate_prior ? "up" : "down";
             return `<li>${escapeHtml(c.prosecutor_name)} · ${escapeHtml(c.motion_type)}: ${prior}% → ${now}% (${direction}, n=${c.sample_size})</li>`;
           })
           .join("")}</ul>`
      : "";

  const baselineBlock = isBaseline
    ? `<p>No new cells or significant shifts since last digest. Your full matrix
       is below for reference.</p>`
    : "";

  const matrixSummary = matrix.isEmpty
    ? `<p>The pairing matrix is still populating for ${escapeHtml(judgeName)}.
       Once enough motion outcomes are analyzed, this section will fill in.</p>`
    : `<p><strong>${matrix.cells.length}</strong> cells across
       <strong>${matrix.prosecutors.length}</strong> prosecutors and
       <strong>${matrix.motionTypes.length}</strong> motion types.</p>`;

  // Cross-corpus intelligence block — rendered as a <pre>-wrapped block to
  // preserve markdown structure in email clients that don't render markdown.
  const crossCorpusBlock = crossCorpusSections
    ? `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />
       <h2 style="color:#111;font-size:16px;">Cross-Corpus Intelligence</h2>
       <pre style="font-family:-apple-system,sans-serif;white-space:pre-wrap;font-size:13px;line-height:1.5;background:#fafafa;padding:12px;border-radius:4px;">${escapeHtml(crossCorpusSections)}</pre>`
    : "";

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;color:#111;background:#fff;margin:0;padding:24px;">
<div style="max-width:680px;margin:0 auto;">
  <h1 style="color:#F59E0B;font-size:22px;margin:0 0 4px;">War Room — pairing-matrix digest (${escapeHtml(weekLabel)})</h1>
  <p style="color:#555;font-style:italic;margin:0 0 16px;">Judge: ${escapeHtml(judgeName)}</p>
  ${tempNote}
  ${baselineBlock}
  ${newBlock}
  ${shiftedBlock}
  ${matrixSummary}
  ${crossCorpusBlock}
  <p style="margin-top:16px;">
    <a href="${escapeHtml(myCaseUrl)}" style="color:#F59E0B;font-weight:bold;">View the full matrix in your portal →</a>
  </p>
  <p style="font-size:12px;color:#777;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">
    This report provides legal INFORMATION — not legal ADVICE. The data shows
    grant rates and sample sizes from the public motion record; your attorney
    remains the final authority on strategy decisions.
  </p>
</div>
</body></html>`;
}
