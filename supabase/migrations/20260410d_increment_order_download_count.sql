-- Atomic download counter for orders.
-- Eliminates the TOCTOU race in the download endpoint where a SELECT
-- followed by UPDATE(download_count = old + 1) drops increments under
-- concurrency. This RPC does a single atomic UPDATE ... + 1.

CREATE OR REPLACE FUNCTION increment_order_download_count(p_order_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE orders
  SET download_count = COALESCE(download_count, 0) + 1
  WHERE id = p_order_id;
$$;

REVOKE ALL ON FUNCTION increment_order_download_count(uuid) FROM public;
REVOKE ALL ON FUNCTION increment_order_download_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION increment_order_download_count(uuid) TO service_role;
