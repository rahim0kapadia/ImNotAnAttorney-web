# INAA self-host on Netcup RS — runbook

Simplest reliable stack: **Netcup RS 1000 G12 (Manassas, US) → Docker Compose → Caddy (auto-HTTPS) → Next.js standalone.** Cloudflare (free) added last, non-blocking.

## Phase 0 — Order the box (operator; the only long-pole gate)
- Netcup → **Root Server RS 1000 G12**, location **Manassas (USA)**, OS **Ubuntu 24.04 LTS**.
  - RS line (dedicated cores), NOT the VPS line.
- After provisioning you get: **IP + root password** (or add an SSH key). Hand those over.
- New accounts sometimes hit ID verification — that's the one thing that can push us past today.

## Phase 1 — Provision (me, ~15 min, once I have root SSH)
```bash
ssh root@<IP>
# Docker
curl -fsSL https://get.docker.com | sh
# App
git clone -b feat/self-host-netcup <repo-url> /opt/inaa && cd /opt/inaa
# Secrets: copy the 43 vars from local .env.local -> /opt/inaa/.env  (I scp this)
chmod +x deploy.sh
./deploy.sh          # builds standalone image + starts app + Caddy
```

## Phase 2 — Verify before any DNS change (me)
- Test on the box IP first: `curl -H 'Host: imnotanattorney.com' http://<IP>` → expect the app HTML.
- Fix build/env issues here, with the domain still safely on Vercel (zero user impact).

## Phase 3 — Cutover (operator gives DNS access; me flips)
1. At the domain's DNS: point `imnotanattorney.com` + `www` **A record → <IP>**.
2. Caddy auto-issues the Let's Encrypt cert on first hit. Verify `https://imnotanattorney.com`.
3. Re-point the ~6 cron routes (cron-job.org) at the new host (same paths, new domain resolves to box).

## Phase 4 — Cloudflare shield (free, same-day or next; non-blocking)
- Add the domain to Cloudflare (free), proxy the A record (orange cloud).
- Gives CDN cache + DDoS/bill-proofing. Caddy still terminates origin TLS.

## Redeploy, forever
`ssh root@<IP> 'cd /opt/inaa && ./deploy.sh'` — git pull + rebuild + prune. That's it.

## Add another site (e.g. taste-drop)
- Uncomment its service in `docker-compose.yml` + block in `Caddyfile`, put its `.env` on the box, `./deploy.sh`.

## Follow-up (not today)
- The `cron/*` engine jobs (blog-gen, demand-score) run fine on the RS's 4 dedicated cores. If they ever
  compete with serving, move them to the existing Fly `inaa-engine` — tracked separately, not on today's path.
