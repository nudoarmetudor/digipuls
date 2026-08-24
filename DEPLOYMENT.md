# Deploying DigiPuls

DigiPuls is a server-rendered Node.js/Express app with a SQLite database
(via Prisma). It needs a host that can run a persistent Node process — it
cannot run on static hosting (e.g. GitHub Pages).

Two paths are documented below:

- **A — Any Linux server, via git** (VPS, a colleague's server, a future
  Ministry-managed box) — full control, `git pull` to update.
- **B — Hostinger, Business/Cloud hosting with the Node.js App feature**
  (`digipuls.lappsus.com`) — no shell access needed; Hostinger builds and
  runs the app for you from a connected GitHub repo.

Both paths share the same three requirements: a `DATABASE_URL` pointing at
a SQLite file in a location that **survives redeploys**, a `SESSION_SECRET`,
and `NODE_ENV=production`.

---

## A. Generic server install (git-based)

Requirements: Node.js 18+ and git on the server.

```bash
git clone https://github.com/nudoarmetudor/digipuls.git
cd digipuls
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="file:/home/youruser/digipuls-data/prod.db"
SESSION_SECRET="<generate a long random string>"
PORT=3000
NODE_ENV=production
SIME_PROVIDER=mock
```

`DATABASE_URL` should point **outside** the git-tracked `digipuls/` folder
(e.g. a sibling `digipuls-data/` directory) so that redeploying — pulling a
new commit and reinstalling — never touches the database file.

```bash
mkdir -p /home/youruser/digipuls-data
npm install
npm run build     # prisma generate + prisma migrate deploy — creates the DB file on first run
npm run seed      # optional: loads demo schools/accounts; skip for a real production launch
```

Run it under a process manager so it survives reboots/crashes and restarts
on redeploy — either **pm2**:

```bash
npm install -g pm2
pm2 start src/app.js --name digipuls
pm2 save
pm2 startup   # follow the printed instructions to enable on-boot start
```

or a **systemd** unit (`/etc/systemd/system/digipuls.service`):

```ini
[Unit]
Description=DigiPuls
After=network.target

[Service]
WorkingDirectory=/home/youruser/digipuls
ExecStart=/usr/bin/node src/app.js
Restart=always
EnvironmentFile=/home/youruser/digipuls/.env
User=youruser

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now digipuls
```

Put Nginx (or Apache) in front as a reverse proxy to `localhost:3000` and
terminate TLS there (Let's Encrypt via `certbot`).

**To update:** `git pull && npm install && npm run build && pm2 restart digipuls`
(or `systemctl restart digipuls`).

---

## B. Hostinger — Business/Cloud hosting, Node.js App feature

This deploys `digipuls.lappsus.com` straight from the GitHub repo, with
Hostinger rebuilding automatically on every push — no SSH required.

1. In **hPanel → Websites → Add Website**, choose **Node.js web app**.
2. Choose **Import Git repository → Connect with GitHub**, authorize the
   Hostinger GitHub App, and select the `digipuls` repo.
3. In the deploy settings Hostinger shows you:
   - **Entry file**: `src/app.js`
   - **Node.js version**: 22 (or the latest available — anything 18+ works)
   - **Build command**: leave the auto-detected one, or set it explicitly to
     `npm install && npm run build`
   - **Domain**: bind it to the `digipuls` subdomain — create/select
     `digipuls.lappsus.com` as the subdomain for this application.
4. Add environment variables in the app's settings:
   ```
   DATABASE_URL=file:/home/<hostinger-user>/digipuls-data/prod.db
   SESSION_SECRET=<generate a long random string>
   NODE_ENV=production
   SIME_PROVIDER=mock
   DEMO_MODE=false
   ```
   `DEMO_MODE=false` is required as soon as real schools are being
   onboarded here: it hides the demo-accounts panel on the login page.
   Real school accounts (created via `/admin/schools/new`) already get a
   random one-time password regardless of this flag — `DEMO_MODE` only
   controls whether the *fictional* demo logins are advertised publicly.
   Use hPanel's File Manager or the built-in terminal to create the
   `digipuls-data` directory **once**, outside the app's own deployment
   folder, before the first deploy.
5. Click **Deploy**. Hostinger clones the repo, runs `npm install`, then the
   build command (`prisma generate && prisma migrate deploy` — this creates
   `prod.db` on the very first deploy), then starts `src/app.js`.
6. **Verify persistence before relying on it**: after the first successful
   deploy, log in and create a test school/rating, then push a trivial
   commit (e.g. a README tweak) to trigger a redeploy, and confirm the data
   you entered is still there. Hostinger's docs don't explicitly document
   whether the app's working directory is wiped on redeploy — pointing
   `DATABASE_URL` at a path outside it is the safeguard, but confirm it once
   with a real test rather than assuming.
7. Optional: run `npm run seed` once via hPanel's terminal for demo data —
   skip this for the real school rollout.

**To update:** just `git push` to the connected branch — Hostinger rebuilds
and redeploys automatically.

---

## Notes that apply to both paths

- **Demo/seed data**: `npm run seed` populates fictional schools and demo
  logins (see `prisma/seed.js` — password `DigiPuls2026!` for all demo
  accounts). Do not run it against a production database meant for real
  Moldovan schools; provision real schools instead via the admin SIME
  import flow (`/admin/schools/new`).
- **SESSION_SECRET** must be a long random value in production — sessions
  signed with the default dev secret are not secure.
- **Backups**: since everything lives in one SQLite file, back it up with a
  simple `cp`/`sqlite3 .backup` on a cron schedule — see `prisma/schema.prisma`
  for the `DATABASE_URL` this needs to match.
