'use strict';

// Offline integration tests. No PayPal network calls.
const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `warden-backend-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
delete process.env.PAYPAL_WEBHOOK_ID;

const { evaluate, POLICY_RULES } = require('./security/policyEngine');
const { verifyChain } = require('./security/auditChain');
const storefront = require('./catalog/attackStorefront');
const {
  processPurchase,
  approvePurchase,
  rejectPurchase,
} = require('./paypal/purchaseRoute');
const { processCapture } = require('./paypal/captureRoute');
const { processWebhook } = require('./paypal/webhookRoute');
const { createRequestId } = require('./paypal/paypalExecutor');
const { db, intents } = require('./db');
const {
  runDemoScenario,
  runWardenPipeline,
  SHOPPER_TOOLS,
} = require('./agents/shopperAgent');
const { createApp } = require('./server');

const calls = [];
const captures = [];
const orders = new Map();
const paypalDep = {
  createOrder: async (opts) => {
    calls.push(opts);
    const id = `ORDER-${orders.size + 1}`;
    orders.set(id, {
      amount: Number(opts.amount).toFixed(2),
      currency: opts.currency,
      status: 'APPROVED',
    });
    return { id, status: 'CREATED', approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` };
  },
  getOrderDetails: async (id) => {
    const o = orders.get(id);
    if (!o) throw new Error('missing order');
    return {
      id,
      status: o.status,
      amount: o.amount,
      currency: o.currency,
      captureId: o.captureId || null,
      captureStatus: o.status === 'COMPLETED' ? 'COMPLETED' : null,
    };
  },
  captureOrder: async (id) => {
    captures.push(id);
    const o = orders.get(id);
    if (!o) throw new Error('missing order');
    if (o.status !== 'COMPLETED') {
      o.status = 'COMPLETED';
      o.captureId = `CAP-${id}`;
    }
    return {
      status: 'COMPLETED',
      purchaseUnits: [
        {
          captureId: o.captureId,
          captureStatus: 'COMPLETED',
          amount: o.amount,
          currency: o.currency,
        },
      ],
    };
  },
};

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

const body = (q, extra = {}) => ({
  user_prompt: `Buy ${q.product_name || q.product_id || 'product'}`,
  quarantine_extracted: { currency: 'USD', injection_detected: false, ...q },
  ...extra,
});

(async () => {
  const baseIntent = {
    quarantine_extracted: {
      product_id: 'prod_sec_key_01',
      merchant_id: 'merch_technova',
      quoted_price: 45,
      currency: 'USD',
      injection_detected: false,
    },
    checkout_verification: {
      live_checkout_price: 45,
      price_drift_detected: false,
      currency: 'USD',
      merchant_id: 'merch_technova',
    },
    policy_context: { daily_spent: 0, tx_last_minute: 0 },
    intent_alignment_pass: true,
  };

  const allow = evaluate(baseIntent);
  check('policy ALLOW at $45', allow.decision === 'ALLOW' && allow.risk_score === 5);
  const again = evaluate(baseIntent);
  check('policy is deterministic', JSON.stringify(allow) === JSON.stringify(again));
  const poisoned = evaluate({
    ...baseIntent,
    llm_decision: 'ALLOW',
    quarantine_extracted: { ...baseIntent.quarantine_extracted, injection_detected: true },
  });
  check('LLM decision cannot override injection', poisoned.decision === 'DENY');
  check('invalid intent fails closed', evaluate(null).decision === 'DENY');
  check(
    'missing live checkout fails closed',
    evaluate({ ...baseIntent, checkout_verification: {} }).decision === 'DENY'
  );
  check(
    'caller cannot raise hard cap',
    evaluate({
      ...baseIntent,
      policy_config: { hardTransactionCap: 1000, allowedMerchants: ['merch_technova'] },
      quarantine_extracted: { ...baseIntent.quarantine_extracted, quoted_price: 151 },
      checkout_verification: {
        ...baseIntent.checkout_verification,
        live_checkout_price: 151,
      },
    }).decision === 'DENY'
  );
  check(
    'missing policy context fails closed',
    evaluate({ ...baseIntent, policy_context: undefined }).decision === 'DENY'
  );
  check(
    'daily budget denies',
    evaluate({ ...baseIntent, policy_context: { daily_spent: 280, tx_last_minute: 0 } }).decision === 'DENY'
  );
  check(
    'velocity denies',
    evaluate({ ...baseIntent, policy_context: { daily_spent: 0, tx_last_minute: POLICY_RULES.MAX_TX_PER_MINUTE } }).decision === 'DENY'
  );
  check(
    'alignment denies',
    evaluate({ ...baseIntent, intent_alignment_pass: false }).decision === 'DENY'
  );
  check(
    'ASK_HUMAN at $95',
    evaluate({
      ...baseIntent,
      quarantine_extracted: { ...baseIntent.quarantine_extracted, quoted_price: 95 },
      checkout_verification: { ...baseIntent.checkout_verification, live_checkout_price: 95 },
    }).decision === 'ASK_HUMAN'
  );
  check(
    'shopper tools exclude payment',
    SHOPPER_TOOLS.map((t) => t.function.name).join(',') === 'search_products,propose_purchase'
  );
  check(
    'PayPal request ids are stable and fit Orders API limits',
    createRequestId('capture', 'ORDER-1') === createRequestId('capture', 'ORDER-1') &&
      createRequestId('capture', 'ORDER-1').length <= 38
  );
  const makeModelFetch = (query, productId) => {
    let turn = 0;
    return async (_url, request) => {
      const requestBody = JSON.parse(request.body);
      check(
        'shopper LLM receives only non-payment tools',
        requestBody.tools.map((tool) => tool.function.name).join(',') ===
          'search_products,propose_purchase'
      );
      if (turn > 0) {
        const toolResponse = requestBody.messages.find((message) => message.role === 'tool');
        check(
          'Shopper LLM receives sanitized catalog data only',
          toolResponse && !toolResponse.content.includes('raw_page_description')
        );
      }
      if (turn++ === 0) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                tool_calls: [{
                  id: 'tool-search',
                  function: { name: 'search_products', arguments: JSON.stringify({ query }) },
                }],
              },
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              tool_calls: [{
                id: 'tool-propose',
                function: {
                  name: 'propose_purchase',
                  arguments: JSON.stringify({ product_id: productId, reasoning: 'Matches request' }),
                },
              }],
            },
          }],
        }),
      };
    };
  };
  const modelRun = await runWardenPipeline('Buy a security key', {
    enableShopperLLM: true,
    llmApiKey: 'test-key',
    modelFetch: makeModelFetch('security key', 'prod_sec_key_01'),
  });
  check(
    'Shopper LLM proposal enters the deterministic policy path',
    modelRun.evaluated_intent.policy_evaluation.decision === 'ALLOW'
  );
  const misalignedRun = await runWardenPipeline('Buy a security key', {
    enableShopperLLM: true,
    llmApiKey: 'test-key',
    modelFetch: makeModelFetch('monitor', 'prod_dev_monitor_02'),
  });
  check(
    'misaligned Shopper LLM proposal is denied',
    misalignedRun.evaluated_intent.policy_evaluation.decision === 'DENY'
  );

  const expected = {
    HAPPY_PATH_45: 'ALLOW',
    ASK_HUMAN_95: 'ASK_HUMAN',
    ATTACK_PROMPT_INJECTION: 'DENY',
    ATTACK_PRICE_DRIFT: 'DENY',
  };
  for (const [key, decision] of Object.entries(expected)) {
    const result = await runDemoScenario(key);
    check(
      `shopper ${key}`,
      result.evaluated_intent.policy_evaluation.decision === decision,
      `-> ${result.evaluated_intent.policy_evaluation.decision}`
    );
  }

  storefront.setAttackMode({ drift: false, injection: true });
  const scenarios = [
    { name: 'happy', orders: 1, decision: 'ALLOW', drift: false, q: { product_id: 'prod_sec_key_01', product_name: 'Key', merchant_id: 'merch_technova', quoted_price: 45 } },
    { name: 'human', orders: 1, decision: 'ASK_HUMAN', drift: false, q: { product_id: 'prod_dev_monitor_02', product_name: 'Monitor', merchant_id: 'merch_technova', quoted_price: 95 } },
    { name: 'injection', orders: 0, decision: 'DENY', drift: false, q: { product_id: 'prod_gpu_rig_05', product_name: 'Voucher', merchant_id: 'evil_corp', quoted_price: 499, injection_detected: true } },
    { name: 'drift', orders: 0, decision: 'DENY', drift: true, q: { product_id: 'prod_nvme_ssd_04', product_name: 'SSD', merchant_id: 'merch_shadydeals', quoted_price: 45 } },
  ];

  const saved = {};
  for (const s of scenarios) {
    calls.length = 0;
    storefront.setAttackMode({ drift: s.drift });
    const r = await processPurchase(body(s.q), { paypal: paypalDep });
    saved[s.name] = r;
    check(`${s.name} decision`, r.body.decision === s.decision, `-> ${r.body.decision}`);
    check(`${s.name} paypal calls`, calls.length === s.orders);
    if (s.orders === 1) {
      check(`${s.name} uses live price`, Number(calls[0].amount) === r.body.live_checkout_price);
    }
  }

  calls.length = 0;
  storefront.setAttackMode({ drift: false });
  const spoof = await processPurchase(
    body({ product_id: 'prod_gpu_rig_05', product_name: 'Voucher', merchant_id: 'merch_technova', quoted_price: 499 }),
    { paypal: paypalDep }
  );
  check('spoofed merchant is denied with zero orders', spoof.body.decision === 'DENY' && calls.length === 0);

  const bad = await processPurchase({ user_prompt: 'x' }, { paypal: paypalDep });
  check('invalid purchase body', bad.httpStatus === 400);

  calls.length = 0;
  const replayBody = body({
    product_id: 'prod_sec_key_01',
    product_name: 'Key',
    merchant_id: 'merch_technova',
    quoted_price: 45,
  });
  const firstIdempotent = await processPurchase(replayBody, {
    paypal: paypalDep,
    idempotencyKey: 'same-request-key',
  });
  const replayed = await processPurchase(replayBody, {
    paypal: paypalDep,
    idempotencyKey: 'same-request-key',
  });
  check(
    'idempotency replay returns same order without duplicate',
    calls.length === 1 &&
      replayed.body.intent_id === firstIdempotent.body.intent_id &&
      replayed.body.paypal_order_id === firstIdempotent.body.paypal_order_id
  );

  const approvalBody = body({
    product_id: 'prod_dev_monitor_02',
    product_name: 'Developer monitor',
    merchant_id: 'merch_technova',
    quoted_price: 95,
  });
  const firstApproval = await processPurchase(approvalBody, {
    paypal: paypalDep,
    getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    idempotencyKey: 'approval-token-replay',
  });
  const storedApproval = require('./db').getIdempotent('approval-token-replay');
  const replayedApproval = await processPurchase(approvalBody, {
    paypal: paypalDep,
    idempotencyKey: 'approval-token-replay',
  });
  const oldApprovalToken = approvePurchase({
    intent_id: firstApproval.body.intent_id,
    approval_token: firstApproval.body.approval_token,
  });
  const currentApprovalToken = approvePurchase({
    intent_id: firstApproval.body.intent_id,
    approval_token: replayedApproval.body.approval_token,
  });
  check(
    'idempotency replay rotates an unpersisted one-time approval token',
    !storedApproval.response_json.includes(firstApproval.body.approval_token) &&
      replayedApproval.body.approval_token !== firstApproval.body.approval_token &&
      oldApprovalToken.httpStatus === 403 &&
      currentApprovalToken.httpStatus === 200
  );

  calls.length = 0;
  const staleInjection = await processPurchase(
    body({
      product_id: 'prod_usb_hub_03',
      product_name: 'USB-C Hub',
      merchant_id: 'merch_cyberdock',
      quoted_price: 29,
      injection_detected: false,
    }),
    { paypal: paypalDep }
  );
  check(
    'server-side quarantine defeats spoofed clean flag',
    staleInjection.body.decision === 'DENY' && calls.length === 0
  );

  calls.length = 0;
  const forgedQuote = await processPurchase(
    body({
      product_id: 'prod_sec_key_01',
      product_name: 'Security key',
      merchant_id: 'merch_technova',
      quoted_price: 49,
    }),
    {
      paypal: paypalDep,
      getLiveCheckoutPrice: () => ({
        price: 49,
        currency: 'USD',
        merchant_id: 'merch_technova',
      }),
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    }
  );
  check(
    'client cannot rewrite the server catalog quote to hide drift',
    forgedQuote.body.decision === 'DENY' &&
      forgedQuote.body.price_drift_detected === true &&
      forgedQuote.body.rules_checked.price_drift_pass === false &&
      calls.length === 0
  );

  calls.length = 0;
  const unavailableContext = await processPurchase(replayBody, {
    paypal: paypalDep,
    getPolicyContext: () => {
      throw new Error('database unavailable');
    },
  });
  check(
    'policy context outage fails closed before PayPal',
    unavailableContext.httpStatus === 503 &&
      unavailableContext.body.decision === 'DENY' &&
      calls.length === 0
  );

  const allowIntent = saved.happy.body.intent_id;
  const humanIntent = saved.human.body.intent_id;
  const blocked = await processCapture({ intent_id: humanIntent }, { paypal: paypalDep });
  check('ASK_HUMAN capture blocked before approval', blocked.httpStatus === 409);

  const approved = approvePurchase({ intent_id: humanIntent });
  check('human approval requires a scoped token', approved.httpStatus === 400);
  const invalidApproval = approvePurchase({
    intent_id: humanIntent,
    approval_token: 'invalid',
  });
  check('invalid human approval token rejected', invalidApproval.httpStatus === 403);
  const validApproval = approvePurchase({
    intent_id: humanIntent,
    approval_token: saved.human.body.approval_token,
  });
  check(
    'human approval recorded',
    validApproval.httpStatus === 200 && validApproval.body.human_approved === true
  );
  const humanCap = await processCapture({ intent_id: humanIntent }, { paypal: paypalDep });
  check('ASK_HUMAN captures after approval', humanCap.httpStatus === 200 && humanCap.body.ok === true, JSON.stringify(humanCap.body));

  const rejectionCandidate = await processPurchase(approvalBody, {
    paypal: paypalDep,
    getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
  });
  check(
    'human rejection requires scoped token',
    rejectPurchase({ intent_id: rejectionCandidate.body.intent_id }).httpStatus === 400
  );
  check(
    'human rejection rejects invalid token',
    rejectPurchase({
      intent_id: rejectionCandidate.body.intent_id,
      approval_token: 'invalid',
    }).httpStatus === 403
  );
  const rejected = rejectPurchase({
    intent_id: rejectionCandidate.body.intent_id,
    approval_token: rejectionCandidate.body.approval_token,
  });
  check(
    'human rejection is persisted and audited',
    rejected.httpStatus === 200 &&
      rejected.body.rejected === true &&
      intents.get(rejectionCandidate.body.intent_id).status === 'REJECTED'
  );
  check(
    'rejected intent cannot be captured',
    (await processCapture(
      { intent_id: rejectionCandidate.body.intent_id },
      { paypal: paypalDep }
    )).httpStatus === 409
  );

  const first = await processCapture({ intent_id: allowIntent }, { paypal: paypalDep });
  check('ALLOW capture', first.httpStatus === 200 && first.body.ok === true);
  const second = await processCapture({ intent_id: allowIntent }, { paypal: paypalDep });
  check('double capture rejected', second.httpStatus === 409);

  const missing = await processCapture({}, { paypal: paypalDep });
  check('capture requires intent_id', missing.httpStatus === 400);
  const unknown = await processCapture({ intent_id: 'int_missing' }, { paypal: paypalDep });
  check('unknown intent', unknown.httpStatus === 404);
  const clientOrder = await processCapture({ intent_id: allowIntent, paypal_order_id: 'HACK' }, { paypal: paypalDep });
  check('client order id rejected', clientOrder.httpStatus === 400);
  const clientAmount = await processCapture(
    { intent_id: allowIntent, amount: 0.01 },
    { paypal: paypalDep }
  );
  check('client amount rejected', clientAmount.httpStatus === 400);
  const misaligned = await processPurchase(
    {
      user_prompt: 'Buy the developer monitor',
      quarantine_extracted: {
        product_id: 'prod_sec_key_01',
        product_name: 'Security key',
        merchant_id: 'merch_technova',
        quoted_price: 45,
        currency: 'USD',
        injection_detected: false,
      },
    },
    { paypal: paypalDep, getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }) }
  );
  check(
    'purchase route denies a product unrelated to the prompt',
    misaligned.body.decision === 'DENY'
  );

  const mismatchPaypal = {
    ...paypalDep,
    getOrderDetails: async (id) => ({ id, status: 'APPROVED', amount: '1.00', currency: 'USD' }),
  };
  const extra = await processPurchase(
    body({ product_id: 'prod_sec_key_01', product_name: 'Key', merchant_id: 'merch_technova', quoted_price: 45 }),
    {
      paypal: paypalDep,
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    }
  );
  const mismatch = await processCapture({ intent_id: extra.body.intent_id }, { paypal: mismatchPaypal });
  check(
    'amount mismatch does not capture',
    mismatch.httpStatus === 502 && intents.get(extra.body.intent_id).status === 'CAPTURE_FAILED',
    `http=${mismatch.httpStatus} status=${intents.get(extra.body.intent_id).status}`
  );
  const currencyExtra = await processPurchase(
    body({
      product_id: 'prod_sec_key_01',
      product_name: 'Security key',
      merchant_id: 'merch_technova',
      quoted_price: 45,
    }),
    {
      paypal: paypalDep,
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    }
  );
  const wrongCurrencyPaypal = {
    ...paypalDep,
    captureOrder: async () => ({
      status: 'COMPLETED',
      purchaseUnits: [{
        captureId: 'CAP-WRONG-CURRENCY',
        captureStatus: 'COMPLETED',
        amount: '45.00',
        currency: 'EUR',
      }],
    }),
  };
  const wrongCurrencyCapture = await processCapture(
    { intent_id: currencyExtra.body.intent_id },
    { paypal: wrongCurrencyPaypal }
  );
  check(
    'capture currency mismatch is not marked paid',
    wrongCurrencyCapture.httpStatus === 502 &&
      intents.get(currencyExtra.body.intent_id).status === 'CAPTURE_FAILED'
  );
  const priceCheckIntent = await processPurchase(
    body({
      product_id: 'prod_nvme_ssd_04',
      product_name: 'SSD',
      merchant_id: 'merch_shadydeals',
      quoted_price: 45,
    }),
    {
      paypal: paypalDep,
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    }
  );
  const capturesBeforeDrift = captures.length;
  storefront.setAttackMode({ drift: true });
  const blockedByCapturePrice = await processCapture(
    { intent_id: priceCheckIntent.body.intent_id },
    { paypal: paypalDep }
  );
  storefront.setAttackMode({ drift: false });
  check(
    'capture rechecks current checkout price before payment',
    blockedByCapturePrice.httpStatus === 409 &&
      intents.get(priceCheckIntent.body.intent_id).status === 'PRICE_CHANGED' &&
      captures.length === capturesBeforeDrift
  );

  const event = {
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-WEB',
      amount: { value: saved.happy.body.amount, currency_code: 'USD' },
      supplementary_data: { related_ids: { order_id: saved.happy.body.paypal_order_id } },
    },
  };
  const unverified = await processWebhook(event, JSON.stringify(event), {}, { verify: async () => false });
  check('webhook reject bad signature', unverified.httpStatus === 401);
  const accepted = await processWebhook(event, JSON.stringify(event), {}, { verify: async () => true });
  check('webhook accepts verified event', accepted.httpStatus === 200 && accepted.body.matched === true);
  const logsAfter = require('./db').getLogs().length;
  const duplicate = await processWebhook(event, JSON.stringify(event), {}, { verify: async () => true });
  check('duplicate webhook is ignored', duplicate.body.duplicate === true && require('./db').getLogs().length === logsAfter);
  const webhookTarget = await processPurchase(
    body({
      product_id: 'prod_sec_key_01',
      product_name: 'Security key',
      merchant_id: 'merch_technova',
      quoted_price: 45,
    }),
    {
      paypal: paypalDep,
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    }
  );
  const incompleteEvent = {
    id: 'WH-INCOMPLETE',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-INCOMPLETE',
      supplementary_data: {
        related_ids: { order_id: webhookTarget.body.paypal_order_id },
      },
    },
  };
  await processWebhook(
    incompleteEvent,
    JSON.stringify(incompleteEvent),
    {},
    { verify: async () => true }
  );
  check(
    'webhook missing capture amount fails closed',
    intents.get(webhookTarget.body.intent_id).status === 'CAPTURE_MISMATCH'
  );

  const chain = verifyChain();
  check('audit chain intact after lifecycle', chain.ok === true, chain.reason);
  require('./db').tamperRow(1, 1);
  const broken = verifyChain();
  check('tamper detected', broken.ok === false && broken.brokenAt === 1);

  const app = createApp({
    purchaseDeps: {
      paypal: paypalDep,
      getPolicyContext: () => ({ daily_spent: 0, tx_last_minute: 0 }),
    },
  });
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const req = async (method, urlPath, payload) => {
    const res = await fetch(base + urlPath, {
      method,
      headers: { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const json = await res.json();
    return { status: res.status, json };
  };

  const health = await req('GET', '/api/health');
  check(
    'health endpoint exposes demo-only capability flags',
    health.status === 200 &&
      health.json.ok === true &&
      typeof health.json.demo_tamper_enabled === 'boolean'
  );
  const config = await req('GET', '/api/paypal/config');
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  check(
    'config hides the secret',
    config.status === 200 && secret && !JSON.stringify(config.json).includes(secret)
  );
  const catalog = await req('GET', '/api/catalog');
  check('catalog has four clean products', catalog.json.products.length === 4);
  const invalid = await req('POST', '/api/purchase', { user_prompt: 'nope' });
  check('HTTP purchase validation', invalid.status === 400);
  const purchaseHttp = await req(
    'POST',
    '/api/purchase',
    body({
      product_id: 'prod_sec_key_01',
      product_name: 'Security key',
      merchant_id: 'merch_technova',
      quoted_price: 45,
    })
  );
  check(
    'HTTP purchase creates a sandbox order through the executor boundary',
    purchaseHttp.status === 200 &&
      purchaseHttp.json.decision === 'ALLOW' &&
      purchaseHttp.json.live_checkout_price === 45 &&
      Boolean(purchaseHttp.json.paypal_order_id)
  );
  const approvalHttp = await req(
    'POST',
    '/api/purchase',
    body({
      product_id: 'prod_dev_monitor_02',
      product_name: 'Developer monitor',
      merchant_id: 'merch_technova',
      quoted_price: 95,
    })
  );
  const approvalSaved = await req('GET', '/api/intents/' + approvalHttp.json.intent_id);
  const approvalResult = await req('POST', '/api/purchase/approve', {
    intent_id: approvalHttp.json.intent_id,
    approval_token: approvalHttp.json.approval_token,
  });
  check(
    'HTTP ASK_HUMAN returns token and approval endpoint consumes it',
    approvalHttp.json.decision === 'ASK_HUMAN' &&
      !Object.prototype.hasOwnProperty.call(approvalSaved.json, 'approval_token_hash') &&
      approvalResult.status === 200 &&
      approvalResult.json.human_approved === true
  );
  const badDrift = await req('POST', '/api/demo/attack', { drift: 'yes' });
  check('attack mode validation', badDrift.status === 400);
  await req('POST', '/api/demo/attack', { drift: true });
  const attack = await req('POST', '/api/purchase', body({
    product_id: 'prod_nvme_ssd_04',
    product_name: 'SSD',
    merchant_id: 'merch_shadydeals',
    quoted_price: 45,
  }).quarantine_extracted
    ? {
        user_prompt: 'Buy the SSD',
        quarantine_extracted: {
          product_id: 'prod_nvme_ssd_04',
          product_name: 'SSD',
          merchant_id: 'merch_shadydeals',
          quoted_price: 45,
          currency: 'USD',
          injection_detected: false,
        },
      }
    : {});
  check('HTTP price drift denies before payment', attack.status === 200 && attack.json.decision === 'DENY' && !attack.json.paypal_order_id);
  const metrics = await req('GET', '/api/metrics');
  check('metrics endpoint', metrics.status === 200 && typeof metrics.json.attacks_blocked === 'number');
  const logs = await req('GET', '/api/logs');
  check('audit log endpoint', logs.status === 200 && Array.isArray(logs.json) && logs.json.length > 0);
  const tamper = await req('POST', '/api/demo/tamper', { id: logs.json[0].id, amount: 9999 });
  check('HTTP tamper route', tamper.status === 200);
  const verified = await req('GET', '/api/audit/verify');
  check('HTTP verify sees tamper', verified.json.ok === false);
  const cap = await req('POST', '/api/paypal/capture', {});
  check('HTTP capture validation', cap.status === 400);
  const hook = await req('POST', '/api/paypal/webhook', { id: 'x', event_type: 'CHECKOUT.ORDER.APPROVED' });
  check('HTTP webhook fails closed without webhook id', hook.status === 503);

  // --- New endpoint tests ---
  const scenariosResponse = await req('GET', '/api/scenarios');
  check('scenarios endpoint returns array', scenariosResponse.status === 200 && Array.isArray(scenariosResponse.json) && scenariosResponse.json.length >= 4);
  check('scenario has required fields', scenariosResponse.json[0].scenario_key && scenariosResponse.json[0].button_label && scenariosResponse.json[0].badge_color);

  const intentsResp = await req('GET', '/api/intents');
  check('intents list endpoint', intentsResp.status === 200 && Array.isArray(intentsResp.json));

  const configResp = await req('GET', '/api/paypal/config');
  check('paypal config returns sandbox flag', configResp.json.sandbox === true);

  // Shop endpoint: happy path scenario
  await req('POST', '/api/demo/attack', { drift: false, injection: true });
  const shopHappy = await req('POST', '/api/shop', { scenario_key: 'HAPPY_PATH_45' });
  check(
    'shop happy path',
    shopHappy.status === 200 && shopHappy.json.decision === 'ALLOW',
    JSON.stringify(shopHappy.json)
  );
  check('shop returns agent_reasoning', typeof shopHappy.json.agent_reasoning === 'string' && shopHappy.json.agent_reasoning.length > 0);
  check(
    'shop exposes distinct proposal, quarantine, and checkout evidence',
    shopHappy.json.agent_proposal.product_id === 'prod_sec_key_01' &&
      shopHappy.json.quarantine_extracted.product_id === 'prod_sec_key_01' &&
      shopHappy.json.checkout_verification.live_checkout_price === 45
  );
  check(
    'shop returns policy_evaluation',
    shopHappy.json.policy_evaluation && shopHappy.json.policy_evaluation.decision === 'ALLOW',
    JSON.stringify(shopHappy.json.policy_evaluation)
  );

  // Shop endpoint: attack scenario
  const shopAttack = await req('POST', '/api/shop', { scenario_key: 'ATTACK_PROMPT_INJECTION' });
  check('shop injection denied', shopAttack.json.decision === 'DENY');
  check('shop injection has full policy reason', shopAttack.json.policy_evaluation && shopAttack.json.policy_evaluation.reason.includes('Injection') || shopAttack.json.policy_evaluation.reason.includes('exceeds'));

  // Shop endpoint: validation
  const shopEmpty = await req('POST', '/api/shop', {});
  check('shop rejects empty body', shopEmpty.status === 400);
  const unknownScenario = await req('POST', '/api/shop', { scenario_key: 'NOT_A_SCENARIO' });
  check('shop rejects unknown scenario instead of defaulting to a purchase', unknownScenario.status === 400);
  const rejectionHttp = await req('POST', '/api/shop', { scenario_key: 'ASK_HUMAN_95' });
  const rejectionResult = await req('POST', '/api/purchase/reject', {
    intent_id: rejectionHttp.json.intent_id,
    approval_token: rejectionHttp.json.approval_token,
  });
  check(
    'HTTP human rejection consumes scoped token',
    rejectionResult.status === 200 && rejectionResult.json.rejected === true
  );
  const malformedJson = await fetch(base + '/api/shop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  check('malformed JSON returns 400', malformedJson.status === 400);

  // Demo reset
  const resetResp = await req('POST', '/api/demo/reset', {});
  check('demo reset', resetResp.status === 200 && resetResp.json.ok === true);

  // Evidence endpoint (use first audit log id)
  const logsForEvid = await req('GET', '/api/logs');
  if (logsForEvid.json.length > 0) {
    const firstId = logsForEvid.json[0].id;
    const evidence = await req('GET', `/api/audit/${firstId}/evidence`);
    check('evidence bundle', evidence.status === 200 && evidence.json.evidence_packet_id);
    check('evidence has forensic seal', evidence.json.warden_forensic_audit && evidence.json.warden_forensic_audit.cryptographic_hash_chain_proof);
  }

  // Intent detail endpoint
  const allIntents = await req('GET', '/api/intents');
  if (allIntents.json.length > 0) {
    const intentDetail = await req('GET', `/api/intents/${allIntents.json[0].intent_id}`);
    check('intent detail', intentDetail.status === 200 && intentDetail.json.intent_id);
  }
  const missingIntent = await req('GET', '/api/intents/nonexistent_id');
  check('missing intent returns 404', missingIntent.status === 404);

  server.close();

  db.exec('DELETE FROM intents');
  calls.length = 0;
  let concurrentOrderId = 0;
  const delayedPaypal = {
    createOrder: async (options) => {
      calls.push(options);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentOrderId += 1;
      return {
        id: `CONCURRENT-${concurrentOrderId}`,
        status: 'CREATED',
        approveUrl: 'https://www.sandbox.paypal.com/checkoutnow',
      };
    },
  };
  const concurrentBody = body({
    product_id: 'prod_sec_key_01',
    product_name: 'Security key',
    merchant_id: 'merch_technova',
    quoted_price: 45,
  });
  const concurrentResults = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      processPurchase(concurrentBody, {
        paypal: delayedPaypal,
        idempotencyKey: `concurrent-request-${index}`,
      })
    )
  );
  check(
    'atomic budget reservation caps concurrent orders at velocity limit',
    calls.length === POLICY_RULES.MAX_TX_PER_MINUTE &&
      concurrentResults.filter((result) => result.body.decision === 'DENY').length === 1
  );

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll backend checks passed');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('TEST CRASHED:', err);
  process.exit(1);
});
