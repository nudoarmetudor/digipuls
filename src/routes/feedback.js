const express = require('express');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const {
  STATUSES, SEVERITIES, CLOSED_STATUSES, buildTicketData, developerBlock,
} = require('../services/feedbackContext');

const router = express.Router();

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

// The overlay POSTs here as JSON. Also reachable as a normal form post from
// /feedback/new, so someone with JavaScript disabled — or on a page where the
// overlay can't help — can still file a report.
router.post('/tickets', requireCapability('feedback.submit'), async (req, res) => {
  const built = buildTicketData(req.body, {
    authorId: req.session.user.id,
    lang: req.lang,
  });

  const wantsJson = req.get('accept') && req.get('accept').includes('application/json');

  if (!built.ok) {
    if (wantsJson) return res.status(400).json({ ok: false, error: built.error });
    return res.status(400).render('feedback/new', {
      title: res.locals.t('feedback_new_title'),
      severities: SEVERITIES,
      errorMessage: res.locals.t('feedback_err_comment'),
      body: req.body,
    });
  }

  const ticket = await prisma.feedbackTicket.create({ data: built.data });
  await logAction(req.session.user.id, 'FEEDBACK_SUBMITTED', 'FeedbackTicket', ticket.id, ticket.route);

  if (wantsJson) {
    return res.status(201).json({
      ok: true,
      id: ticket.id,
      // Echoed back so the overlay can confirm what was actually recorded
      // rather than what it thought it sent — the i18n keys in particular are
      // resolved on the server.
      i18nKeys: ticket.i18nKeys,
      viewName: ticket.viewName,
    });
  }
  res.redirect('/feedback?submitted=' + ticket.id);
});

// Manual fallback form.
router.get('/new', requireCapability('feedback.submit'), (req, res) => {
  res.render('feedback/new', {
    title: res.locals.t('feedback_new_title'),
    severities: SEVERITIES,
    errorMessage: null,
    body: { route: req.query.route || '' },
  });
});

// ---------------------------------------------------------------------------
// The submitter's own panel
// ---------------------------------------------------------------------------

router.get('/', requireCapability('feedback.submit', 'feedback.triage'), async (req, res) => {
  const tickets = await prisma.feedbackTicket.findMany({
    where: { authorId: req.session.user.id },
    orderBy: [{ createdAt: 'desc' }],
    include: { triagedBy: { select: { name: true } } },
  });

  const open = tickets.filter((t) => !CLOSED_STATUSES.includes(t.status)).length;
  res.render('feedback/mine', {
    title: res.locals.t('feedback_mine_title'),
    wide: true,
    tickets,
    openCount: open,
    closedCount: tickets.length - open,
    submittedId: req.query.submitted ? Number(req.query.submitted) : null,
  });
});

// ---------------------------------------------------------------------------
// The developer backlog
// ---------------------------------------------------------------------------

router.get('/backlog', requireCapability('feedback.triage'), async (req, res) => {
  const { status, severity, author } = req.query;
  const where = {};
  if (STATUSES.includes(status)) where.status = status;
  else if (status === 'open') where.status = { notIn: CLOSED_STATUSES };
  if (SEVERITIES.includes(severity)) where.severity = severity;
  if (author && Number.isInteger(Number(author))) where.authorId = Number(author);

  const [tickets, authors, counts] = await Promise.all([
    prisma.feedbackTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { author: { select: { id: true, name: true, role: true } }, triagedBy: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { feedbackTickets: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.feedbackTicket.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const byStatus = {};
  counts.forEach((c) => { byStatus[c.status] = c._count._all; });

  res.render('feedback/backlog', {
    title: res.locals.t('feedback_backlog_title'),
    wide: true,
    tickets: tickets.map((t) => ({ ...t, block: developerBlock(t) })),
    authors,
    byStatus,
    totalCount: counts.reduce((sum, c) => sum + c._count._all, 0),
    statuses: STATUSES,
    severities: SEVERITIES,
    query: req.query,
  });
});

router.post('/backlog/:id', requireCapability('feedback.triage'), async (req, res) => {
  const id = Number(req.params.id);
  const { status, developerNote } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).render('error', {
      title: res.locals.t('err_not_found'),
      message: res.locals.t('feedback_err_status'),
    });
  }

  const nowClosed = CLOSED_STATUSES.includes(status);
  const existing = await prisma.feedbackTicket.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('feedback_err_missing') });
  }

  await prisma.feedbackTicket.update({
    where: { id },
    data: {
      status,
      developerNote: developerNote && developerNote.trim() ? developerNote.trim().slice(0, 4000) : null,
      triagedById: req.session.user.id,
      // Stamped when it first closes, cleared if it is reopened, so "how long
      // was this open" stays answerable.
      resolvedAt: nowClosed ? (existing.resolvedAt || new Date()) : null,
    },
  });
  await logAction(req.session.user.id, 'FEEDBACK_TRIAGED', 'FeedbackTicket', id, status);
  res.redirect('/feedback/backlog?updated=' + id + (req.query.status ? `&status=${req.query.status}` : ''));
});

module.exports = router;
