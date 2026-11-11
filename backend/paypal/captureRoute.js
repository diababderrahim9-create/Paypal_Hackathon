'use strict';

/**
 * POST /api/paypal/capture   body: { intent_id }
 *
 * Never accepts a raw PayPal order id or amount from the client.
 * The order id and the approved amount come from our database.
 * ASK_HUMAN intents must be approved inside Warden before capture.
 * Every outcome appends a new audit row.
 */

const paypal = require('./paypalExecutor');
const { intents } = require('../db');
const { appendAudit } = require('../security/auditChain');
const { getLiveCheckoutPrice } = require('../catalog/attackStorefront');

class NotApproved extends Error {}

const money = (v) => Number(v).toFixed(2);
const RETRYABLE = [
  'AWAITING_APPROVAL',
  'PRICE_CHANGED',
  'PRICE_CHECK_FAILED',
  'CAPTURE_FAILED',
  'CAPTURE_UNKNOWN',
];

async function writeAudit(row, paymentStatus, reason, decision, append = appendAudit) {
  await append({
    timestamp: new Date().toISOString(),
    request_summary: row.request_summary || row.product_id || row.intent_id,
    merchant: row.merchant,
    quoted_amount: row.quoted_amount,
    checkout_amount: Number(row.approved_amount),
    decision: decision || row.decision || 'DENY',
    reason: reason || row.reason || paymentStatus,
    risk_score: row.risk_score || 0,
    paypal_order_id: row.paypal_order_id,
    payment_status: paymentStatus,
  });
}

function paypalIssue(err) {
  if (err && Array.isArray(err.issues) && err.issues.length) return err.issues[0];
  const msg = String((err && err.message) || '');
  const match = msg.match(/[A-Z][A-Z0-9_]{3,}/);
  return match ? match[0] : '';
}

async function processCapture(body, deps = {}) {
  const d = { paypal, intents, appendAudit, getLiveCheckoutPrice, ...deps };
  const intent_id = body && body.intent_id;
  if (
    !intent_id ||
    typeof intent_id !== 'string' ||
    Object.keys(body || {}).some((key) => key !== 'intent_id')
  ) {
    return { httpStatus: 400, body: { error: 'intent_id required' } };
  }

  const row = d.intents.get(intent_id);
  if (!row) return { httpStatus: 404, body: { error: 'unknown intent' } };
  if (!row.decision || !['ALLOW', 'ASK_HUMAN'].includes(row.decision)) {
    return { httpStatus: 409, body: { error: 'intent has no payable policy decision' } };
  }
  if (row.decision === 'ASK_HUMAN' && !row.human_approved) {
    return { httpStatus: 409, body: { error: 'Human approval required before capture' } };
  }
  if (row.status === 'CAPTURED') {
    return { httpStatus: 409, body: { error: 'intent is CAPTURED', alreadyCaptured: true } };
  }
  if (!RETRYABLE.includes(row.status)) {
    return { httpStatus: 409, body: { error: `intent is ${row.status}` } };
  }

  if (!d.intents.claim(intent_id, row.status, 'CAPTURING')) {
    return { httpStatus: 409, body: { error: 'capture already in progress' } };
  }

  try {
    const details = await d.paypal.getOrderDetails(row.paypal_order_id);

    if (
      !details.amount ||
      !details.currency ||
      money(details.amount) !== money(row.approved_amount) ||
      details.currency !== row.approved_currency
    ) {
      throw new Error('amount mismatch on file');
    }

    if (details.status === 'COMPLETED') {
      if (details.captureStatus !== 'COMPLETED' || !details.captureId) {
        throw new Error('completed order has no completed capture');
      }
      d.intents.setCapture(intent_id, 'CAPTURED', details.captureId || null);
      await writeAudit(
        row,
        'CAPTURED',
        'PayPal order was already captured',
        row.decision,
        d.appendAudit
      );
      return { httpStatus: 200, body: { alreadyCaptured: true, captureId: details.captureId || null } };
    }
    if (details.status !== 'APPROVED') throw new NotApproved();

    let live;
    try {
      live = await d.getLiveCheckoutPrice(row.product_id);
    } catch (err) {
      console.error('capture price verification failed:', err.message);
      d.intents.setStatus(intent_id, 'PRICE_CHECK_FAILED');
      await writeAudit(
        row,
        'PRICE_CHECK_FAILED',
        'Live checkout price could not be verified; capture was not attempted',
        row.decision,
        d.appendAudit
      );
      return {
        httpStatus: 503,
        body: { error: 'Live checkout price unavailable; capture was not attempted' },
      };
    }

    if (
      !live ||
      money(live.price) !== money(row.approved_amount) ||
      live.currency !== row.approved_currency ||
      live.merchant_id !== row.merchant
    ) {
      d.intents.setStatus(intent_id, 'PRICE_CHANGED');
      await writeAudit(
        row,
        'PRICE_CHANGED',
        'Live checkout price or merchant changed after order creation; capture was blocked',
        row.decision,
        d.appendAudit
      );
      return {
        httpStatus: 409,
        body: { error: 'Live checkout details changed; capture was not attempted' },
      };
    }

    const result = await d.paypal.captureOrder(row.paypal_order_id, {
      requestId: paypal.createRequestId('capture', row.paypal_order_id),
    });

    const pu = result.purchaseUnits && result.purchaseUnits[0];
    if (
      result.status !== 'COMPLETED' ||
      !pu ||
      pu.captureStatus !== 'COMPLETED' ||
      money(pu.amount) !== money(row.approved_amount) ||
      pu.currency !== row.approved_currency
    ) {
      throw new Error(`capture not completed cleanly: ${result.status}`);
    }

    d.intents.setCapture(intent_id, 'CAPTURED', pu.captureId || null);
    await writeAudit(
      row,
      'CAPTURED',
      'PayPal capture completed for the approved live amount',
      row.decision,
      d.appendAudit
    );
    return { httpStatus: 200, body: { ok: true, captureId: pu.captureId } };
  } catch (e) {
    const issue = paypalIssue(e);
    console.error('capture error:', e.message, e.debugId ? `debug_id=${e.debugId}` : '');

    if (e instanceof NotApproved || issue === 'ORDER_NOT_APPROVED') {
      d.intents.setStatus(intent_id, 'AWAITING_APPROVAL');
      await writeAudit(
        row,
        'AWAITING_BUYER_APPROVAL',
        'Buyer has not approved the PayPal order yet',
        row.decision,
        d.appendAudit
      );
      return { httpStatus: 409, body: { error: 'Approve the payment in PayPal first' } };
    }

    if (issue === 'COMPLIANCE_VIOLATION') {
      d.intents.setStatus(intent_id, 'CAPTURE_BLOCKED_BY_PAYPAL');
      await writeAudit(
        row,
        'CAPTURE_BLOCKED_BY_PAYPAL',
        'PayPal returned COMPLIANCE_VIOLATION. Sandbox account or regional restriction; Warden did not treat this as success.',
        row.decision,
        d.appendAudit
      );
      return {
        httpStatus: 502,
        body: {
          error:
            'PayPal blocked the capture with COMPLIANCE_VIOLATION. This is a sandbox account or regional restriction, not a Warden policy decision.',
          paypal_issue: 'COMPLIANCE_VIOLATION',
        },
      };
    }

    const unknown = e.name === 'TimeoutError' || e.name === 'AbortError';
    const status = unknown ? 'CAPTURE_UNKNOWN' : 'CAPTURE_FAILED';
    d.intents.setStatus(intent_id, status);
    await writeAudit(
      row,
      status,
      e.message ? `Capture failed: ${issue || 'PAYPAL_ERROR'}` : status,
      row.decision,
      d.appendAudit
    );
    return { httpStatus: 502, body: { error: 'Payment could not be completed' } };
  }
}

async function captureRoute(req, res) {
  try {
    const r = await processCapture(req.body);
    res.status(r.httpStatus).json(r.body);
  } catch (e) {
    console.error('capture route error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = captureRoute;
module.exports.processCapture = processCapture;
