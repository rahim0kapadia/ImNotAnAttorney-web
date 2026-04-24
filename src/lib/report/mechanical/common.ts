/**
 * Shared helpers for the mechanical renderer.
 *
 * Slot markers use the form `{{SLOT:name}}` as a PLAIN-TEXT token that
 * HTML escapers leave untouched. In pure-mechanical mode today the
 * mechanical route replaces each token with a neutral placeholder
 * comment before write — the tokens existed originally for a Haiku-
 * per-slot orchestrator that was removed 2026-04-24 per the zero-
 * hallucination mandate. The slot-marker machinery is kept because
 * the future verified-opus renderer (mechanical data pull + source_urls
 * → Opus voice around pre-verified facts → operator approval) will
 * reuse the same pattern: deterministic skeleton + LLM-filled slots
 * where every cited fact is pre-verified.
 *
 * `assertNoSlotsRemain` is the invariant check — any unreplaced token
 * that reaches final HTML indicates a renderer bug, NOT a user-facing
 * placeholder, and must throw rather than ship.
 */

export type CaseDecoderIntake = {
  first_name: string | null;
  charge_type: string | null;
  state: string | null;
  jurisdiction_level: string | null;
  arrest_date: string | null;
  court_date: string | null;
  plea_offered: string | null;
  co_defendants: string | null;
  filled_out_by: string | null;
  situation: string | null;
  specific_question: string | null;
};

const SLOT_RX = /\{\{SLOT:([a-z0-9_-]+)\}\}/gi;

export function slotMarker(name: string): string {
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error(`[mechanical/common] invalid slot name: ${name}`);
  }
  return `{{SLOT:${name}}}`;
}

export function listSlotMarkers(html: string): string[] {
  const names: string[] = [];
  for (const m of html.matchAll(SLOT_RX)) names.push(m[1]);
  return names;
}

export function replaceSlot(html: string, name: string, value: string): string {
  const marker = slotMarker(name);
  // Split/join avoids regex escaping concerns in `name`.
  return html.split(marker).join(value);
}

export function assertNoSlotsRemain(html: string): void {
  const leftover = listSlotMarkers(html);
  if (leftover.length > 0) {
    throw new Error(
      `[mechanical/common] unreplaced slot markers in final HTML: ${leftover.join(", ")}`,
    );
  }
}

/**
 * Lightweight HTML escape for plain-text body content (NOT attributes).
 * Used when intake strings are inlined into the mechanical skeleton.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

/**
 * Wrap inline legal-reference text in the Phase 2 <cite> shell so the
 * existing entity-whitelist transformer can upgrade it to a badge OR
 * strip it at sanitize time if unverified.
 */
export function wrapCite(entityId: string, text: string): string {
  const eid = entityId.replace(/["<>&]/g, "");
  return `<cite data-entity-id="${eid}">${escapeHtml(text)}</cite>`;
}
