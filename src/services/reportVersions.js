// Which published version of a report a document shows.

const prisma = require('../config/db');

/**
 * The current version, or an earlier one by id — provided it belongs to this
 * report, so a version id typed into the URL cannot open another school's.
 *
 * @returns {Promise<null|{report, snapshot, version, isEarlier}>}
 */
async function reportVersionFor(report, versionParam) {
  if (!report || !report.publishedAt) return null;
  if (versionParam === undefined || versionParam === '') {
    return { report, snapshot: report.snapshot, version: null, isEarlier: false };
  }
  const id = Number(versionParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  const version = await prisma.planReportVersion.findUnique({ where: { id } });
  if (!version || version.reportId !== report.id) return null;
  return {
    report: { ...report, publishedAt: version.publishedAt },
    snapshot: version.snapshot,
    version,
    isEarlier: version.publishedAt.getTime() !== new Date(report.publishedAt).getTime(),
    currentPublishedAt: report.publishedAt,
  };
}

module.exports = { reportVersionFor };
