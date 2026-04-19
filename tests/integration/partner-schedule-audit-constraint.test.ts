/**
 * Integration test: end-to-end verify that the 20260417b CHECK-constraint
 * widening admits `schedule_denied_referral_mode` writes against a REAL
 * Supabase instance (not a chainable mock).
 *
 * Gated by SUPABASE_LOCAL so it stays inert in CI/dev. To run locally:
 *   SUPABASE_LOCAL=1 npx vitest run tests/integration/partner-schedule-audit-constraint.test.ts
 *
 * This is the safety net the unit test tests/api/partner-schedule-403.test.ts
 * cannot provide: the unit test mocks Supabase, so it cannot catch a CHECK
 * violation that fires at the real DB layer. If someone re-adds the original
 * CHECK constraint or drops the 20260417b migration, the unit test still
 * passes — but this one fails.
 *
 * Preconditions when running:
 *   - SUPABASE_LOCAL=1 in env
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY point at a project where
 *     migration 20260417b has been applied
 *   - partners and court_reminders tables exist
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";

const SUPABASE_LOCAL = Boolean(process.env.SUPABASE_LOCAL);

// Defer any real work unless the gate is on. Values below are only touched
// inside the guarded test body.
let createdPartnerId: string | null = null;
let createdReminderId: string | null = null;
let createdEventId: string | null = null;

async function makeAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required when SUPABASE_LOCAL=1");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

describe("partner_events CHECK constraint admits schedule_denied_referral_mode (integration)", () => {
  beforeAll(async () => {
    if (!SUPABASE_LOCAL) return;
  });

  afterAll(async () => {
    if (!SUPABASE_LOCAL) return;
    // Best-effort cleanup; ignore errors.
    try {
      const supabase = await makeAdminClient();
      if (createdEventId) await supabase.from("partner_events").delete().eq("id", createdEventId);
      if (createdReminderId) await supabase.from("court_reminders").delete().eq("id", createdReminderId);
      if (createdPartnerId) await supabase.from("partners").delete().eq("id", createdPartnerId);
    } catch {
      // swallow — test teardown, not assertion target
    }
  });

  test.skipIf(!SUPABASE_LOCAL)(
    "403 route's audit insert lands with event_type=schedule_denied_referral_mode",
    async () => {
      const supabase = await makeAdminClient();

      // 1. Create a referral-mode partner.
      const promoCode = `TEST_${Date.now().toString(36).toUpperCase()}`;
      const { data: partner, error: partnerErr } = await supabase
        .from("partners")
        .insert({
          name: "Integration Test Partner",
          email: `integ-${Date.now()}@example.test`,
          promo_code: promoCode,
          source: "generic",
          check_in_enabled: false,
        })
        .select("id")
        .single();
      expect(partnerErr).toBeNull();
      expect(partner).toBeDefined();
      createdPartnerId = partner!.id;

      // 2. Create a court_reminder owned by the partner.
      const { data: reminder, error: reminderErr } = await supabase
        .from("court_reminders")
        .insert({
          first_name: "Integ",
          email: `client-${Date.now()}@example.test`,
          partner_promo_code: promoCode,
          token: `tok_${Date.now()}`,
        })
        .select("id")
        .single();
      expect(reminderErr).toBeNull();
      expect(reminder).toBeDefined();
      createdReminderId = reminder!.id;

      // 3. Simulate the 403 route's audit insert directly. This is the
      //    smallest surface we can test; a full HTTP invocation would need a
      //    running Next.js server which is out of scope for this gated test.
      const { data: evt, error: evtErr } = await supabase
        .from("partner_events")
        .insert({
          partner_id: createdPartnerId,
          event_type: "schedule_denied_referral_mode",
          metadata: { client_id: createdReminderId, promo_code: promoCode },
        })
        .select("id")
        .single();
      expect(evtErr).toBeNull();
      expect(evt).toBeDefined();
      createdEventId = evt!.id;

      // 4. Assert the row is readable and the event_type round-trips.
      const { data: fetched } = await supabase
        .from("partner_events")
        .select("event_type, metadata")
        .eq("id", createdEventId)
        .single();
      expect(fetched?.event_type).toBe("schedule_denied_referral_mode");
      expect(fetched?.metadata).toMatchObject({ promo_code: promoCode });
    },
  );
});
