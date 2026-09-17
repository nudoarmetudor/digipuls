// The documents a school produces, for the people who support and oversee it.
//
// A metamentor, the Ministry and the district could see a school's levels and
// the targets of its plan, and nothing of the substance: not the evidence, not
// the initiatives, not the published reports. The printable documents already
// existed on the school's side; these routes serve the same templates to the
// supervisors, read-only, within the same scope as the school's detail page.
//
// Mounted inside the ministry and territorial routers, so each inherits its
// router's capability check; the school-level scope is checked here.

const express = require('express');
const prisma = require('../config/db');
const { coversSchool } = require('../middleware/workspace');
const { getIndicatorData } = require('../data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { loadPlan, planRows, planSummary } = require('../services/planService');
const { REPORT_KINDS } = require('../services/reportService');
const { summariseDomains, isEvidenceLink } = require('../services/assessmentSummary');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');

module.exports = function oversightDocuments({ deniedKey }) {
  const router = express.Router();

  function notFound(res) {
    res.status(404).render('error', {
      title: res.locals.t('err_not_found'), message: res.locals.t('err_cycle_not_found'),
    });
    return null;
  }

  /** The cycle, if it is this school's, confirmed, and within the reader's scope. */
  async function loadCycle(req, res) {
    const schoolId = Number(req.params.id);
    const cycleId = Number(req.params.cycleId);
    if (!Number.isInteger(schoolId) || !Number.isInteger(cycleId)) return notFound(res);
    const cycle = await prisma.assessmentCycle.findUnique({
      where: { id: cycleId },
      include: {
        school: { include: { territory: true } },
        ratings: {
          where: { track: 'AGREED' },
          include: {
            evidences: { include: { addedBy: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } },
          },
        },
        deviceInventory: true,
        networkChecklist: true,
        plan: { include: { priorities: true } },
      },
    });
    if (!cycle || cycle.schoolId !== schoolId) return notFound(res);
    if (!coversSchool(req, cycle.school)) {
      res.status(403).render('error', {
        title: res.locals.t('err_access_denied'), message: res.locals.t(deniedKey),
      });
      return null;
    }
    // The official record only. A draft is the school's working space; its
    // progress is already summarised on the detail page.
    if (cycle.status !== 'CONFIRMED') return notFound(res);
    return cycle;
  }

  router.get('/schools/:id/cycles/:cycleId/assessment', async (req, res) => {
    const cycle = await loadCycle(req, res);
    if (!cycle) return undefined;
    const localeData = getIndicatorData(req.lang);
    return res.render('school/assessment-document', {
      title: res.locals.t('assessment_doc_title'),
      layout: false,
      school: cycle.school,
      cycle,
      draft: false,
      summary: summariseDomains(cycle.ratings, localeData.INDICATORS, localeData.DOMAINS),
      wheelSvg: renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS,
        cycle.plan ? cycle.plan.priorities : null), { mode: 'indicators', t: res.locals.t }),
      deviceCompliance: cycle.deviceInventory ? checkDeviceCompliance(cycle.school, cycle.deviceInventory) : null,
      networkCompliance: checkNetworkCompliance(cycle.networkChecklist),
      isEvidenceLink,
    });
  });

  router.get('/schools/:id/cycles/:cycleId/plan', async (req, res) => {
    const cycle = await loadCycle(req, res);
    if (!cycle) return undefined;
    const plan = await loadPlan(cycle.id);
    if (!plan) return notFound(res);
    const rows = planRows(plan, getIndicatorData(req.lang).INDICATORS);
    return res.render('school/plan-document', {
      title: res.locals.t('plan_title'), layout: false,
      school: cycle.school, cycle, plan, rows, summary: planSummary(rows),
    });
  });

  router.get('/schools/:id/cycles/:cycleId/report/:kind', async (req, res) => {
    const kind = String(req.params.kind || '').toUpperCase();
    if (!REPORT_KINDS.includes(kind)) return notFound(res);
    const cycle = await loadCycle(req, res);
    if (!cycle) return undefined;
    const plan = await prisma.developmentPlan.findUnique({ where: { cycleId: cycle.id } });
    const report = plan
      ? await prisma.planReport.findUnique({ where: { planId_kind: { planId: plan.id, kind } } })
      : null;
    // Published reports only: an unpublished one is still being written.
    if (!report || !report.publishedAt) {
      return res.status(404).render('error', {
        title: res.locals.t('report_err_unpublished_title'),
        message: res.locals.t('report_err_unpublished'),
      });
    }
    return res.render('school/report-document', {
      title: res.locals.t(`report_title_${kind}`), layout: false,
      school: cycle.school, cycle, plan, report, snapshot: report.snapshot,
    });
  });

  return router;
};
