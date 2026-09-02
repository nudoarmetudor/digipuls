# DigiPuls — MVP prototype

DigiPuls is Moldova's digital-school-maturity self-assessment, planning, and multi-stakeholder status platform — the software implementation of the **Moldova Digital School Framework (MDSF)**, replacing Oglinda Digitală. It started as a local-only MVP prototype to prove the design in the MDSF vault (`../11_Platform_Design/`) was buildable and internally consistent, and is now moving into real use: it runs live (see "Deploying it" below) and real Moldovan schools are being onboarded via `/admin/schools/new`.

**Read this before trusting any specific claim below**: an external review of this repo (product/data-model/governance/security lens) found several places where a claim in this README was stronger than what the code actually guaranteed — e.g. "confirmed" assessments that could still be silently edited, dashboards that could drop a school's confirmed record once a new draft cycle started, "Order 675 compliant" implying more verification than the data model supports. The P0 findings from that review have been fixed (immutable confirmation, draft-vs-confirmed separation, real per-school one-time passwords, honest Order 675 wording, basic input validation and rate limiting, a starter test suite). The **"Implementation status" table below states what's actually true today**, and [ROADMAP.md](ROADMAP.md) tracks everything from that review not yet addressed (P1–P3) so it isn't silently dropped. Still missing before this is a fully hardened national system: per-person actor identity (today's school login is shared per school, not per person), a real external-validation workflow, and MFA — see ROADMAP.md.

**Database note**: this ran on SQLite during local development, but production moved to MySQL after SQLite's file-locking turned out not to work reliably on Hostinger's shared-hosting storage — DB-touching requests (like login) hung indefinitely rather than failing loudly. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full story and setup.

**Visual identity**: the UI uses the DigiProf/Clasa Viitorului brand palette (`accelerator.clasaviitorului.md`) — shades of cyan (`#307e8c` primary, `#286872`/`#1f4b53` darker) and purple (`#622582` primary, `#4a1c63` darker) only, plus the grey/blue/red/green status-check colors used by the assessment wizard's step navigator (not started / in progress / needs attention / complete).

## Getting it from GitHub

```bash
git clone https://github.com/nudoarmetudor/digipuls.git
cd digipuls
npm run setup      # npm install + prisma migrate + seed demo data
npm run dev
```

Then open **http://localhost:3000** — see "Quick start" below for demo accounts. This is the same install path whether you're trying it locally or bringing it up on a real server — see [DEPLOYMENT.md](DEPLOYMENT.md) for a generic git-based server install and the specific steps used to run the live instance below.

**Live instance**: [digipuls.lappsus.com](https://digipuls.lappsus.com) — the real running app, hosted on Hostinger (Node.js App feature, auto-deployed from this repo's `main` branch).

**GitHub Pages** (`docs/` on this branch) hosts a static overview of the project — what DigiPuls is, the maturity wheel, and links back here — it is *not* the running app itself, just an info page; the live app is the Hostinger instance above, or wherever you `git clone` and run it yourself.

## New in this pass: the maturity wheel and Romanian language

**Maturity wheel** — a concentric-circle, sectioned visualization, requested directly: "the wheel visualization, with the concentric circles for levels and being sectioned for each indicator." Pure server-side SVG (`src/services/wheelChart.js`), no chart library:
- 19 sectors, one per indicator, grouped contiguously by domain (A/B/C/D coloured in the two DigiProf brand shades — dark/light cyan for A/B, dark/light purple for C/D). Ring distance from centre = the indicator's current level (0 = centre hole, 5 = outer edge). Hover any sector for the exact level.
- A coarser 4-sector "domains" mode for the public tier, which only discloses domain-level bands, not raw indicator scores — shown as *shape only*, matching that disclosure policy rather than exposing precision it isn't supposed to reveal.
- Embedded in: the school's own assessment page (current cycle), the school's history page (one small wheel per confirmed cycle, side by side — a genuine visual "progress over time"), Ministry and Territorial school-detail pages, and the public school-summary page.

**Romanian language** — a full second locale, not a partial gloss:
- **The entire 19-indicator, 6-level instrument is fully translated**: `src/data/indicators.ro.js` mirrors `indicators.js`'s structure exactly (same codes, same order) with professionally translated domain names, indicator names, descriptions, all six level descriptions per indicator, and the quantitative benchmarks. `src/data/indicatorsI18n.js` is the locale dispatcher every route calls instead of importing the English file directly for display purposes.
- **UI chrome**: `src/i18n/index.js` holds a translation dictionary plus shared lookups for recurring database values (cycle status, change state) that appear across many views, so `DRAFT`/`CONFIRMED`/`GREW`/`DECAYED` render correctly translated everywhere they're used, not just on one page.
- **Session-persisted language switcher** in the top nav (EN/RO), including for unauthenticated public visitors — defaults to English so nothing already tested in this session changes behaviour unless a user actively switches.
- **Coverage, honestly**: the school-facing pages (dashboard, assessment, plan, history) and the public-facing pages (school search, school summary) are fully translated — these are the pages actual Moldovan schools and parents would use. The Ministry dashboard and school-detail views are substantially translated (headers, badges, wheel). Territorial, partner, strategic-partner, and admin views keep more English prose — they're the smaller, internal-stakeholder-facing surface, and translating them further is a matter of extending the same dictionary, not a design change.

Try it: log in as any school account, click **RO** in the top navigation, and the entire assessment page — all 19 indicator names, descriptions, and level text, the wheel, the confirm/evidence workflow — renders in Romanian immediately, with no page-specific work required beyond what's already wired.

## What this implements

Every piece below traces directly to a specific design document in the MDSF vault (`../` from this folder) — nothing here was invented fresh:

- **The 19-indicator, 6-level self-assessment instrument** (Annex A v2/v3) — full text, quantitative benchmarks, seeded as reference data (`src/data/indicators.js`).
- **A Level-0 quantitative floor for D1 (network) and D2 (devices)** — Order 675/2024's numeric device quotas and network checklist (`src/data/order675.js`), enforced server-side: a school genuinely cannot rate D1/D2 above 0 while it fails these specific checks, no matter what they select in the UI. **Scope, precisely**: this checks declared equipment *quantities* (Annex 2) and a network *checklist* (Annex 5) — it does not verify technical specifications (Annex 1), supplementary equipment (Annex 3), or room-usage mandates (Annex 4). The UI now says "quantitative equipment check," not "Order 675 compliant," to match.
- **A continuation-cycle mechanism** (maintain/grow/decay) — `src/services/cycleService.js`. A renewal cycle starts from the prior confirmed cycle's data, not a blank form, and the change state (grew/decayed/maintained) is derived automatically from the level delta. This is a mechanism a school can trigger any time after confirming — there is no enforced/reminded 2-year schedule yet (tracked in ROADMAP.md).
- **A step-by-step assessment wizard, not a single long form** — `src/services/stepStatus.js` + `src/routes/school.js`. The 19-indicator assessment is a real multi-week, multi-actor process (principal, deputy principal, teachers, the educational technologist, an external validator, meta-mentors), so it's split into independently-saveable steps (domains A–D, equipment/network, review), each showing a grey/blue/red/green status pill computed from actual data completeness. Nothing blocks a contributor from saving one field and coming back later — each section saves the moment you press its own save button (not real autosave) — and confirmation is the only gated action, with validation errors surfacing inline on the review step. **Once a cycle is confirmed it is immutable**: the rating/evidence/device/network routes reject further writes against it, so a confirmed record can't silently change after Ministry/partners have seen it — the only way to change anything further is to start a continuation cycle.
- **A transparent school overview for Ministry and partners, not an automated matching engine** — `src/services/schoolOverview.js`. Partner/donor decisions are case-by-case and every partner's projects differ, so instead of a scoring/ranking engine, Ministry and partner dashboards get filterable, sortable, CSV-exportable views of real school data (band, compliance, per-domain scores) — visibility and overview, no automated recommendation. The one exception, disclosed directly on the page: the strategic-partner dashboard applies one transparent, fixed sort (lowest Domain C average) for training-cohort triage — a disclosed sort, not a matching/recommendation engine.
- **Six role-based views**: school, Ministry, territorial authority, financing partner, strategic partner, and an unauthenticated public tier — each scoped exactly as designed, not just permission-gated versions of the same screen. Every dashboard/detail view separates "the current cycle" (any status) from "the latest **confirmed** cycle" — a school opening a new continuation cycle never makes its last confirmed assessment disappear from Ministry/partner/territorial views.
- **The SIME integration seam** — `src/services/sime/`. The one automated cross-system integration DigiPuls keeps: an import → check/validate → edit → submit onboarding flow that looks up a school in SIME and pre-fills the new-school form, so an admin edits/confirms rather than retyping. A documented interface (`simeProvider.interface.js`), a working mock provider with a small fake registry, and a service that throws loudly (not silently) if `SIME_PROVIDER=live` is set, since no real integration exists yet. See below.
- **An audit trail** (`AuditLogEntry`) — every rating change, evidence addition, cycle confirmation, login, password change, territorial flag, and provisioning event is logged.
- **The evidence threshold** (Level 2+ requires evidence) enforced at cycle-confirmation time, not just suggested in the UI.
- **Real-account security basics**: schools provisioned via `/admin/schools/new` get a random one-time password (shown once to the admin) with a forced password-change on first login — never a fixed/shared password. Login is rate-limited. `SESSION_SECRET` is mandatory in production (the app refuses to start without it).

## Implementation status

Precise, so nothing here means something weaker than it sounds:

| Capability | Status |
|---|---|
| 19-indicator/6-level self-assessment | Implemented |
| Per-indicator evidence (text/type/source metadata) | Implemented |
| Evidence *file* upload | Not implemented — `uploads/` reserved, `multer` installed but unwired |
| Order 675 D1 network checklist / D2 device quantities | Implemented, scope-limited (see above) — not full Annex 1/3/4 verification |
| Confirmed-cycle immutability | Implemented |
| Latest-draft vs. latest-confirmed separation | Implemented |
| Continuation-cycle mechanism (maintain/grow/decay) | Implemented; no enforced 2-year schedule/reminders yet |
| Step-by-step wizard with real-data-driven status | Implemented |
| Multi-actor assessment | Partial — shared per-school login today, not per-person attribution (P1) |
| External validation workflow | Data model exists (`ValidationRecord`); no enforced workflow yet (P1) |
| Transparent (non-automated) Ministry/partner overview | Implemented, including the one disclosed strategic-partner sort |
| SIME integration | Mock provider + full seam; no live API connection |
| Server-side input validation | Partial — rating levels and device counts validated; not a full schema-validation layer (P1) |
| Auth hardening | Partial — one-time passwords, forced change, rate limiting, mandatory prod secret; no MFA/password-reset yet |
| Automated tests | Partial — `npm test` covers Order 675 rules, draft/confirmed selection, step-status colors, input validation; no route-level/integration tests yet |
| Database | MySQL in production (Hostinger's included database); switched from SQLite after a real hosting-storage incompatibility — see DEPLOYMENT.md |

See [ROADMAP.md](ROADMAP.md) for everything in "Partial"/"Not implemented" above, tracked in priority order.

## Quick start

```bash
npm install
cp .env.example .env      # defaults are fine for local dev
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Then open **http://localhost:3000**. With `DEMO_MODE` at its local default (`true`), the login page lists all demo accounts — every seeded account uses the password `DigiPuls2026!`. Set `DEMO_MODE=false` (as the live instance does) to hide that panel once real accounts exist — real accounts never use a fixed password regardless of this flag.

Or, in one shot: `npm run setup && npm run dev`.

### Demo accounts (see the login page for the full list)
| Role | Email | What it shows |
|---|---|---|
| School (strong, 2 cycles) | `zadnipru@digipuls.md` | High maturity, a real continuation cycle with grew/decayed indicators |
| School (device need) | `hasdeu@digipuls.md` | Network-compliant but device-poor — a real DEVICE-donation candidate |
| School (network non-compliant) | `ghibu@digipuls.md` | Fails the D1 floor — level 0 enforced server-side regardless of self-report |
| School (mid-assessment) | `singera@digipuls.md` | 7/19 indicators rated, DRAFT cycle — the step-by-step wizard in progress |
| Ministry | `ministry@digipuls.md` | National dashboard, compliance monitor, filterable/exportable school overview |
| Territorial | `territorial-chisinau@digipuls.md` | Regional-scoped dashboard |
| Financing partner | `unicef@digipuls.md` | Filterable, read-only school overview — real data, no automated matching |
| Strategic partner | `clasaviitorului@digipuls.md` | Domain-C training-needs lens |
| Admin | `admin@digipuls.md` | Provision a school via (mock) SIME lookup, audit log |

### Try the step-by-step wizard yourself
1. Log in as `singera@digipuls.md` — a school mid-assessment (7/19 indicators rated, DRAFT cycle).
2. Land on the cycle overview: six status pills (grey/blue/red/green) show at a glance what's untouched, in progress, needs attention (missing evidence), or complete — plus the maturity wheel and an overall progress bar.
3. Open any domain step, rate an indicator, add evidence for a Level 2+ rating — each form saves independently and redirects right back to that step, no requirement to finish the rest.
4. Open the **Review & Confirm** step: a full 19-indicator summary table, edit links back into each domain, and a confirm button that's blocked (with an inline error, not a dead-end page) until every indicator is rated and evidenced.

### Try the transparent overview yourself
1. Log in as `ministry@digipuls.md` or `unicef@digipuls.md` (financing partner).
2. Filter the school table by enrolment band, cycle status, the Order 675 quantitative check, or a minimum per-domain score — every filter is a plain, disclosed criterion, not a hidden score.
3. Export the filtered set as CSV. There is no automated matching/ranking on these views — partner/donor decisions stay case-by-case, per the design brief. (The one exception is the strategic-partner dashboard's single disclosed training-need sort — see its own page caption.)

## Architecture

- **Node.js + Express** (server-rendered EJS views, no frontend build step — `npm run dev` is the whole toolchain).
- **Prisma ORM + MySQL**. Originally SQLite for zero-config local dev; moved to MySQL (schema unchanged in spirit — just the `datasource` provider and a few `@db.Text` annotations on long free-text fields) after SQLite's file-locking proved unreliable on Hostinger's shared-hosting storage. See [DEPLOYMENT.md](DEPLOYMENT.md).
- **express-session** with the default in-memory store — fine for one process, **not** fine for production at scale (sessions vanish on restart and can't be shared across multiple instances; swap for a real session store, e.g. `connect-mysql`/`express-mysql-session`, when that starts to matter).
- No frontend framework — plain EJS templates + a hand-written stylesheet (`public/css/style.css`) + a small amount of vanilla JS (the SIME autocomplete). Deliberately boring, so a small team can read and extend it without a build pipeline.

```
12_DigiPuls_App/
  prisma/schema.prisma      — data model (see comments for design provenance)
  prisma/seed.js            — 8 realistic demo schools + 5 role accounts
  src/
    app.js                  — Express entry point
    data/indicators.js      — the 19-indicator, 6-level instrument (Annex A)
    data/order675.js        — Order 675 quotas/specs + compliance-check logic
    services/
      cycleService.js       — first-cycle + continuation-cycle logic
      stepStatus.js          — wizard step status (grey/blue/red/green) from real data completeness
      audit.js              — audit-log helper
      schoolOverview.js     — shared school+cycle+compliance projection + transparent filter/sort/CSV export (Ministry/Territorial/Strategic/Partner)
      wheelChart.js          — server-side SVG maturity wheel (DigiProf cyan/purple palette)
      sime/                 — the SIME integration seam (see below)
    routes/                 — one file per role (school, ministry, territorial, partner, strategic, public, admin, auth)
    middleware/auth.js      — session + role-guard middleware
    views/                  — EJS templates, one folder per role
  public/css/style.css
  uploads/                  — reserved for real evidence file uploads (not wired yet — see below)
```

## SIME integration — "leave a place for it"

Order 675/2024 already requires schools to report ICT-equipment data into **SIME** (Sistemul Informațional de Management în Educație), Moldova's national education management information system, and requires local authorities to monitor that reporting. DigiPuls does **not** have live access to the real SIME API in this environment — but the integration point is built and exercised end-to-end against realistic mock data:

- `src/services/sime/simeProvider.interface.js` documents the exact interface a real integration needs (`searchSchools(query)`, `getSchoolBySimeId(id)`), and the minimal field set DigiPuls actually consumes.
- `src/services/sime/mockSimeProvider.js` implements it against a small hand-authored fake registry (8 Moldovan-sounding schools with SIME-shaped IDs).
- `src/services/sime/simeService.js` picks the provider based on `SIME_PROVIDER` in `.env`. Setting it to `live` throws a clear "not implemented" error rather than silently falling back to mock data — the gap is loud on purpose.
- **Where it's exercised**: log in as `admin@digipuls.md` → "Add school (SIME)" → type a few letters in the search box → it autocompletes from the mock registry and fills in the new-school form. This is the actual UX a real SIME-backed autocomplete would have; only the data source needs to change.

**To wire up a real integration later**: implement `SimeProvider`'s two methods against the real SIME API in a new `liveSimeProvider.js`, then change `simeService.js`'s `buildProvider()` to return it when `SIME_PROVIDER=live`. Nothing else in the app needs to change — every caller goes through `simeService`, never the provider classes directly.

## What's genuinely working (verified this session, not just claimed)
Every flow below was exercised against the running server, not just written and assumed correct:
- A brand-new school can be provisioned (via SIME lookup or manually), log in, start its first cycle, and save a rating — including catching and fixing a real bug where first-cycle schools had no indicator-rating rows to save against at all (see git history / the schema's `level Int?` comment for why this field must be nullable).
- Cycle confirmation correctly blocks on unrated indicators and on missing evidence for Level 2+ ratings.
- A continuation cycle correctly derives `MAINTAINED` / `GREW` / `DECAYED` per indicator from the level delta against the prior confirmed cycle, and the school's own history view renders it.
- D1/D2 compliance is computed from real entered device/network data against Order 675's actual quota table (by enrolment band) and network checklist — not hardcoded — and the level is server-side capped at 0 when non-compliant, regardless of what the UI form submits.
- The step-by-step wizard's status pills correctly reflect real data state — grey when untouched, blue mid-way through a domain, red when every indicator is rated but evidence is missing for a Level 2+ rating, green only when genuinely complete — and confirmation correctly redirects to the review step with an inline error (not a dead-end page) when indicators are unrated or under-evidenced.
- The Ministry/partner overview's filters (band, status, Order 675 compliance, per-domain minimum score) and CSV export all operate on real computed data, with no scoring or ranking applied.
- Role-based access control actually denies cross-role access (verified: a partner account gets a 403 hitting a Ministry route, not just a hidden nav link).
- Public (unauthenticated) school summaries show the mandatory-minimum tier correctly banded, with richer detail only for schools that opted in.

## Not yet built (honest gap list, not hidden)
These are real, acknowledged gaps — flagged the same way every open design question in the MDSF vault was flagged, not silently skipped:
- **Real file upload for evidence.** `multer` is installed but not wired up — evidence entries are currently text-only (type/description/source), not actual attached documents. The `uploads/` folder is reserved for this.
- **Server-side PDF generation.** The plan document (Annex C) currently renders as a print-friendly HTML page (browser "Print to PDF" works fine for now); a real server-side renderer (e.g., Puppeteer) is the natural next step, noted directly in the plan-document view.
- **Mid-cycle check-in.** Flagged in the process-flow design as a recommended addition, not yet built — the 2-year cycle currently has no lightweight interim touchpoint.
- **Territorial flags as a first-class model.** Currently logged to the audit trail rather than a dedicated `Flag` entity with its own lifecycle/notifications.
- **Notifications/reminders** (cycle-renewal approaching, compliance-drop alerts, donation-match notifications) — designed, not implemented; there's no background job runner in this MVP.
- **Full multi-language coverage.** EN/RO now exist (see above) with the full instrument translated and the school/public pages fully covered — but Territorial, Partner, Strategic-partner, and Admin views still carry English prose beyond their translated badges/headers. Extending them is additive work against the existing `src/i18n/index.js` dictionary, not a redesign. No Russian/Gagauz yet, flagged as a possible future need in the design docs.
- **Live SIME integration**, per above — the seam exists, the real connection doesn't.
- **Offline/low-connectivity resilience** — not attempted in this MVP; the design doc's own irony (the schools that most need this tool often have the weakest connectivity) is unaddressed here.
- **Data protection hardening for evidence** — the "prefer aggregates over named individuals" guidance from the design docs isn't enforced by the UI, only documented as a principle.
- **Full production-grade auth** — one-time passwords, forced first-login change, and basic login rate-limiting now exist; still no self-service password reset and no MFA. See ROADMAP.md.

## Deploying it — see DEPLOYMENT.md

**This has now happened**: DigiPuls runs live at [digipuls.lappsus.com](https://digipuls.lappsus.com) on Hostinger, deployed straight from this repo. [DEPLOYMENT.md](DEPLOYMENT.md) documents that setup step-by-step, plus a generic git-based install for any other Linux server (VPS, systemd/pm2 + nginx).

Further hardening for a larger real-world rollout, still worth doing beyond what's live today:
1. Swap the in-memory session store for a persistent one (`express-mysql-session` is the natural pairing with the current MySQL database) so logins survive an app restart.
2. Move file evidence uploads (once actually built — see "Not yet built" above) to object storage rather than local disk if running more than one instance.
