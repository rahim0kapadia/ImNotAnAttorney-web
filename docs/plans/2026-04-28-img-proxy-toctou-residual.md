# Residual TOCTOU on /api/admin/img-proxy

Date opened: 2026-04-28
Owner: next session that adds `undici` as a direct dep on the monorepo
or upgrades to a Node version exposing `node:undici`.

## Status
- HIGH-LEVEL FIX in place: pre-resolve hostname via `dns.lookup` before
  fetch, reject if any A/AAAA is private/loopback/CGNAT/multicast/etc.
  Plus `redirect: "manual"` with full re-validation per hop.
- RESIDUAL: between `dns.lookup()` and Node's internal resolution at
  `fetch()` connect-time, a sub-millisecond DNS flip could swap a public
  IP for a private one (DNS rebinding TOCTOU).

## Why we left the gap
The audit-recommended fix (undici Agent with a `connect.lookup` callback
that re-validates at the same syscall as the connect) requires `undici`
as a direct dep on `apps/web` in the monorepo. Adding a new dep crossed
the bootstrap-mode universal rule for this session; and the residual
window is very narrow: same process, same DNS cache, same TTLs as the
re-resolution; attacker needs the resolver to flip between two requests
to the same hostname within the lookup→connect window.

## What to upgrade to
1. `pnpm add undici --filter './apps/web'`
2. Restore the `safeAgent` pattern from the original commit
   (https://github.com/rahim0kapadia/ImNotAnAttorney commit `868ff975`):
   ```ts
   import { Agent, fetch as undiciFetch } from "undici";
   const safeAgent = new Agent({
     connect: {
       lookup: (hostname, options, cb) => {
         dns.lookup(hostname, options, (err, address, family) => {
           if (err) return cb(err, "", 0);
           if (isIpBlocked(address)) return cb(new Error("blocked"), "", 0);
           cb(null, address, family);
         });
       },
     },
   });
   ```
3. Pass `dispatcher: safeAgent` to `undiciFetch`.

## Mitigations in place (defense-in-depth)
- All-records pre-resolution (rejects rebind setups whose primary record
  is public but secondary is private).
- `redirect: "manual"` prevents the easy 302→metadata bypass.
- Per-hop URL + hostname validation.
- Output content-type allowlist (no SVG, no HTML).
- 5MB streaming cap, 10s timeout.
- Auth gate: signed-URL HMAC means an unauth'd attacker can't even
  reach this code path with a chosen URL.
