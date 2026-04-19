/**
 * Shared helpers for partner API routes.
 * - Auth: cookie validation
 * - Pagination: PostgREST 1000-row cap safe queries
 * - Batched IN: URL-length safe .in() for large ID arrays
 */

import { NextRequest, NextResponse } from "next/server";
import { validatePartnerSession, PARTNER_SESSION_COOKIE } from "./partner-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Paginated query helper ───────────────────────────────────
// PostgREST silently caps at 1000 rows. This fetches all pages.

interface PaginatedQueryOptions {
  table: string;
  select: string;
  filters: Array<{ column: string; op: "eq" | "in"; value: unknown }>;
  order?: { column: string; ascending: boolean };
}

export async function paginatedQuery<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  opts: PaginatedQueryOptions
): Promise<{ data: T[]; errors: string[] }> {
  const results: T[] = [];
  const errors: string[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase.from(opts.table).select(opts.select);
    for (const f of opts.filters) {
      if (f.op === "eq") query = query.eq(f.column, f.value);
      else if (f.op === "in") query = query.in(f.column, f.value as string[]);
    }
    if (opts.order) query = query.order(opts.order.column, { ascending: opts.order.ascending });
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data: page, error } = await query;
    if (error) {
      errors.push(`[${opts.table}] offset=${offset}: ${error.message}`);
      break;
    }
    if (!page || page.length === 0) break;
    results.push(...(page as T[]));
    offset += PAGE_SIZE;
    if (page.length < PAGE_SIZE) break;
  }

  return { data: results, errors };
}

// ── Batched IN query ─────────────────────────────────────────
// PostgREST encodes .in() as URL query params. 200+ UUIDs exceed
// typical 8KB URL limits. Batch into chunks and merge.

const IN_BATCH_SIZE = 200;

export async function batchedInQuery<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  opts: { table: string; select: string; inColumn: string; ids: string[] }
): Promise<{ data: T[]; errors: string[] }> {
  const results: T[] = [];
  const errors: string[] = [];

  for (let i = 0; i < opts.ids.length; i += IN_BATCH_SIZE) {
    const chunk = opts.ids.slice(i, i + IN_BATCH_SIZE);
    const { data, errors: pageErrors } = await paginatedQuery<T>(supabase, {
      table: opts.table,
      select: opts.select,
      filters: [{ column: opts.inColumn, op: "in", value: chunk }],
    });
    results.push(...data);
    errors.push(...pageErrors);
  }

  return { data: results, errors };
}

export type PartnerData = NonNullable<Awaited<ReturnType<typeof validatePartnerSession>>>;

type AuthResult =
  | { partner: PartnerData; error: null }
  | { partner: null; error: NextResponse };

/**
 * Extracts and validates partner session from request cookie.
 * Returns `{ partner }` on success or `{ error: NextResponse }` on failure.
 */
export async function requirePartnerAuth(req: NextRequest): Promise<AuthResult> {
  const sessionToken = req.cookies.get(PARTNER_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { partner: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) {
    return { partner: null, error: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }

  return { partner, error: null };
}
