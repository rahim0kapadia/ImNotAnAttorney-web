# Worry: Supabase pooler TLS pinning (deferred from schema-cleanup-vestigials R0)

Date created: 2026-05-01
Source: schema-cleanup-vestigials R0 swarm — security-auditor `tls-cert-validation-disabled` (A02:2021).
Status: DEFERRED — re-evaluate 2026-07-29 (90 days).

## Worry

Every direct-Postgres script in this codebase connects to Supabase pooler with
`ssl: { rejectUnauthorized: false }`. This disables Postgres TLS server certificate
validation. Connection becomes opportunistically encrypted but vulnerable to MITM:
any party able to terminate TLS to the Supabase host can read service-role auth
packet + table contents.

Pattern is repo-wide (~60+ scripts in `apps/web/scripts/`). Each new audit/loader
script propagates the weakness.

## Why deferred from schema-cleanup-vestigials

R0 security-auditor recommended `rejectUnauthorized: true` claiming "Supabase pooler
uses public CA-issued cert — full validation is achievable without extra setup."
Empirical test 2026-04-30:

```
Error: self-signed certificate in certificate chain
    at TLSSocket.onConnectSecure
    code: 'SELF_SIGNED_CERT_IN_CHAIN'
```

Supabase's pooler (Supavisor on Cloudflare-fronted endpoint) presents a cert chain
that is NOT in Node's default CA bundle. Without a pinnable CA cert from Supabase
this is irreducible without:
1. (a) Pinning a custom CA via `ssl: { ca: fs.readFileSync(...) }` — Supabase doesn't
   publicly publish this CA cert, would need to extract from a successful connection
   AND re-extract on rotation.
2. (b) Switching connection mode (e.g., direct `db.<ref>.supabase.co:5432` instead of
   pooler) — also Cloudflare-fronted, same issue.
3. (c) Patching Node's CA bundle globally via `NODE_EXTRA_CA_CERTS` env — works but
   requires distributing the cert to every dev machine + CI runner + Vercel build env.

Cross-repo fix scope: all direct-pg scripts (audit + loader + cron). Cannot fit in
schema-cleanup-vestigials worry's scope.

## Mitigations in place (residual risk acceptance)

- `SUPABASE_DB_URL` lives in `.env.local` (gitignored); never on CLI.
- Service-role key in env, never logged.
- Connection only originates from trusted dev workstation / Fly machines with
  controlled network paths.
- Pooler endpoint `pooler.supabase.com` resolves through Cloudflare — encrypted
  even without our validation; MITM requires CDN compromise OR DNS hijack on
  trusted networks.

## Re-evaluation triggers

Trigger one or more of these → re-open worry, propose pinning solution:
- Supabase publishes a pinnable CA cert (check `supabase.com/docs/guides/database`
  + their changelog every quarter).
- Cloudflare publishes a CA bundle suitable for Node `--use-system-ca`.
- An incident occurs (MITM attempt detected, suspect cert chain change).

## Re-evaluation date

2026-07-29 (90 days from 2026-04-30).

## Owner

ImNotAnAttorney monorepo / shared-DB hygiene.

## Cascade

- Us: defense-in-depth on every Supabase script.
- Direct counterparty: tighter trust contract.
- Future-us: when Supabase ships pinnable CA, ONE cross-repo sweep replaces the pattern everywhere.
- Ecosystem: pattern publishable for any Supabase + Node user.
- No node loses.
