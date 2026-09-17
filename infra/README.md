# DigiPuls on the VPS — runbook

DigiPuls runs on the Lappsus VPS (Hostinger KVM, Ubuntu 24.04, Germany) as its
own Docker Compose project beside the Lappsus stack. This is the runbook; the
reasons are in `DEPLOYMENT.md`.

| | |
|---|---|
| Checkout | `/srv/digipuls` (the public GitHub repository, `main`) |
| Secrets | `/srv/digipuls/.env`, mode 600, never in git |
| Services | `digipuls` (the Node app), `mariadb` (MariaDB 11.8), `backup` |
| Public address | `https://digipuls.lappsus.com`, through the Lappsus Caddy |
| Evidence files | Docker volume `digipuls_evidence`, mounted at `/data/evidence` |
| Backups | `/var/backups/digipuls`, nightly, 14 days |
| Deploys | `infra/poll.sh` from cron, every minute: runs `infra/deploy.sh` when `main` moves |

## How a request arrives

The Lappsus Caddy owns ports 80 and 443 for every site on the box. It joins the
external Docker network `edge`, as does the DigiPuls app (alias `digipuls-app`;
the service is named `digipuls` because Lappsus Ops is already `app` on that network),
and its `digipuls.lappsus.com` block proxies to `digipuls-app:3000`. The route
lives in the Lappsus repository, `infra/caddy/Caddyfile`, and changes only
through that repository's deploy.

The app is also published on `127.0.0.1:3100` and the database on
`127.0.0.1:3307`: loopback only, for the deploy check and for SSH tunnels.

## First setup (done once)

```bash
docker network create edge
sudo mkdir -p /var/backups/digipuls && sudo chown lappsus:lappsus /var/backups/digipuls
git clone https://github.com/nudoarmetudor/digipuls.git /srv/digipuls
cd /srv/digipuls
# .env with DB_PASSWORD, DB_ROOT_PASSWORD, SESSION_SECRET (long random values)
chmod 600 .env
docker compose --env-file .env -f infra/compose.yml up -d --build
( crontab -l 2>/dev/null; echo '* * * * * /srv/digipuls/infra/poll.sh >> /home/lappsus/digipuls-deploy.log 2>&1' ) | crontab -
```

## Everyday

```bash
cd /srv/digipuls
COMPOSE="docker compose --env-file .env -f infra/compose.yml"
$COMPOSE ps
$COMPOSE logs --tail 100 digipuls
tail -50 ~/digipuls-deploy.log          # what the poller deployed
curl -s http://127.0.0.1:3100/healthz   # {"ok":true}
```

## Read-only switch

Stops every change while pages stay readable (`src/services/readOnly.js`).
Takes effect within 15 seconds; no restart.

```bash
$COMPOSE exec -T mariadb mariadb -u digipuls -p"$(grep ^DB_PASSWORD= .env | cut -d= -f2-)" digipuls -e \
  "INSERT INTO AppSetting (\`key\`, value, updatedAt) VALUES ('read_only','true',NOW(3))
   ON DUPLICATE KEY UPDATE value='true', updatedAt=NOW(3);"
# and 'false' to switch it off again
```

## Restore — practise once before it is needed

```bash
# database, into the running stack
gunzip -c /var/backups/digipuls/digipuls-<stamp>.sql.gz \
  | $COMPOSE exec -T mariadb mariadb -u digipuls -p"$DB_PASSWORD" digipuls
# evidence files
docker run --rm -v digipuls_evidence:/evidence -v /var/backups/digipuls:/b alpine \
  sh -c 'cd /evidence && tar -xzf /b/evidence-<stamp>.tar.gz'
```

## Not done yet

- **Off-box copies.** Backups stay on the VPS. The Lappsus `offsite` service
  (restic) has no repository configured either; when it is, add
  `/var/backups/digipuls` to what it copies.
