/**
 * @fileoverview Supabase admin client factory with service role key.
 *
 * This is the ONLY Supabase client used in this project. There is no
 * client-side (anon key) Supabase client because:
 *   - All data operations happen in API routes (server-side only)
 *   - The service role key bypasses Row-Level Security (RLS), which is
 *     appropriate because all access is authenticated at the API layer
 *     (Stripe webhooks, operator auth, etc.), not via Supabase Auth
 *   - The anon key would require RLS policies we don't need
 *
 * The client is created via a factory function (not a module-level singleton)
 * because:
 *   - It allows env vars to be validated at call time with descriptive errors
 *   - It avoids module-load crashes in environments where env vars aren't set
 *     (e.g., build time, test environments)
 *
 * SECURITY NOTE: The service role key has FULL database access (bypasses RLS).
 * Never expose it to the client. This module should only be imported in:
 *   - API routes (src/app/api/...)
 *   - Server actions
 *   - Cron jobs
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client authenticated with the service role key.
 *
 * This client has full database access (bypasses RLS) and should only
 * be used in server-side contexts: API routes, webhooks, cron jobs.
 *
 * Auth options are explicitly disabled (no token refresh, no session
 * persistence) because the service role key does not use Supabase Auth —
 * it authenticates directly as a privileged database user.
 *
 * Env var checks throw descriptive errors instead of using TypeScript's
 * non-null assertion (`!`), which would produce unhelpful "Cannot read
 * properties of undefined" errors at runtime.
 *
 * @returns An initialized Supabase client with service role privileges.
 * @throws {Error} If NEXT_PUBLIC_SUPABASE_URL is not set.
 * @throws {Error} If SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var");
  }
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
