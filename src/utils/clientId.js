// Can this deployment tell one visitor from another?
//
// On the production host it cannot. Every request arrives with
//
//     x-real-ip:       185.57.47.13
//     x-forwarded-for: 185.57.47.13, 185.57.47.13,185.57.47.13
//
// — the same address three times, and it is the CDN edge rather than anyone's
// browser. That was established the hard way: a request from another continent
// was refused by a rate limit this workstation had just tripped.
//
// The consequence is that any per-address limit is really a global one. Before
// this was understood, the public tier was capped at 60 requests a minute and
// login at 40 failures per 15 minutes — for everybody at once. A room of twelve
// meta-mentors mistyping their one-time passwords would have locked out the
// pilot, and a single crawler would have taken the public pages down.
//
// So the limits below are deliberately global and generous, and the code says
// so rather than pretending to be per-client.
//
// If the hosting is later changed so the real client address arrives — turning
// off the CDN in hPanel, or configuring it to pass a client-IP header —
// set TRUST_CLIENT_IP=true and the same limits become per-client with no other
// change. The default is off because claiming to distinguish clients when you
// cannot is worse than admitting you cannot.

// Reading the switch.
//
// It was `=== 'true'`, and the first time anyone set it the panel wrote
// TRUST_CLIENT_IP='TRUE'. Uppercase. The comparison failed, the flag stayed
// off, and nothing said so: the setting looked right in the panel and did
// nothing at all. A security control that silently declines to switch on is
// worse than one that is plainly off, because someone believes it is running.
//
// So: any ordinary spelling of yes turns it on, any ordinary spelling of no
// leaves it off, and anything else is shouted about at startup rather than
// quietly read as no.
const ON = ['true', '1', 'yes', 'on'];
const OFF = ['false', '0', 'no', 'off', ''];

function readSwitch(raw) {
  const value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  if (ON.includes(value)) return true;
  if (OFF.includes(value)) return false;
  console.warn(
    `[clientId] TRUST_CLIENT_IP is set to ${JSON.stringify(raw)}, which is neither `
    + `${ON.join('/')} nor ${OFF.join('/')}. Treating it as off, so every rate limit `
    + 'stays global. Set it to "true" if that is not what you meant.');
  return false;
}

const TRUST = readSwitch(process.env.TRUST_CLIENT_IP);

/**
 * A key to count against.
 *
 * @returns {string} the client's address when this deployment can actually
 *   see one, otherwise the constant "all" — which makes every limit global,
 *   visibly and on purpose.
 */
function clientId(req) {
  if (!TRUST) return 'all';
  return req.ip || 'all';
}

/** True when limits are shared by every visitor, so callers can size them. */
const limitsAreGlobal = !TRUST;

module.exports = { clientId, limitsAreGlobal, TRUST_CLIENT_IP: TRUST, readSwitch };
