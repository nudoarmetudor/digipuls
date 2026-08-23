const MockSimeProvider = require('./mockSimeProvider');

// Provider selection seam — SIME_PROVIDER=live would require a
// LiveSimeProvider implementing services/sime/simeProvider.interface.js
// against the real SIME API, which this environment does not have
// credentials or documentation for. Selecting "live" today intentionally
// throws, rather than silently falling back to mock data, so the gap is
// loud, not hidden.
function buildProvider() {
  const kind = process.env.SIME_PROVIDER || 'mock';
  if (kind === 'mock') return new MockSimeProvider();
  if (kind === 'live') {
    throw new Error(
      'SIME_PROVIDER=live is not implemented. See src/services/sime/simeProvider.interface.js ' +
        'for the interface a real integration needs to implement, and DigiPuls - additional ' +
        'requirements and open questions resolved.md in the MDSF vault for context.'
    );
  }
  throw new Error(`Unknown SIME_PROVIDER: ${kind}`);
}

module.exports = buildProvider();
