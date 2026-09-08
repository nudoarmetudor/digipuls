// A small fixed-window rate limiter.
//
// In-memory and therefore per-process, which is honest about what this
// deployment is: a single Passenger/lsnode process on shared hosting. If the
// app is ever run on more than one process this needs to move to the database
// or a shared store — noted in ROADMAP.md rather than pretended away.
//
// Two things the previous version got wrong, both fixed here:
//
//   * It keyed only on IP+login, so an attacker trying one password against
//     five hundred different logins was never throttled once. Password
//     spraying is the attack that actually works against a directory of
//     predictable logins, so there is now an IP-only counter alongside the
//     per-account one.
//   * Its Map was never pruned. Every distinct login anyone submitted stayed
//     resident for the life of the process, which is a memory-exhaustion
//     lever an anonymous client can pull. Entries are now evicted.

const DEFAULT_MAX_KEYS = 20000;

function createLimiter({ windowMs, max, maxKeys = DEFAULT_MAX_KEYS }) {
  const hits = new Map(); // key -> { count, windowStart }

  function prune(now) {
    for (const [k, entry] of hits) {
      if (now - entry.windowStart >= windowMs) hits.delete(k);
    }
    // Pruning only removes *expired* windows, so a flood of live keys can
    // still grow the map. If it is still over the cap afterwards, drop the
    // oldest — insertion order is Map's iteration order. Losing the oldest
    // counters means an attacker at that scale gets a few extra attempts;
    // running the process out of memory would give them the whole site.
    if (hits.size > maxKeys) {
      const excess = hits.size - maxKeys;
      let i = 0;
      for (const k of hits.keys()) {
        if (i++ >= excess) break;
        hits.delete(k);
      }
    }
  }

  return {
    /** True when this key is over its limit for the current window. */
    exceeded(key) {
      const entry = hits.get(key);
      if (!entry) return false;
      if (Date.now() - entry.windowStart >= windowMs) {
        hits.delete(key);
        return false;
      }
      return entry.count >= max;
    },

    record(key) {
      const now = Date.now();
      // Amortised cleanup: cheap, and it means no timer has to be kept alive
      // in a process the host may suspend at any moment.
      if (hits.size > maxKeys / 2) prune(now);
      const entry = hits.get(key);
      if (!entry || now - entry.windowStart >= windowMs) {
        hits.set(key, { count: 1, windowStart: now });
      } else {
        entry.count += 1;
      }
    },

    clear(key) {
      hits.delete(key);
    },

    // Test seam.
    size() { return hits.size; },
    reset() { hits.clear(); },
  };
}

/**
 * Express middleware form, for endpoints where every request counts (rather
 * than only the failures, as at login).
 */
function throttle({ windowMs, max, keyFn = (req) => req.ip, message = 'rate_limited' }) {
  const limiter = createLimiter({ windowMs, max });
  return (req, res, next) => {
    const key = keyFn(req);
    if (limiter.exceeded(key)) {
      const t = res.locals.t || ((k) => k);
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).render('error', {
        title: t('err_rate_limited_title'),
        message: t(message),
      });
    }
    limiter.record(key);
    return next();
  };
}

module.exports = { createLimiter, throttle };
