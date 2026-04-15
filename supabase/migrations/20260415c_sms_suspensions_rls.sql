-- Lock down sms_suspensions against anon/authenticated REST access.
-- Table contains bounce-classified phone PII that only the service-role backend
-- needs to read/write (webhook handler + sendSMS pre-flight).
-- No policies = service_role bypasses RLS = table locked from public schema.

ALTER TABLE sms_suspensions ENABLE ROW LEVEL SECURITY;
