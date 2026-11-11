'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const express = require('express');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { getLogs, tamperRow, intents, DB_PATH } = require('./db');
const {
  purchaseRoute,
  createPurchaseRoute,
  approveRoute,
  rejectRoute,
} = require('./paypal/purchaseRoute');
const captureRoute = require('./paypal/captureRoute');
const webhookRoute = require('./paypal/webhookRoute');
const { verifyChain } = require('./security/auditChain');
const { buildDisputeEvidenceBundle } = require('./security/disputeEvidence');
const { setAttackMode, getAttackMode, listPublicCatalog } = require('./catalog/attackStorefront');
const { computeDashboardCounters } = require('./agents/shopperAgent');

function demoAllowed(kind) {
  if (process.env.NODE_ENV !== 'production') return true;
  if (kind === 'tamper') return process.env.WARDEN_DEMO_TAMPER === '1';
  return process.env.WARDEN_ENABLE_DEMO_ROUTES === '1';
}

function publicIntent(row) {
  if (!row) return null;
  const { approval_token_hash, ...safe } = row;
  return safe;
}

function createApp(options = {}) {
  const app = express();
  const origin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : process.env.NODE_ENV === 'production'
      ? false
      : true;

  app.use(cors({ origin }));
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      sandbox: true,
      demo_routes_enabled: demoAllowed('attack'),
      demo_tamper_enabled: demoAllowed('tamper'),
    });
  });

  app.get('/api/logs', (req, res) => {
    res.json(getLogs());
  });

  app.get('/api/metrics', (req, res) => {
    const logs = getLogs();
    const counters = computeDashboardCounters(logs);
    const decisions = { ALLOW: 0, ASK_HUMAN: 0, DENY: 0 };
    for (const row of logs) {
      if (decisions[row.decision] !== undefined) decisions[row.decision] += 1;
    }
    const captured = logs.filter((row) => row.payment_status === 'CAPTURED');
    const spent = captured.reduce((sum, row) => sum + Number(row.checkout_amount || 0), 0);
    res.json({
      ...counters,
      total_spent: Number(spent.toFixed(2)),
      decisions,
      captured: captured.length,
      intents: intents.list().length,
      attack_mode: getAttackMode(),
      chain: verifyChain(),
    });
  });

  app.get('/api/catalog', (req, res) => {
    res.json({ products: listPublicCatalog(), attack_mode: getAttackMode() });
  });

  app.get('/api/intents', (req, res) => {
    res.json(intents.list().map(publicIntent));
  });

  app.get('/api/intents/:id', (req, res) => {
    const row = intents.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'unknown intent' });
    res.json(publicIntent(row));
  });

  app.get('/api/paypal/config', (req, res) => {
    res.json({
      clientId: process.env.PAYPAL_CLIENT_ID || null,
      currency: 'USD',
      sandbox: true,
    });
  });

  app.get('/api/audit/verify', (req, res) => {
    res.json(verifyChain());
  });

  app.get('/api/audit/:id/evidence', (req, res) => {
    const logs = getLogs();
    const row = logs.find((entry) => String(entry.id) === String(req.params.id));
    if (!row) return res.status(404).json({ error: 'audit row not found' });
    res.json(buildDisputeEvidenceBundle(row, logs));
  });

  app.get('/api/scenarios', (req, res) => {
    const { DEMO_SCENARIOS } = require('./agents/shopperAgent');
    res.json(Object.values(DEMO_SCENARIOS).map(s => ({
      scenario_key: s.scenario_key,
      button_label: s.button_label,
      badge_color: s.badge_color,
    })));
  });

  app.get('/api/audit/:id/evidence/html', (req, res) => {
    const { generatePrintableDisputeHTML } = require('./security/disputeEvidence');
    const logs = getLogs();
    const row = logs.find((entry) => String(entry.id) === String(req.params.id));
    if (!row) return res.status(404).json({ error: 'audit row not found' });
    const bundle = buildDisputeEvidenceBundle(row, logs);
    const html = generatePrintableDisputeHTML(bundle);
    res.type('html').send(html);
  });

  app.post(
    '/api/purchase',
    options.purchaseDeps ? createPurchaseRoute(options.purchaseDeps) : purchaseRoute
  );
  app.post('/api/purchase/approve', approveRoute);
  app.post('/api/purchase/reject', rejectRoute);
  app.post('/api/paypal/capture', captureRoute);
  app.post('/api/paypal/webhook', webhookRoute);

  app.post('/api/shop', async (req, res) => {
    try {
      const { runDemoScenario, runWardenPipeline, DEMO_SCENARIOS } = require('./agents/shopperAgent');
      const scenario = req.body && req.body.scenario_key;
      const prompt = req.body && req.body.user_prompt;
      if (scenario && !Object.prototype.hasOwnProperty.call(DEMO_SCENARIOS, scenario)) {
        return res.status(400).json({ error: 'unknown scenario_key' });
      }
      if (!scenario && (typeof prompt !== 'string' || !prompt.trim())) {
        return res.status(400).json({ error: 'user_prompt or scenario_key is required' });
      }
      if (!scenario && prompt.length > 1000) {
        return res.status(400).json({ error: 'user_prompt must be at most 1000 characters' });
      }
      const result = scenario
        ? await runDemoScenario(scenario, {
            execute: true,
            purchaseDeps: options.purchaseDeps,
          })
        : await runWardenPipeline(prompt, {
            execute: true,
            purchaseDeps: options.purchaseDeps,
          });
      const purchase = result.purchase || { httpStatus: 200, body: result };
      const pe = (result.evaluated_intent && result.evaluated_intent.policy_evaluation) || {};
      const evaluated = result.evaluated_intent || {};
      res.status(purchase.httpStatus || 200).json({
        ...purchase.body,
        scenario_key: result.scenario_key,
        agent_reasoning: result.agent_reasoning,
        agent_proposal: result.agent_proposal || null,
        quarantine_extracted: evaluated.quarantine_extracted || null,
        checkout_verification: evaluated.checkout_verification || null,
        intent_alignment_pass: evaluated.intent_alignment_pass ?? null,
        untrusted_raw_html_preview: result.untrusted_raw_html_preview || null,
        tools_exposed_to_agent: result.tools_exposed_to_agent || null,
        policy_evaluation: {
          decision: pe.decision || purchase.body.decision,
          reason: pe.reason || purchase.body.reason,
          risk_score: pe.risk_score ?? purchase.body.risk_score ?? null,
          rules_checked: pe.rules_checked || purchase.body.rules_checked || null,
        },
      });
    } catch (err) {
      console.error('shop error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.post('/api/demo/attack', (req, res) => {
    if (!demoAllowed('attack')) {
      return res.status(403).json({ error: 'Demo attack route is disabled' });
    }
    const { drift, injection } = req.body || {};
    if (drift !== undefined && typeof drift !== 'boolean') {
      return res.status(400).json({ error: 'drift must be a boolean' });
    }
    if (injection !== undefined && typeof injection !== 'boolean') {
      return res.status(400).json({ error: 'injection must be a boolean' });
    }
    if (typeof drift !== 'boolean' && typeof injection !== 'boolean') {
      return res.status(400).json({ error: 'drift must be a boolean' });
    }
    res.json({ ok: true, attack_mode: setAttackMode({ drift, injection }) });
  });

  // Demo-only. Refuses to run in production unless WARDEN_DEMO_TAMPER=1.
  app.post('/api/demo/tamper', (req, res) => {
    if (!demoAllowed('tamper')) {
      return res.status(403).json({ error: 'Demo tamper route is disabled' });
    }
    const id = Number(req.body && req.body.id);
    const amount = Number(req.body && req.body.amount);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(amount)) {
      return res.status(400).json({ error: 'id and amount are required' });
    }
    const changed = tamperRow(id, amount);
    if (!changed) return res.status(404).json({ error: 'audit row not found' });
    res.json({
      ok: true,
      warning: 'Demo-only tamper applied. Historical hashes were not updated. Call /api/audit/verify.',
    });
  });

  app.post('/api/demo/reset', (req, res) => {
    if (!demoAllowed('attack')) {
      return res.status(403).json({ error: 'Demo routes are disabled' });
    }
    const { resetPolicyState } = require('./agents/shopperAgent');
    const { setAttackMode } = require('./catalog/attackStorefront');
    resetPolicyState();
    setAttackMode({ drift: false, injection: true });
    res.json({ ok: true, attack_mode: { drift: false, injection: true } });
  });

  const frontendDist = path.resolve(__dirname, '../frontend/dist');
  if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist, { index: false }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON request body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Warden listening on port ${port}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
}

module.exports = { app, createApp };
