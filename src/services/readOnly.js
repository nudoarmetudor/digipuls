// A switch that stops the platform accepting changes while it stays readable.
//
// Written for moving DigiPuls between servers. The last copy of the database
// has to be taken with nothing still being written to it, and once people are
// using the new server the old one must not quietly accept work that will
// never reach it — DNS changes do not reach every visitor at the same moment,
// so for a while some are still sent to the old address. With the switch on,
// that server shows every page and refuses every change, with a notice that
// says why.
//
// Kept in the database, not in a file or an environment variable, because the
// database is the one thing an operator can always reach: setting it needs one
// UPDATE, from anywhere the database accepts a connection, and no restart.
//
//   INSERT INTO AppSetting (`key`, value, updatedAt) VALUES ('read_only', 'true', NOW(3))
//     ON DUPLICATE KEY UPDATE value = 'true', updatedAt = NOW(3);

const KEY = 'read_only';

// How long a process trusts what it last read. Short enough that switching on
// takes effect within seconds; long enough that a page view is not a query.
const CACHE_MS = 15 * 1000;

// Writes that stay possible while read-only. Signing in and out, and the
// display and language choices, change nothing in anyone's record.
const ALWAYS_ALLOWED = [/^\/login$/, /^\/logout$/, /^\/preferences$/];

function createReadOnlySwitch({ client, now = Date.now, cacheMs = CACHE_MS } = {}) {
  let cached = { value: false, at: -Infinity };

  async function isReadOnly() {
    if (now() - cached.at < cacheMs) return cached.value;
    try {
      const row = await client.appSetting.findUnique({ where: { key: KEY } });
      cached = { value: !!row && String(row.value).trim().toLowerCase() === 'true', at: now() };
    } catch (err) {
      // A database that cannot be read cannot be written either; there is
      // nothing to protect, and failing open keeps the error pages honest
      // about what actually went wrong.
      cached = { value: false, at: now() };
    }
    return cached.value;
  }

  function middleware(req, res, next) {
    isReadOnly().then((on) => {
      res.locals.readOnly = on;
      if (!on) return next();
      const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (!writes || ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next();
      const t = res.locals.t || ((k) => k);
      res.set('Retry-After', '600');
      return res.status(503).render('error', {
        title: t('read_only_title'),
        message: t('read_only_refused'),
      });
    }).catch(next);
  }

  return { isReadOnly, middleware };
}

module.exports = { createReadOnlySwitch, KEY, CACHE_MS };
