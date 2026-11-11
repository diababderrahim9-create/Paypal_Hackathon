'use strict';

/**
 * POST /api/purchase
 * body: { user_prompt, quarantine_extracted: { product_id, product_name,
 *         merchant_id, quoted_price, currency, injection_detected } }
 *
 * Order of operations:
 *   1. validate input
 *   2. fetch the LIVE checkout price server-side (never trust the quote)
 *   3. Policy Engine decides (deterministic). Invalid decisions fail closed.
 *   4. DENY  -> PayPal is never called
 *      ALLOW / ASK_HUMAN -> create the order for the LIVE price
 *   5. every outcome is appended to the hash-chained audit log
 */

const crypto = require('crypto');
const paypal = require('./paypalExecutor');
const {
  intents,
  getPolicyContext,
  getIdempotent,
  claimIdempotent,
  saveIdempotent,
} = require('../db');
const { evaluate } = require('../security/policyEngine');
const { appendAudit } = require('../security/auditChain');
const { getLiveCheckoutPrice, searchCatalog } = require('../catalog/attackStorefront');
const { sanitizeUntrustedProduct } = require('../agents/quarantineLLM');

const money = (v) => Number(v).toFixed(2);
const PRODUCT_TERMS = {
  prod_sec_key_01: 'security\\s+key|hardware\\s+key|fido2|\\bkey\\b',
  prod_dev_monitor_02: '\\bmonitor\\b|\\bdisplay\\b',
  prod_usb_hub_03: '\\bhub\\b|\\badapter\\b',
  prod_nvme_ssd_04: '\\bssd\\b|\\bdrive\\b|\\bstorage\\b',
  prod_gpu_rig_05: '\\bvoucher\\b|\\bgpu\\b|\\bcrypto\\b|\\b499\\b',
};

function promptMatchesProduct(prompt, productId) {
  const terms = PRODUCT_TERMS[productId];
  if (!terms) return false;
  const text = prompt.toLowerCase();
  if (!new RegExp(terms, 'i').test(text)) return false;
  const denied = new RegExp(
    `\\b(?:do not|don't|never|avoid|exclude|without|not)\\b[^.!?;]{0,60}(?:${terms})`,
    'i'
  );
  return !denied.test(text);
}

function publicBase() {
  if (process.env.PUBLIC_BASE_URL) return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  return `http://localhost:${process.env.PORT || 4000}`;
}

async function processPurchase(body, deps = {}) {
  const d = {
    paypal,
    intents,
    evaluate,
    appendAudit,
    getLiveCheckoutPrice,
    getPolicyContext,
    getIdempotent,
    claimIdempotent,
    saveIdempotent,
    searchCatalog,
    sanitizeUntrustedProduct,
    ...deps,
  };

  const rawIdempotencyKey = deps.idempotencyKey ? String(deps.idempotencyKey).trim() : '';
  if (rawIdempotencyKey.length > 200) {
    return { httpStatus: 400, body: { error: 'Idempotency-Key must be at most 200 characters' } };
  }
  const idemKey = rawIdempotencyKey;
  if (idemKey) {
    const existing = d.getIdempotent(idemKey);
    if (existing) {
      if (existing.http_status === null || !existing.response_json) {
        return {
          httpStatus: 409,
          body: { error: 'A purchase with this Idempotency-Key is already in progress' },
        };
      }
      const responseBody = JSON.parse(existing.response_json);
      if (responseBody.decision === 'ASK_HUMAN') {
        const row = d.intents.get(existing.intent_id);
        if (row && !row.human_approved && row.status === 'AWAITING_APPROVAL') {
          const approvalToken = crypto.randomBytes(32).toString('base64url');
          const approvalExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          const tokenHash = crypto.createHash('sha256').update(approvalToken).digest('hex');
          if (d.intents.rotateApprovalToken(existing.intent_id, tokenHash, approvalExpiresAt)) {
            responseBody.approval_token = approvalToken;
            responseBody.approval_expires_at = approvalExpiresAt;
          }
        }
      }
      return { httpStatus: existing.http_status, body: responseBody };
    }
  }

  const q = body && body.quarantine_extracted;
  const quoted = q ? Number(q.quoted_price) : NaN;
  if (
    !body ||
    typeof body.user_prompt !== 'string' ||
    !body.user_prompt.trim() ||
    body.user_prompt.length > 1000 ||
    !q ||
    typeof q.product_id !== 'string' ||
    !q.product_id ||
    q.product_id.length > 80 ||
    typeof q.merchant_id !== 'string' ||
    !q.merchant_id ||
    !Number.isFinite(quoted) ||
    quoted <= 0
  ) {
    return {
      httpStatus: 400,
      body: {
        error:
          'quarantine_extracted with product_id, merchant_id and a positive quoted_price is required',
      },
    };
  }
  if (q.injection_detected !== undefined && typeof q.injection_detected !== 'boolean') {
    return { httpStatus: 400, body: { error: 'injection_detected must be a boolean' } };
  }

  const currency = String(q.currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { httpStatus: 400, body: { error: 'currency must be a 3-letter ISO code' } };
  }

  const intentId = `int_${crypto.randomUUID()}`;
  if (idemKey && !d.claimIdempotent(idemKey, intentId)) {
    const existing = d.getIdempotent(idemKey);
    if (existing && existing.http_status !== null && existing.response_json) {
      return { httpStatus: existing.http_status, body: JSON.parse(existing.response_json) };
    }
    return {
      httpStatus: 409,
      body: { error: 'A purchase with this Idempotency-Key is already in progress' },
    };
  }
  const rawProduct = d.searchCatalog(q.product_id).find((item) => item.product_id === q.product_id);
  const trustedProduct = rawProduct
    ? await d.sanitizeUntrustedProduct(rawProduct, { forceDeterministic: true })
    : null;
  const summary = String(
    (trustedProduct && trustedProduct.product_name) || q.product_name || q.product_id
  ).slice(0, 120);
  const remember = (httpStatus, responseBody) => {
    if (idemKey) {
      const { approval_token, ...storedResponse } = responseBody;
      d.saveIdempotent(
        idemKey,
        responseBody.intent_id || intentId,
        httpStatus,
        storedResponse
      );
    }
    return { httpStatus, body: responseBody };
  };

  const auditBase = {
    timestamp: new Date().toISOString(),
    request_summary: summary,
    merchant: q.merchant_id,
    quoted_amount: quoted,
    checkout_amount: null,
    decision: 'DENY',
    risk_score: 100,
    paypal_order_id: null,
    payment_status: 'BLOCKED',
    user_prompt: body.user_prompt.slice(0, 500),
    injection_detected: Boolean(q.injection_detected || (trustedProduct && trustedProduct.injection_detected)),
  };
  const persistIntent = (status, fields = {}) => {
    d.intents.create({
      intent_id: intentId,
      approved_amount: null,
      approved_currency: currency,
      status,
      decision: fields.decision || 'DENY',
      product_id: q.product_id,
      request_summary: summary,
      merchant: fields.merchant || q.merchant_id,
      quoted_amount: quoted,
      risk_score: fields.risk_score ?? 100,
      reason: fields.reason || 'Purchase was denied',
      user_prompt: body.user_prompt.slice(0, 500),
      intent_alignment_pass:
        fields.intent_alignment_pass === undefined ? null : fields.intent_alignment_pass,
    });
  };

  const live = await d.getLiveCheckoutPrice(q.product_id);
  if (!live) {
    const reason = 'Product not found at checkout';
    persistIntent('DENIED', { reason });
    d.appendAudit({
      ...auditBase,
      reason,
      checkout_amount: null,
    });
    return remember(200, { intent_id: intentId, decision: 'DENY', reason, quoted_price: quoted, rules_checked: null });
  }

  const livePrice = Number(live.price);
  const liveCurrency = String(live.currency || currency).toUpperCase();
  const catalogQuoteMismatch =
    trustedProduct && money(trustedProduct.quoted_price) !== money(quoted);
  const drift =
    Boolean(catalogQuoteMismatch) ||
    money(livePrice) !== money(quoted) ||
    liveCurrency !== currency;
  const alignment =
    body.intent_alignment_pass !== false &&
    body.intent_alignment_pass !== 0 &&
    promptMatchesProduct(body.user_prompt, q.product_id);

  let spend = { daily_spent: 0, tx_last_minute: 0 };
  try {
    spend = d.getPolicyContext ? d.getPolicyContext() : spend;
  } catch (err) {
    console.error('policy context failed closed:', err.message);
    const reason = 'Policy context unavailable; purchase denied';
    persistIntent('DENIED', { reason });
    d.appendAudit({ ...auditBase, reason, payment_status: 'BLOCKED' });
    return remember(503, {
      intent_id: intentId,
      decision: 'DENY',
      reason,
      quoted_price: quoted,
      live_checkout_price: livePrice,
      price_drift_detected: drift,
      rules_checked: null,
    });
  }

  const intent = {
    intent_id: intentId,
    timestamp: new Date().toISOString(),
    user_prompt: typeof body.user_prompt === 'string' ? body.user_prompt.slice(0, 500) : null,
    intent_alignment_pass: alignment,
    quarantine_extracted: {
      ...q,
      product_name: summary,
      quoted_price: quoted,
      currency,
      injection_detected: Boolean(
        q.injection_detected || (trustedProduct && trustedProduct.injection_detected)
      ),
    },
    checkout_verification: {
      live_checkout_price: livePrice,
      price_drift_detected: drift,
      currency: liveCurrency,
      merchant_id: live.merchant_id,
    },
    policy_context: {
      daily_spent: spend.daily_spent,
      tx_last_minute: spend.tx_last_minute,
    },
  };

  let pe;
  try {
    pe = d.evaluate(intent) || {};
  } catch (err) {
    console.error('policy engine threw:', err.message);
    pe = { decision: 'DENY', reason: 'Policy Engine failed closed', risk_score: 100, rules_checked: null };
  }

  let decision = ['ALLOW', 'ASK_HUMAN', 'DENY'].includes(pe.decision) ? pe.decision : 'DENY';
  let reason = pe.reason || 'Policy Engine returned no valid decision';
  if (!['ALLOW', 'ASK_HUMAN', 'DENY'].includes(pe.decision)) {
    reason = 'Policy Engine returned no valid decision';
  }

  if (drift && decision !== 'DENY') {
    decision = 'DENY';
    reason = catalogQuoteMismatch
      ? 'Quoted price does not match the server-side catalog quote'
      : `Price drift: quoted ${money(quoted)} but checkout is ${money(livePrice)} ${liveCurrency}`;
  }
  if (!(livePrice > 0) || livePrice > 150) {
    decision = 'DENY';
    reason = `Amount ${money(livePrice)} exceeds the hard maximum`;
  }

  const view = {
    intent_id: intentId,
    decision,
    reason,
    risk_score: pe.risk_score ?? null,
    rules_checked: pe.rules_checked || null,
    quoted_price: quoted,
    live_checkout_price: livePrice,
    price_drift_detected: drift,
    currency: liveCurrency,
  };

  const baseAudit = {
    ...auditBase,
    timestamp: new Date().toISOString(),
    request_summary: summary,
    merchant: live.merchant_id || q.merchant_id,
    quoted_amount: quoted,
    checkout_amount: livePrice,
    decision,
    reason,
    risk_score: pe.risk_score ?? 0,
    paypal_order_id: null,
    payment_status: decision === 'DENY' ? 'BLOCKED' : null,
    user_prompt: body.user_prompt.slice(0, 500),
    injection_detected: Boolean(
      q.injection_detected || (trustedProduct && trustedProduct.injection_detected)
    ),
  };

  if (decision === 'DENY') {
    persistIntent('DENIED', {
      decision,
      merchant: live.merchant_id || q.merchant_id,
      risk_score: pe.risk_score ?? 100,
      reason,
      intent_alignment_pass: alignment,
    });
    d.appendAudit(baseAudit);
    return remember(200, view);
  }

  const approvalToken =
    decision === 'ASK_HUMAN' ? crypto.randomBytes(32).toString('base64url') : null;
  const approvalExpiresAt = approvalToken
    ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
    : null;
  d.intents.create({
    intent_id: intentId,
    paypal_order_id: null,
    approved_amount: money(livePrice),
    approved_currency: liveCurrency,
    status: 'ORDER_CREATING',
    decision,
    human_approved: 0,
    product_id: q.product_id,
    request_summary: summary,
    merchant: live.merchant_id || q.merchant_id,
    quoted_amount: quoted,
    risk_score: pe.risk_score ?? null,
    reason,
    user_prompt: intent.user_prompt,
    rules_json: pe.rules_checked ? JSON.stringify(pe.rules_checked) : null,
    intent_alignment_pass: alignment,
    approval_token_hash: approvalToken
      ? crypto.createHash('sha256').update(approvalToken).digest('hex')
      : null,
    approval_expires_at: approvalExpiresAt,
  });
  d.appendAudit({
    ...baseAudit,
    payment_status: 'ORDER_CREATING',
  });

  let order;
  try {
    order = await d.paypal.createOrder({
      amount: livePrice,
      currency: liveCurrency,
      description: summary,
      returnUrl: `${publicBase()}/paypal/return`,
      cancelUrl: `${publicBase()}/paypal/cancel`,
      requestId: paypal.createRequestId('create', intentId),
    });
  } catch (e) {
    console.error('createOrder failed:', e.message);
    const unknown = e.name === 'TimeoutError' || e.name === 'AbortError';
    const paymentStatus = unknown ? 'ORDER_UNKNOWN' : 'ORDER_FAILED';
    d.intents.setStatus(intentId, paymentStatus);
    d.appendAudit({
      ...baseAudit,
      payment_status: paymentStatus,
      reason: unknown
        ? 'PayPal order creation timed out; order state must be reconciled before retry'
        : 'PayPal order creation failed',
    });
    return {
      ...remember(502, {
        intent_id: intentId,
        decision,
        error: unknown
          ? 'PayPal order creation timed out; check the intent before retrying'
          : 'Could not create the PayPal order',
      }),
    };
  }

  if (!d.intents.setPaypalOrder(intentId, order.id)) {
    d.appendAudit({
      ...baseAudit,
      paypal_order_id: order.id,
      payment_status: 'ORDER_PERSISTENCE_FAILED',
      reason: 'PayPal order was created but could not be linked to the local intent',
    });
    throw new Error('Unable to persist the created PayPal order');
  }
  d.appendAudit({
    ...baseAudit,
    paypal_order_id: order.id,
    payment_status: 'AWAITING_APPROVAL',
  });

  return remember(200, {
    ...view,
    paypal_order_id: order.id,
    approve_url: order.approveUrl,
    amount: money(livePrice),
    currency: liveCurrency,
    needs_human_approval: decision === 'ASK_HUMAN',
    ...(approvalToken ? { approval_token: approvalToken, approval_expires_at: approvalExpiresAt } : {}),
  });
}

function approvePurchase(body) {
  const intentId = body && body.intent_id;
  if (
    !intentId ||
    typeof intentId !== 'string' ||
    Object.keys(body || {}).some((key) => !['intent_id', 'approval_token'].includes(key))
  ) {
    return { httpStatus: 400, body: { error: 'intent_id required' } };
  }
  const row = intents.get(intentId);
  if (!row) return { httpStatus: 404, body: { error: 'unknown intent' } };
  if (row.decision !== 'ASK_HUMAN') {
    return { httpStatus: 409, body: { error: `intent decision is ${row.decision || 'unset'}` } };
  }
  if (row.human_approved) {
    return { httpStatus: 200, body: { ok: true, intent_id: intentId, already_approved: true } };
  }
  if (
    typeof body.approval_token !== 'string' ||
    !body.approval_token ||
    body.approval_token.length > 128
  ) {
    return { httpStatus: 400, body: { error: 'approval_token required' } };
  }
  const tokenHash = crypto.createHash('sha256').update(body.approval_token).digest('hex');
  if (!intents.approveHuman(intentId, tokenHash)) {
    return { httpStatus: 403, body: { error: 'Invalid or expired approval token' } };
  }
  appendAudit({
    timestamp: new Date().toISOString(),
    request_summary: row.request_summary,
    merchant: row.merchant,
    quoted_amount: row.quoted_amount,
    checkout_amount: Number(row.approved_amount),
    decision: 'ASK_HUMAN',
    reason: 'Human payer approved the purchase inside Warden',
    risk_score: row.risk_score || 35,
    paypal_order_id: row.paypal_order_id,
    payment_status: 'HUMAN_APPROVED',
  });
  return { httpStatus: 200, body: { ok: true, intent_id: intentId, human_approved: true } };
}

function rejectPurchase(body) {
  const intentId = body && body.intent_id;
  if (
    !intentId ||
    typeof intentId !== 'string' ||
    Object.keys(body || {}).some((key) => !['intent_id', 'approval_token'].includes(key))
  ) {
    return { httpStatus: 400, body: { error: 'intent_id required' } };
  }
  const row = intents.get(intentId);
  if (!row) return { httpStatus: 404, body: { error: 'unknown intent' } };
  if (row.decision !== 'ASK_HUMAN' || row.status !== 'AWAITING_APPROVAL') {
    return { httpStatus: 409, body: { error: 'intent is not awaiting human approval' } };
  }
  if (
    typeof body.approval_token !== 'string' ||
    !body.approval_token ||
    body.approval_token.length > 128
  ) {
    return { httpStatus: 400, body: { error: 'approval_token required' } };
  }
  const tokenHash = crypto.createHash('sha256').update(body.approval_token).digest('hex');
  if (!intents.rejectHuman(intentId, tokenHash)) {
    return { httpStatus: 403, body: { error: 'Invalid or expired approval token' } };
  }
  appendAudit({
    timestamp: new Date().toISOString(),
    request_summary: row.request_summary,
    merchant: row.merchant,
    quoted_amount: row.quoted_amount,
    checkout_amount: Number(row.approved_amount),
    decision: 'ASK_HUMAN',
    reason: 'Human payer rejected the purchase inside Warden',
    risk_score: row.risk_score || 35,
    paypal_order_id: row.paypal_order_id,
    payment_status: 'REJECTED',
  });
  return { httpStatus: 200, body: { ok: true, intent_id: intentId, rejected: true } };
}

function createPurchaseRoute(dependencies = {}) {
  return async function purchaseRoute(req, res) {
    try {
      const r = await processPurchase(req.body, {
        ...dependencies,
        idempotencyKey: req.get('Idempotency-Key') || null,
      });
      res.status(r.httpStatus).json(r.body);
    } catch (e) {
      console.error('purchase error:', e);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

const purchaseRoute = createPurchaseRoute();

function approveRoute(req, res) {
  try {
    const r = approvePurchase(req.body);
    res.status(r.httpStatus).json(r.body);
  } catch (e) {
    console.error('approve error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}

function rejectRoute(req, res) {
  try {
    const r = rejectPurchase(req.body);
    res.status(r.httpStatus).json(r.body);
  } catch (e) {
    console.error('reject approval error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = {
  purchaseRoute,
  createPurchaseRoute,
  processPurchase,
  approvePurchase,
  approveRoute,
  rejectPurchase,
  rejectRoute,
};
