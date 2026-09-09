# DigiPuls roadmap

This tracks work identified by a detailed external review of the repo
(product/data-model/governance/security lens), grouped as P1–P3. The P0 items
from that review — the ones that were wrong *today*, not just architecturally
incomplete — have already been fixed (see README's "Implementation status"
table and the git history around this file's introduction): confirmed cycles
are now immutable, Ministry/partner/territorial dashboards now separate "the
latest cycle" from "the latest *confirmed* cycle" so a new draft can never
hide an already-confirmed record, the territorial flag route now checks
object-level authorization, rating/device input is validated server-side,
Order 675 wording now matches what's actually checked, real school accounts
get a random one-time password with a forced first-login change, login is
rate-limited, and a minimal automated test suite exists (`npm test`).

Nothing below is scheduled — this is a backlog, ordered roughly by the
review's own priority tiers, kept here so none of it gets silently dropped.

## P1 — needed before this is a genuine national longitudinal system

- **Instrument & compliance-rule versioning.** An `AssessmentCycle` should
  record which version of the 19-indicator instrument and which Order 675
  rule set it was scored against, so a 2026 score and a 2029 score (after the
  instrument changes) aren't silently compared as if they meant the same
  thing.
- **Baseline/SIME snapshot per cycle.** `enrolmentTotal`/`classroomsTotal`/etc.
  live on `School`, not the cycle — so Order 675 compliance for a 2026 cycle
  can be recalculated against 2028's enrolment if the school record is
  refreshed later. Every cycle needs its own frozen baseline snapshot.
- **Per-rating attribution.** The larger half of this is done: `SCHOOL_TEAM`
  became three real positions, the shared per-school logins have been retired,
  and a school-level account must now be named after a person — an unclaimed
  credential reaches nothing but a screen asking who holds it
  (`src/services/personalAccount.js`). What is left is attribution below the
  cycle: `confirmedBy` and `publishedBy` exist on the cycle, but an individual
  rating and its evidence still do not record who entered them. The two-track
  split records which *side* wrote a rating, not which person.
- **External validation workflow.** `ValidationRecord` currently has no
  enforced relationship integrity (free-text reviewer name, no route-level
  workflow tying it to submission → review → resolution). Either build the
  full workflow or stop presenting it as implemented.
- **Formal scoring/aggregation methodology.** Domain scores are a plain
  arithmetic mean of a 6-level ordinal scale — document explicitly whether
  that's the intended methodology (weighting, floor indicators, missing-data
  handling) rather than an implicit assumption.
- **Full input-validation layer.** The P0 pass added pragmatic guards on the
  highest-risk fields (rating level, device counts); a schema-validation
  library (e.g. Zod) across every route is the more complete version.
- **A persistent session store.** Production already moved from SQLite to
  MySQL (see DEPLOYMENT.md — SQLite's file-locking didn't work reliably on
  Hostinger's shared-hosting storage); sessions should now similarly move
  off the in-memory store to `express-mysql-session` so logins survive an
  app restart.
- **CI.** GitHub Actions running `npm test` + `npx prisma migrate diff`
  sanity checks on every PR, so the test suite this session started
  actually gates merges.

## P1.5 — the contract half of an expand/contract already in flight

- **Drop `User.role`, `User.schoolId`, `User.territoryId`.** The
  `Assignment` model replaced them: a person holds a list of posts, each a
  role at an institution. The migration backfilled every account into one
  assignment and application code no longer reads the old columns, but they
  were deliberately left in place rather than dropped in the same step —
  dropping them alongside the copy would have left no way back if the copy
  were wrong. Once this model has run in production for a cycle, drop them,
  and remove the legacy mirror-write in `routes/adminUsers.js`.
- **Migrate `UserCapability` rows and drop that table too.** Superseded by
  `AssignmentCapability` for the same reason and on the same schedule.

## P2 — meaningfully improves the product once P1 is solid

- **Evidence-quality rules.** Right now "at least one evidence item" (any
  length, any content) satisfies the Level 2+ requirement. Define per-
  indicator/level evidence expectations.
- **Development-plan lifecycle closure.** Priorities should inherit
  `currentLevel` from the confirmed assessment (not be freely typed), and the
  next cycle should explicitly ask whether each priority's target was
  achieved — closing the assess → plan → act → reassess loop.
- **Cycle scheduling/reminders.** The "2-year cycle" is a UI convention today,
  not an enforced/reminded lifecycle (`renewalDueAt`, mid-cycle check-ins).
- **Optimistic concurrency.** Two contributors editing the same indicator
  concurrently currently means last-write-wins with no conflict signal.
- **An accessibility audit with real assistive-technology users.** The
  responsive and WCAG 2.1 AA work listed here has since been done — focus
  states, landmarks, labelled controls, ARIA on the status pills, a textual
  equivalent for the wheel, reflow at 150% text and 390px width, plus viewer
  preferences for colour scheme, contrast, text size, motion and link
  underlining (see BRAND.md §7). What remains is the part that can't be done
  by inspection: testing with people who actually use screen readers,
  magnification and switch access, in Romanian and Russian as well as
  English. Everything above is a claim about the code; only this is evidence
  about the experience.
- **Gagauz as a fourth language.** EN/RO/RU are complete and test-enforced.
  Gagauz was raised in the design docs as a possible need; adding it is one
  more dictionary plus one more `indicators.*.js`, not a redesign.
- **Public-disclosure model refinement.** The wheel's public "domains" mode
  now bands scores rather than showing a continuous value (fixed this
  session), and `hasPlan` now requires `publishedAt` — but the broader
  question of what a public school comparison incentivizes is worth a
  deliberate policy pass, not just a technical fix.

## P3 — polish, not correctness

- PDF generation for the development plan document.
- More sophisticated Ministry/territorial analytics/dashboards.
- Additional visual refinement beyond the current DigiProf palette pass.

## Security — what the September 2026 pass left open

The findings from that review were fixed (CSRF tokens, session `SameSite`,
split of `admin.users` from `admin.grant`, current-password requirement, TLS
to the database, security headers, rate limiting, CSV formula neutralisation,
the seed guard). Four things were deliberately not closed, and are recorded
here rather than quietly carried:

- **`mariadb` driver advisories.** Three open, including cleartext credential
  exposure to a man-in-the-middle, and there is no fixed release. TLS is now
  on, which addresses the exposure in practice, but the dependency needs
  watching for a patched version.
- **`deepmerge-ts` via the Prisma CLI.** Build-time only; the available fix is
  a Prisma downgrade, which is a worse trade than the risk of a stack
  exhaustion in a tool run by hand at deploy time.
- **Sessions are stored in memory.** One Passenger process makes that
  consistent, and anonymous visitors no longer create sessions, so the store
  holds only signed-in people — tens, not thousands. But every deploy signs
  everyone out, and a second process would split the store. A Prisma-backed
  session store is the fix; the cost is a query per request against an hourly
  connection budget, which is why it has not been done yet.
- **Rate limiting is per process and in memory.** Correct for a single
  Passenger process on shared hosting. Running more than one process means
  moving these counters to the database or a shared store, and the limits
  silently become per-process until that happens.
- **`style-src 'unsafe-inline'` in the CSP.** Several views carry inline style
  attributes and the maturity wheel paints through CSS custom properties.
  Removing them is a mechanical but wide change; the alternative was shipping
  a policy that broke the layout.

Also still open, and larger than this pass: no multi-factor authentication,
and no password-strength or breach check beyond a ten-character minimum.

## Explicitly not planned

Rewriting the stack (React/Next.js/microservices/GraphQL) — the review
agreed, and this document agrees, that a disciplined Express/EJS/Prisma
monolith is the right architecture at this scale. The work above is about
correctness and completeness of what the monolith models, not what framework
renders it.
