-- 20260419b: partner_peer_benchmark RPC for dashboard peer-comparison block.
--
-- Plan: docs/plans/2026-04-19-session-a-dashboard-structural.md (Step 3, item #14)
-- Master plan: docs/plans/2026-04-19-bondsman-referral-audit-master.md item #14
--
-- Returns a jsonb payload comparing one bondsman partner's 30-day delivery
-- volume and active-client count against the median of all eligible peers.
-- Eligibility: partners.source='bondsman' AND >= 3 successful court_reminder
-- SMS sends in last 30 days (so inactive accounts don't dilute the median).
--
-- percentile_cont gives a continuous median. my_rank_percentile is the
-- percentile_rank of this partner's 30d count within the eligible peer set.

BEGIN;

CREATE OR REPLACE FUNCTION public.partner_peer_benchmark(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_reminders_30d        int;
  v_my_active_clients       int;
  v_peer_count              int;
  v_peer_median_reminders   numeric;
  v_peer_median_active      numeric;
  v_my_rank_percentile      numeric;
BEGIN
  -- This partner's 30d reminder count
  SELECT COUNT(*) INTO v_my_reminders_30d
  FROM sms_log
  WHERE partner_id = p_partner_id
    AND category = 'court_reminder'
    AND success = true
    AND created_at >= now() - interval '30 days';

  -- This partner's active-client count
  SELECT COUNT(*) INTO v_my_active_clients
  FROM court_reminders cr
  JOIN partners p ON p.promo_code = cr.partner_promo_code
  WHERE p.id = p_partner_id
    AND cr.status = 'active';

  -- Per-peer 30d reminder counts for eligible bondsman partners
  WITH peer_counts AS (
    SELECT
      p.id AS partner_id,
      COUNT(sl.id) FILTER (
        WHERE sl.category = 'court_reminder'
          AND sl.success = true
          AND sl.created_at >= now() - interval '30 days'
      ) AS reminders_30d,
      (
        SELECT COUNT(*)
        FROM court_reminders cr
        WHERE cr.partner_promo_code = p.promo_code
          AND cr.status = 'active'
      ) AS active_clients
    FROM partners p
    LEFT JOIN sms_log sl ON sl.partner_id = p.id
    WHERE p.source = 'bondsman'
      AND p.status = 'approved'
    GROUP BY p.id, p.promo_code
  ),
  eligible AS (
    SELECT * FROM peer_counts WHERE reminders_30d >= 3
  )
  SELECT
    COUNT(*),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY reminders_30d),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY active_clients),
    CASE
      WHEN COUNT(*) <= 1 THEN NULL
      ELSE 100.0 * (
        SELECT COUNT(*) FROM eligible e2
        WHERE e2.reminders_30d <= v_my_reminders_30d
      )::numeric / NULLIF(COUNT(*), 0)
    END
  INTO v_peer_count, v_peer_median_reminders, v_peer_median_active, v_my_rank_percentile
  FROM eligible;

  RETURN jsonb_build_object(
    'my_reminders_30d',          COALESCE(v_my_reminders_30d, 0),
    'my_active_clients',         COALESCE(v_my_active_clients, 0),
    'peer_median_reminders_30d', COALESCE(v_peer_median_reminders, 0),
    'peer_median_active_clients',COALESCE(v_peer_median_active, 0),
    'my_rank_percentile',        v_my_rank_percentile,
    'peer_count',                COALESCE(v_peer_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.partner_peer_benchmark(uuid) IS
  'Dashboard peer benchmark for a bondsman partner. Eligibility for median: source=bondsman, status=approved, >=3 successful court_reminder sms_log rows in last 30 days. Returns jsonb with my + median + rank percentile.';

REVOKE ALL ON FUNCTION public.partner_peer_benchmark(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_peer_benchmark(uuid) TO authenticated, service_role;

COMMIT;
