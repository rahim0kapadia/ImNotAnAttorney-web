import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client with service role key.
 * No cookies — use for webhooks, cron jobs, and background tasks.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
