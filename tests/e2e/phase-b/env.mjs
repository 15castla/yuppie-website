// Phase B defaults, set before the shared Phase A helpers load (lib.mjs imports this first): this build's
// port (the foundation's is 3241) and the foundation's test prefix (bf.). Another agent sets PHASE_B_BASE
// and PHASE_B_TAG (bo. bm. bn. ba.) to run the same scripts against its own build. The server must be
// started with the same ADMIN_ALERTS_EMAIL (server.sh in this folder does).
process.env.PHASE_A_BASE = process.env.PHASE_B_BASE || 'http://localhost:3241';
process.env.PHASE_A_TAG = process.env.PHASE_B_TAG || 'bf.';
process.env.ADMIN_ALERTS_EMAIL = process.env.ADMIN_ALERTS_EMAIL || 'bf.alerts@example.com';
