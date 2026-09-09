# DigiPuls — the process, end to end

This document describes everything that happens in DigiPuls, from the moment an
account is created to the moment a school publishes the final report on a
two-year development plan. It is written to be the source text for the user
manual: each numbered process below is a chapter, each step within it is
something one identified person does on one screen.

It describes the platform as it actually behaves, not as it was planned. Where
the software deliberately refuses to do something, that refusal is written down
too, with the reason — because "why won't it let me?" is the question a manual
has to answer.

**Contents**

- [1. What DigiPuls is](#1-what-digipuls-is)
- [2. The instrument](#2-the-instrument)
- [3. The people](#3-the-people)
- [4. Accounts](#4-accounts)
- [5. Signing in and finding your way](#5-signing-in-and-finding-your-way)
- [6. Process A — the self-assessment](#6-process-a--the-self-assessment)
- [7. Process B — reconciliation](#7-process-b--reconciliation)
- [8. Process C — confirming and publishing the assessment](#8-process-c--confirming-and-publishing-the-assessment)
- [9. Process D — the DigiPlan](#9-process-d--the-digiplan)
- [10. Process E — implementation and the interim report](#10-process-e--implementation-and-the-interim-report)
- [11. Process F — the final report and the next cycle](#11-process-f--the-final-report-and-the-next-cycle)
- [12. What the oversight roles do](#12-what-the-oversight-roles-do)
- [13. The public tier](#13-the-public-tier)
- [14. Reporting a problem](#14-reporting-a-problem)
- [15. Administration](#15-administration)
- [16. Rules that hold everywhere](#16-rules-that-hold-everywhere)
- [17. Quick reference](#17-quick-reference)

---

## 1. What DigiPuls is

DigiPuls is the instrument through which the twelve DigitalAccelerator pilot
schools measure their own digital maturity, agree on where they stand, decide
where they intend to move, and report on whether they got there.

It is a self-assessment platform, and that word is the whole design. Nobody
outside a school can change that school's record. The Ministry, the territorial
agency, the partners and the school's own metamentor all read; only the school
writes. What the platform adds to a self-assessment is a memory: every rating
carries evidence, every agreement carries two signatures, and every published
document is frozen so it cannot later be quietly improved.

One cycle runs about two years:

```
   assess (two tracks, in parallel)
        │
        ▼
   reconcile ─────► confirm ─────► publish
                                      │
                                      ▼
                                  the DigiPlan ──► publish
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                 interim report            final report
                  (after ~1 year)          (after ~2 years)
                          │                       │
                          └──────────► next cycle ┘
```

---

## 2. The instrument

### 2.1 Four domains, nineteen parameters

| Domain | Name | Parameters |
| --- | --- | --- |
| **A** | Leadership, Governance and Change Management | A1–A5 |
| **B** | Teaching, Learning and Assessment | B1–B5 |
| **C** | Human Capacity and Digital Competence | C1–C4 |
| **D** | Infrastructure, Platforms and Digital Ecosystem | D1–D5 |

| Code | Parameter |
| --- | --- |
| A1 | Participatory strategic planning |
| A2 | Data-informed decision making |
| A3 | Learning organisation and knowledge sharing |
| A4 | Monitoring and evaluation |
| A5 | Leadership support and motivation |
| B1 | Integrated STEAM / interdisciplinary project-based learning |
| B2 | Changing teacher and student roles |
| B3 | Learner-centred assessment |
| B4 | Structural changes in curriculum, scheduling and learning spaces |
| B5 | Pedagogical use of digital resources and AI tools |
| C1 | Teachers' digital competence |
| C2 | Learners' digital competence |
| C3 | Structured professional development, mentoring and coaching capacity |
| C4 | AI literacy and emerging-technology competence |
| D1 | Network and digital security |
| D2 | Digital devices |
| D3 | IT management |
| D4 | User support |
| D5 | Software, digital services and information systems |

### 2.2 Six levels

Every parameter is rated on the same scale, and every level has its own written
description for that specific parameter — the scale is not six adjectives
applied by feel.

| Level | Name | In one sentence |
| --- | --- | --- |
| 0 | Below floor | The thing does not exist in any form. |
| 1 | Accidental | It exists because somebody was told to produce it. |
| 2 | Initial coordination | Some people do it deliberately, together. |
| 3 | Process redesign | The way the school works has changed because of it. |
| 4 | Seamless embedding | It is simply how the school operates. |
| 5 | Continuous innovation | The school improves the practice and others learn from it. |

**Level 0 is an answer, not a blank.** Saying "we have no digital development
plan at all" is a finding. The platform treats 0 as a recorded rating
everywhere: it counts as answered, it can be reconciled, it can be a starting
point in the plan. What it never does is stand in for "we have not looked at
this yet".

### 2.3 The evidence rule

**From level 2 upward, a rating needs at least one piece of evidence.** Levels 0
and 1 do not: they are statements that something is absent or nominal, and
there is nothing to attach.

A cycle cannot be confirmed while any agreed rating of 2 or above has no
evidence. This is the single hardest rule in the platform, and it is the reason
the results mean anything: without it, a self-assessment converges on level 4
in about a week.

### 2.4 The two national annexes

Two things are not scored on the six-level scale, because they are counted
rather than judged. They belong to Order 675/2024:

- **The device inventory** (Annex 2): how many of each kind of device the school
  has, against the national quota for its size.
- **The network checklist** (Annex 5): whether Wi-Fi covers the whole school,
  whether subnets are separated, 802.11n and 802.11ac, an active firewall,
  content filtering.

These feed the Ministry's compliance monitor, which is a quantitative check and
not part of the maturity rating.

---

## 3. The people

### 3.1 Inside a school

A school fields a **digital team** of about seven people:

| Position | Role in the platform | Typically |
| --- | --- | --- |
| Principal | `SCHOOL_PRINCIPAL` | 1 |
| Deputy principal | `SCHOOL_DEPUTY` | 1 |
| Mentor | `SCHOOL_MENTOR` | 5 or 6 |

The principal and the deputy principal are **the administration**. The mentors
are **the team**. That distinction is not decoration: it decides which of the
two parallel assessments each person writes into (see [Process A](#6-process-a--the-self-assessment)).

What separates them in the software:

- **Both** may assess, attach evidence, write initiatives and record results.
- **Only the principal and the deputy** may open a cycle, settle a reconciled
  level, confirm a cycle, open a DigiPlan, set what a parameter aims at, write
  the school's account in a report, publish anything, and create accounts for
  colleagues.

The principal and the deputy currently hold identical permissions. Which of
them acted is recorded in the audit trail; it is not a boundary the software
enforces. If any step should ever be the director's alone, that is a decision
to take and then implement — it is not the case today.

### 3.2 The DigitalAccelerator mentoring line

| Position | Role | Scope |
| --- | --- | --- |
| Metamentor (DigCompEdu C1) | `META_MENTOR` | One school, plus the national picture — read-only |
| Metacoordinator (DigCompEdu C2) | `META_COORDINATOR` | The whole mentor group, plus account management |

There are twelve metamentors, one per school. A metamentor **advises and
watches; they never edit a school's record** — not even the school they are
attached to. They see that school's work live, drafts included, so they can help
before a mistake is confirmed rather than after.

Two metacoordinators are drawn from among the twelve. The position is about
coordinating the mentors, not about an institution, so it names no school.

### 3.3 Oversight

| Position | Role | Sees |
| --- | --- | --- |
| Ministry of Education and Research | `MINISTRY` | The national dashboard and the Order 675 compliance monitor |
| Territorial Education Agency | `TERRITORIAL` | The same reading, bounded to its own territory |
| Financing partner (UNICEF and others) | `PARTNER` | The school overview relevant to what they fund |
| Strategic partner (Clasa Viitorului) | `STRATEGIC_PARTNER` | The training-needs dashboard |

Every one of these is read-only. None of them can alter a school's assessment,
plan or report.

### 3.4 The platform itself

`ADMIN` is not a position in the programme. It provisions schools, creates
accounts, decides what a post may do, and reads the audit log.

---

## 4. Accounts

### 4.1 One account, one person

**Every school-level account belongs to one named individual.** There are no
team logins, and the platform refuses to create one: an account named "Echipa
digitală", "Administrația liceului", "Digital team" or "Команда школы" is
rejected, in all three languages, at both places where accounts are made.

The reason is not tidiness. The audit trail is what this platform is for, and
"Echipa digitală confirmed the assessment" names nobody — a confirmed cycle
stops being a signature and becomes a shrug. A shared login also makes the
two-track assessment impossible, because one account cannot be on both sides of
a reconciliation.

Oversight accounts are the deliberate exception: "MEC Task Force" and "UNICEF
Moldova" *are* institutions reading results, and naming them after an
individual would be the wrong record.

### 4.2 How an account comes into being

Two routes, and only two:

1. **The principal or deputy creates a mentor.** School accounts → New account.
   They give a name and a handle; the position is fixed to mentor and the
   school is taken from their own post. A principal cannot create another
   principal, a deputy, a metamentor, or anything in the oversight line, and
   cannot point an account at another school.
2. **An administrator creates anything else** — principals, deputies,
   metamentors, oversight accounts.

Either way the account is issued with a **generated one-time password, shown
exactly once**. Write it down at that moment; it cannot be displayed again, only
regenerated.

### 4.3 First sign-in

1. **Set a password.** At least ten characters. Nothing else in the platform is
   reachable until this is done.
2. **Claim the account,** if it was issued to an institution rather than to a
   person. This screen asks who you are and lets you replace an institutional
   handle (`zadnipru@digipuls.md`) with your own (`popescu.maria`). From that
   moment everything you do is recorded under your name, and the audit log
   records which old login became whose.

The claim screen exists because the pilot's first weeks ran on twelve shared
logins. Deleting them would have locked twelve schools out; renaming them would
have meant inventing names for real directors. So the credential survives the
handover and the person completes it.

### 4.4 Managing your school's accounts

Principal and deputy only, under **School accounts**:

- see everyone with a post at the school, and whether they have signed in yet;
- create a mentor account;
- rename one;
- reset a mentor's password (a new one-time password, shown once);
- deactivate and reactivate a mentor.

A principal cannot act on another principal or on a deputy. Colleagues of equal
standing do not reset each other's passwords; administrators exist for that.
Nobody is ever deleted — deactivation preserves the audit trail, and a deleted
person would take their signatures with them.

---

## 5. Signing in and finding your way

### 5.1 Workspaces

One person can hold several posts — a metamentor for one lyceum who is also a
metacoordinator, for example. Each post is a **workspace**, and the platform
keeps them genuinely separate: the workspace is part of the address (`/w/12/...`),
so two browser tabs can sit in two different posts at once without either
leaking into the other.

If you hold exactly one post you will never see the picker. If you hold more,
you choose on the way in, and you can switch at any time from the top of the
page.

### 5.2 Language

Romanian, Russian and English, switchable from the top bar on every page,
including the public pages and the sign-in screen. The choice follows you: it is
remembered for signed-in users and in a cookie for everyone else, and a
first-time visitor is served their browser's language rather than English.

### 5.3 Display and accessibility

Colour scheme, contrast, text size, motion and link underlining, all from the
top bar. They are stored per browser and applied before the page is drawn, so
there is no flash of the wrong theme, and the whole thing works with JavaScript
switched off.

### 5.4 The guided tutorial

The **Guide** button in the top bar opens a step-by-step walkthrough of
everything in this document, inside the platform itself. It highlights the
actual control on the actual page and explains what it is for, chapter by
chapter, and you can move back and forth through the steps from the list on
the right.

It is written for the people who have work to do in the platform — the
principal, the deputy principal and the mentors — and it shows each of them
only what their own position can reach: a mentor is never walked through a
publish button they do not have. The oversight roles are not offered it,
because they arrive at a finished dashboard rather than a workflow.

The guide never blocks the page. You can click the control it is pointing at
while it is still highlighted, and it remembers where you were if you close it.

### 5.5 The navigation panel

The left panel is built from what your post may actually do, so you are never
offered a link that would then refuse you. It folds away, and the choice
persists.

---

## 6. Process A — the self-assessment

### 6.1 Two tracks, in parallel

The administration and the team assess **independently and at the same time**,
and neither sees the other's answers while doing it. This is enforced, not
merely asked for: on the reconciliation screen, the other side's level for a
parameter stays hidden until you have recorded your own for it.

| Who | Writes into the track |
| --- | --- |
| Principal, deputy principal | **Administration** |
| Mentors | **Team** |

This is the heart of the method. A level both sides reached separately means
something that a level negotiated in one room does not. If the two tracks were
visible to each other, the first person to answer would set the answer, and the
exercise would produce agreement rather than information.

Every assessment cycle uses both tracks. It is not a first-cycle-only exercise.

### 6.2 Opening a cycle

Principal or deputy: **Dashboard → Start a new cycle**. A mentor cannot open
one — a cycle is the school committing to an assessment period, and that is the
administration's act.

### 6.3 The six steps

The assessment is not one long form. It is six independently saveable steps, so
seven people can work on it over two weeks without blocking each other:

| Step | What it covers |
| --- | --- |
| A | Leadership, Governance and Change Management (A1–A5) |
| B | Teaching, Learning and Assessment (B1–B5) |
| C | Human Capacity and Digital Competence (C1–C4) |
| D | Infrastructure, Platforms and Digital Ecosystem (D1–D5) |
| Infrastructure | The device inventory and the network checklist |
| Review | Everything at a glance, and the confirmation |

Each step shows its own status, so everyone can see what is done, what is
half-done and what nobody has opened:

| Colour | Meaning |
| --- | --- |
| Grey | Nothing entered yet |
| Blue | Some parameters rated, not all |
| Red | All rated, but something required is missing — usually evidence |
| Green | Complete |

### 6.4 Rating a parameter

For each parameter you see its description and the written description of all
six levels. Choose the level that describes the school as it is today, not as it
is meant to become — the plan is where intent belongs.

**From level 2 upward, attach evidence.** A document, a link, a named practice:
whatever a sceptical reader would need in order to believe the rating. A rating
of 2 or more with no evidence turns its step red and will block confirmation.

Your answer is yours: it goes into your side's track, and the other side's
number is not shown to you while you work.

### 6.5 The infrastructure step

Two things that are counted rather than judged:

- **Devices** — how many of each kind the school has. Compared against the
  Order 675 Annex 2 quota for a school of this size.
- **Network** — the Annex 5 checklist: whole-school Wi-Fi, separated subnets,
  802.11n, 802.11ac, active firewall, content filtering.

Both feed the Ministry's compliance monitor. Neither affects a maturity rating.

---

## 7. Process B — reconciliation

### 7.1 What this screen is for

The other side's level for a parameter is hidden until you have recorded your
own for it — so this screen fills in as the work is done, and nobody can read
the other column first. Once both sides have finished, the two readings sit
side by side in full and the school works through the differences. This is the conversation the method is
built around: the interesting parameter is not the one both sides rated 3, it is
the one the administration rated 4 and the team rated 1.

Each parameter shows one of four states:

| State | Meaning |
| --- | --- |
| Agree | Both sides recorded the same level |
| Differ | Both sides answered, and the answers are apart — the gap is shown |
| Incomplete | Only one side has answered |
| Empty | Neither side has answered |

### 7.2 Settling a level

The principal or the deputy records the agreed level for each parameter, after
the discussion. Mentors see the screen and cannot settle it — the agreement is
signed by the administration, and the audit log records who signed.

Two rules make this honest:

- **Silence is not agreement.** A parameter neither side answered is not settled
  by leaving it alone; it has to be discussed and recorded like any other.
- **Agreeing is a positive act.** Even where both sides already wrote 3, the
  agreed level is a separate recorded answer. It is what the confirmed cycle,
  the plan and every public document are built from.

### 7.3 Every parameter, without exception

**All nineteen must be settled before a cycle can be confirmed.** There is no
"resolve later". An unreconciled disagreement quietly becoming the official
record is precisely the failure the two-track design exists to prevent, so the
platform sends you back to this screen with the outstanding codes listed.

Cycles assessed before the two-track design existed are shown as such and are
not retro-fitted with a disagreement they never had.

---

## 8. Process C — confirming and publishing the assessment

### 8.1 Confirming

Principal or deputy: **Review → Confirm**. The platform checks two things and
refuses if either fails:

1. Every parameter has an agreed level.
2. Every agreed level of 2 or above has evidence.

Confirming settles what the school found. It is what the DigiPlan is built on,
and a cycle cannot carry a plan until it is confirmed.

### 8.2 Publishing

**Confirming and publishing are two different acts.** Confirming settles the
finding; publishing decides that the general public may read it.

The Ministry, the partners and the school's metamentor see a confirmed
assessment either way — the gate is only on the public tier. The principal or
deputy publishes, and can withdraw again.

On the public page a school that has assessed but not published is described
that way, and distinguished from a school that has not assessed at all. Telling
a parent the second when the first is true would be a misrepresentation, so the
platform says which is which.

---

## 9. Process D — the DigiPlan

### 9.1 What a DigiPlan is

A two-year development plan built directly on the confirmed assessment.
Opening one creates a row for **all nineteen parameters** — the whole picture,
not a shortlist — each starting at the agreed level and each intending to
**maintain** it.

The school then decides which parameters it will **advance**, and to what level.
Everything not chosen stays as maintaining, which is a real answer: a school
holding level 4 in a domain while it pushes elsewhere is making a decision, and
the plan should say so.

Only the principal or the deputy may open a plan.

### 9.2 Choosing what to develop

The plan's front page lists all nineteen with their current level, their intent,
their target and how many initiatives sit under each. Open a parameter to work
on it.

For each parameter the principal or deputy sets:

- **Intent** — advance, or maintain.
- **Target level** — where the school intends to be in two years. A target at or
  below the current level is not advancing, whatever the button says, and the
  platform records it as maintaining.
- **Rationale** — why, in the school's own words.

### 9.3 What the target requires

The parameter page shows the **general requirements** for the level being aimed
at, taken from the progression model itself. These are not a checklist the
school ticks — they are the description of what a school at that level looks
like, so the initiatives underneath can be judged against something.

### 9.4 Initiatives

Under each parameter, the concrete measures. Any member of the team can write
them; this is the part of the plan the whole school builds.

Each initiative carries:

| Field | Meaning |
| --- | --- |
| Title | What will be done |
| Responsible | Who carries it out — linked to an account where the person has one |
| Supervisor | Who oversees the implementation |
| Deadline | When it is due |
| Status | Not started, in progress, done, dropped |

Naming two people rather than one is deliberate: the person doing the work and
the person answerable for it being done are usually different, and a plan that
records only one of them cannot be followed up.

The plan page flags any parameter set to advance that has no initiatives under
it — a target with nothing behind it is a wish.

### 9.5 KPIs

Under each initiative, the measures. Each has:

- **Measure** — what is being counted ("teachers trained", "sessions per term").
- **Target** — what counts as success, in the school's own words ("80%", "all
  teachers", "twice per term").
- **Result** — filled in later, at report time.

Targets are free text on purpose. Forcing them into a number would either lose
what the school means or invent precision it does not have.

### 9.6 The plan's own details

Period (start and end), funding source, approving authority, and notes on who
was consulted. Principal or deputy.

### 9.7 Publishing the plan

Principal or deputy. The plan document is the formal version — the thing that
goes to the Ministry, the founder and the school's own council.

---

## 10. Process E — implementation and the interim report

### 10.1 During implementation

The team keeps the plan current as it works: initiative statuses move, new
initiatives appear, deadlines shift. Nothing here needs the principal.

### 10.2 The interim report

Due about a year into the plan. The platform does not block you from writing it
early — plans slip in both directions, and a report nobody can prepare is
worse than one prepared ahead of time.

**The report is built from the plan.** Nothing is re-entered. Every initiative
and every measure already in the plan appears, with its target beside it, and
the team records what was actually reached.

### 10.3 What the report does not do

**It never claims a target was met.** Targets and results are both written by
the school in its own words, and deciding whether "all teachers" was achieved by
"62%" is a judgement. Software guessing at it would be confidently wrong in
front of the Ministry.

So the report puts target and result side by side and counts what has been
**recorded**, not what has been achieved. A blank means nobody has said yet —
and the page says exactly that, in those words, so a gap in reporting is never
read as a failed initiative.

### 10.4 The school's account

The narrative — what the numbers do not say: what worked, what did not, what
changes for the year ahead. Written by the principal or the deputy, because it
is the school speaking rather than a total.

### 10.5 Publishing, and the snapshot

The principal or deputy publishes. **Publishing freezes a copy** of every
initiative, measure, target and result exactly as they stand at that moment.

This matters more than it sounds. Implementation carries on after the report
goes out. A report that kept reading the live plan would quietly rewrite
itself — a year-one report would end up describing year two, and a document
already sent to the Ministry would no longer say what was sent. The published
document shows the plan as it was; the working report page shows it as it is
today. Publishing again produces a new frozen version with today's figures.

---

## 11. Process F — the final report and the next cycle

The final report works exactly like the interim one, due at the end of the
second year, and is published the same way.

The cycle then begins again: a new assessment, in two tracks, against the same
nineteen parameters — which is what makes the second cycle's numbers comparable
with the first's, and what turns this from a snapshot into a trajectory. The
school's own history page shows each parameter's movement across cycles.

**A renewal starts empty, not pre-filled.** Both sides rate all nineteen again,
and all nineteen are reconciled again. Last cycle's agreed level is shown beside
each parameter as context, and the platform still works out on its own whether
each one grew, was maintained or decayed — but somebody has to say what the
level is this time. A renewal that carried last cycle's numbers forward would
let a school confirm a new official record without anyone having looked at
anything, and would put the same number in front of both sides before either
had answered, which is exactly what the two tracks exist to prevent.

The equipment data — the device counts and the network checklist — *is* carried
forward. It is an inventory rather than a judgement, and retyping eight numbers
proves nothing.

---

## 12. What the oversight roles do

### 12.1 The metamentor

Sees their school's record live, drafts included, and the national picture
alongside it, so they can tell that school where it stands among the twelve.
They change nothing. Their work is conversation: the platform's job is to make
sure the conversation happens before a mistake is confirmed rather than after.

### 12.2 The metacoordinator

Everything a metamentor sees, plus account management for the group.

### 12.3 The Ministry

- **The national dashboard** — all twelve schools, their status and their
  levels; exportable as CSV.
- **The compliance monitor** — the Order 675 quantitative check: devices against
  the Annex 2 quota, and the Annex 5 network checklist, school by school.
- **A school's page** — that school's full record.

### 12.4 The Territorial Education Agency

The same reading as the Ministry, bounded to its own territory, plus the ability
to flag a school for attention. The boundary is enforced on the data, not just
hidden in the menu.

### 12.5 Partners

The financing partner sees the school overview relevant to what they fund. The
strategic partner sees the training-needs dashboard — where across the twelve
schools professional development is most needed, which is what a training
provider actually has to plan against.

---

## 13. The public tier

`/public-view` needs no account at all. It shows the schools that have chosen to
publish, with their published assessment, in whichever of the three languages
the visitor prefers.

Nothing appears here that a school has not deliberately published. A school that
has assessed but not published says so; a school that has not assessed says
that instead.

---

## 14. Reporting a problem

Every signed-in person can report a problem from any page, and the report
carries the page it was sent from, so a developer knows where to look. Reporting
a broken page is not a privilege attached to one kind of account: whoever hits
the thing that is wrong is the person best placed to describe it.

Developers see the whole backlog and move tickets through it.

---

## 15. Administration

- **Accounts** — create, rename, activate and deactivate; reset a password;
  grant and revoke individual capabilities per post. An administrator can never
  create an account more capable than their own.
- **Schools** — provisioned from the national SIME register.
- **The audit log** — every administrative act, every confirmation, every
  publication, every claimed identity, with who did it and when.

---

## 16. Rules that hold everywhere

1. **The school owns its record.** No role outside the school can change a
   school's assessment, plan or report. Oversight reads.
2. **One account, one person** — for school-level accounts.
3. **Evidence from level 2 upward**, enforced at confirmation.
4. **Level 0 is an answer.** A blank is not.
5. **Both tracks, every cycle.** The two readings stay apart until someone
   reconciles them.
6. **Every parameter reconciled** before a cycle can be confirmed.
7. **Confirming ≠ publishing.** Two acts, both the administration's.
8. **Published documents are frozen.** The live record keeps moving; the
   document that was sent out does not.
9. **Nothing claims success it cannot prove.** Where the platform cannot judge,
   it presents both sides and says what has been recorded.
10. **Nobody is deleted.** Deactivation preserves the record of who did what.

---

## 17. Quick reference

### 17.1 Who may do what

| Action | Principal | Deputy | Mentor | Metamentor | Oversight |
| --- | :---: | :---: | :---: | :---: | :---: |
| Open an assessment cycle | ● | ● | | | |
| Rate parameters, attach evidence | ● | ● | ● | | |
| Fill the device and network data | ● | ● | ● | | |
| Settle a reconciled level | ● | ● | | | |
| Confirm a cycle | ● | ● | | | |
| Publish the assessment | ● | ● | | | |
| Open a DigiPlan | ● | ● | | | |
| Set a parameter's intent and target | ● | ● | | | |
| Write initiatives and KPIs | ● | ● | ● | | |
| Record what a measure reached | ● | ● | ● | | |
| Write the report narrative | ● | ● | | | |
| Publish the plan or a report | ● | ● | | | |
| Create and manage school accounts | ● | ● | | | |
| Read the school's record | ● | ● | ● | ● | ● |

### 17.2 The states a cycle passes through

| State | Reached by | Means |
| --- | --- | --- |
| Draft | Opening a cycle | Both tracks are being written |
| Reconciling | Both sides finished | Differences are being settled |
| Confirmed | Principal or deputy confirms | The agreed record; a plan may now be opened |
| Published | Principal or deputy publishes | Visible on the public tier |

### 17.3 Where things live

| Screen | Path |
| --- | --- |
| School dashboard | `/school` |
| An assessment step | `/school/cycles/<id>/step/<A\|B\|C\|D\|infra\|review>` |
| Reconciliation | `/school/cycles/<id>/reconcile` |
| The DigiPlan | `/school/cycles/<id>/plan` |
| One parameter of the plan | `/school/cycles/<id>/plan/parameter/<code>` |
| The plan document | `/school/cycles/<id>/plan/document` |
| A report | `/school/cycles/<id>/plan/report/<INTERIM\|FINAL>` |
| School accounts | `/school/accounts` |
| The school's history | `/school/history` |
| National dashboard | `/ministry` |
| Compliance monitor | `/ministry/compliance` |
| Territorial dashboard | `/territorial` |
| Public tier | `/public-view/schools` |

Paths are shown without the workspace prefix. In the browser they carry one
(`/w/12/school/...`) when you hold more than one post.
