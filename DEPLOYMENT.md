# Deploying DigiPuls

DigiPuls is a server-rendered Node.js/Express app with a MySQL database
(via Prisma). It needs a host that can run a persistent Node process — it
cannot run on static hosting (e.g. GitHub Pages).

**Why MySQL, not SQLite**: this app originally ran on SQLite for local dev
and was deployed that way too. On Hostinger's shared hosting, SQLite's
file-locking turned out not to work reliably against the home directory's
storage — any request touching the database (e.g. login) hung indefinitely
and eventually 504'd, with zero errors logged, rather than failing loudly.
Moving to a real database server (MySQL, included with Hostinger's Business
Web Hosting) fixed this outright. If you're deploying elsewhere and SQLite
works fine on your host's local disk, that's a legitimate simpler choice —
just change the `datasource` provider in `prisma/schema.prisma` back to
`sqlite` and regenerate the migration (`npx prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script`).

Two paths are documented below:

- **A — Any Linux server, via git** (VPS, a colleague's server, a future
  Ministry-managed box) — full control, `git pull` to update.
- **B — Hostinger, Business/Cloud hosting with the Node.js App feature**
  (`digipuls.lappsus.com`) — no shell access needed; Hostinger builds and
  runs the app for you from a connected GitHub repo.

Both paths share the same requirements: a `DATABASE_URL` pointing at a
MySQL database, a `SESSION_SECRET`, and `NODE_ENV=production`.

---

## A. Generic server install (git-based)

Requirements: Node.js 18+, git, and a MySQL (or MariaDB) server reachable
from the app — local on the same box, or a managed database elsewhere.

```bash
git clone https://github.com/nudoarmetudor/digipuls.git
cd digipuls
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="mysql://digipuls_user:<password>@<db-host>:3306/digipuls"
SESSION_SECRET="<generate a long random string>"
PORT=3000
NODE_ENV=production
SIME_PROVIDER=mock
```

Create the database and a user for it first (on the MySQL server):

```sql
CREATE DATABASE digipuls CHARACTER SET utf8mb4;
CREATE USER 'digipuls_user'@'%' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON digipuls.* TO 'digipuls_user'@'%';
```

```bash
npm install
npm run build     # prisma generate + prisma migrate deploy — creates all tables on first run
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

1. In **hPanel → Websites → Add Website**, choose **Web Apps → Node.js**.
2. Choose **Import Git repository → Connect with GitHub**, authorize the
   Hostinger GitHub App, and select the `digipuls` repo.
3. In the deploy settings Hostinger shows you:
   - **Entry file**: `src/app.js`
   - **Node.js version**: 22 (or the latest available — anything 18+ works)
   - **Build command**: leave the auto-detected one, or set it explicitly to
     `npm install && npm run build`
   - **Domain**: bind it to the `digipuls` subdomain — create/select
     `digipuls.lappsus.com` as the subdomain for this application.
4. Create a MySQL database for the app: hPanel → **Databases** → create a
   new MySQL database, a database user, and a password. Note the database
   name, username, password, and host (Hostinger's internal MySQL host is
   usually `localhost` from the app's perspective, but hPanel shows the
   exact host to use — check the database's connection details).
5. Add environment variables in the app's **Environment variables** page:
   ```
   DATABASE_URL=mysql://<db-user>:<db-password>@<db-host>:3306/<db-name>
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
6. Click **Deploy**. Hostinger clones the repo, runs `npm install`, then the
   build command (`prisma generate && prisma migrate deploy` — this creates
   all tables in the MySQL database on the very first deploy), then starts
   `src/app.js`.
7. **Verify it actually works, not just that the build succeeded**: log in
   (this is the first request that touches the database) and confirm it
   completes normally rather than hanging — that was exactly the failure
   mode SQLite had on this host. Create a test school/rating, then push a
   trivial commit to trigger a redeploy, and confirm the data is still there
   afterward.
8. Optional: run `npm run seed` once via hPanel's terminal for demo data —
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
- **Backups**: use your database host's normal MySQL backup mechanism
  (Hostinger's hPanel has a database backup/export option; a self-managed
  server should run `mysqldump` on a cron schedule).
