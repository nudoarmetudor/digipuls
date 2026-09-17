// Sessions kept in the database rather than in the server's memory.
//
// The hosting runs the app as processes it starts and stops on its own: every
// deploy replaces them, and between deploys it recycles them — on 17 September
// the two processes started at a deploy were gone seven minutes later,
// replaced by one the host had started itself. A session held in a process's
// memory dies with the process, so everyone signed in was signed out, at
// moments nobody chose, often in the middle of filling in a form. Held here,
// a session survives any number of restarts and is the same whichever process
// answers.
//
// Written against the Prisma client the app already has, rather than adding a
// MySQL session library: that would open its own connections to a database
// whose connection budget is shared and small (see src/config/db.js).

const session = require('express-session');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

// express-session touches the session on every request. Writing a new expiry
// each time would turn every page view into a database write; within this
// window the stored expiry is left alone. It is far shorter than the session
// itself, so a session in use never lapses because of it.
const TOUCH_EVERY_MS = 10 * 60 * 1000;

const PRUNE_EVERY_MS = 30 * 60 * 1000;

class PrismaSessionStore extends session.Store {
  /**
   * @param {object} options
   * @param {object} options.client   the Prisma client
   * @param {number} [options.ttlMs]  used when a session carries no cookie expiry
   * @param {boolean} [options.prune] periodically delete expired sessions
   * @param {() => number} [options.now]
   */
  constructor({ client, ttlMs = DEFAULT_TTL_MS, prune = true, now = Date.now } = {}) {
    super();
    this.client = client;
    this.ttlMs = ttlMs;
    this.now = now;
    this.touched = new Map();
    if (prune) {
      this.pruneTimer = setInterval(() => { this.prune().catch(() => {}); }, PRUNE_EVERY_MS);
      // Never keeps the process alive on its own account.
      if (this.pruneTimer.unref) this.pruneTimer.unref();
    }
  }

  expiryFor(sess) {
    const expires = sess && sess.cookie && sess.cookie.expires;
    const at = expires ? new Date(expires).getTime() : NaN;
    return new Date(Number.isFinite(at) ? at : this.now() + this.ttlMs);
  }

  get(sid, callback) {
    this.client.session.findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return callback(null, null);
        if (row.expiresAt.getTime() <= this.now()) {
          return this.destroy(sid, () => callback(null, null));
        }
        let data;
        try {
          data = JSON.parse(row.data);
        } catch (err) {
          // A row that cannot be read is a session that does not exist, not
          // an error page for the person holding its cookie.
          return this.destroy(sid, () => callback(null, null));
        }
        return callback(null, data);
      })
      .catch((err) => callback(err));
  }

  set(sid, sess, callback = () => {}) {
    const expiresAt = this.expiryFor(sess);
    const data = JSON.stringify(sess);
    this.client.session.upsert({
      where: { sid },
      create: { sid, data, expiresAt },
      update: { data, expiresAt },
    })
      .then(() => { this.touched.set(sid, this.now()); callback(null); })
      .catch((err) => callback(err));
  }

  destroy(sid, callback = () => {}) {
    this.touched.delete(sid);
    this.client.session.deleteMany({ where: { sid } })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback = () => {}) {
    const last = this.touched.get(sid);
    if (last !== undefined && this.now() - last < TOUCH_EVERY_MS) return callback(null);
    this.client.session.updateMany({ where: { sid }, data: { expiresAt: this.expiryFor(sess) } })
      .then(() => { this.touched.set(sid, this.now()); callback(null); })
      .catch((err) => callback(err));
    return undefined;
  }

  /** Deletes every expired session. */
  async prune() {
    const cutoff = this.now();
    for (const [sid, at] of this.touched) {
      if (cutoff - at > TOUCH_EVERY_MS) this.touched.delete(sid);
    }
    const { count } = await this.client.session.deleteMany({ where: { expiresAt: { lt: new Date(cutoff) } } });
    return count;
  }

  close() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }
}

module.exports = { PrismaSessionStore, TOUCH_EVERY_MS, DEFAULT_TTL_MS };
