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
- **Real per-person actor identity.** Today's `SCHOOL_TEAM` role is one
  shared login per school. A genuine multi-actor process (principal, deputy
  principal, teacher contributors, ICT coordinator, external validator,
  meta-mentor) needs individual accounts and per-rating attribution
  (`createdBy`/`updatedBy`/`confirmedBy` already exists at the cycle level;
  extend to individual ratings/evidence).
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
- **Responsive/mobile layout pass** and **WCAG 2.2 AA accessibility pass**
  (focus states, ARIA on status pills, a textual equivalent for the wheel).
- **Public-disclosure model refinement.** The wheel's public "domains" mode
  now bands scores rather than showing a continuous value (fixed this
  session), and `hasPlan` now requires `publishedAt` — but the broader
  question of what a public school comparison incentivizes is worth a
  deliberate policy pass, not just a technical fix.

## P3 — polish, not correctness

- PDF generation for the development plan document.
- More sophisticated Ministry/territorial analytics/dashboards.
- Additional visual refinement beyond the current DigiProf palette pass.

## Explicitly not planned

Rewriting the stack (React/Next.js/microservices/GraphQL) — the review
agreed, and this document agrees, that a disciplined Express/EJS/Prisma
monolith is the right architecture at this scale. The work above is about
correctness and completeness of what the monolith models, not what framework
renders it.
