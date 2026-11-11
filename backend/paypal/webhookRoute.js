'use strict';

/**
 * PayPal webhooks: CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED.
 * Signature verification fails closed. Event ids are processed once.
 * Webhooks record state. They never capture money by themselves.
 */

const paypal = require('./paypalExecutor');
const { intents, webhookEvents } = require('../db');
const { appendAudit } = require('../security/auditChain');

const HANDLED = new Set(['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED']);

function orderIdFrom(event) {
  const resource = (event && event.resource) || {};
  if (event.event_type === 'CHECKOUT.ORDER.APPROVED') return resource.id || null;
  const related = resource.supplementary_data && resource.supplementary_data.related_ids;
  return (related && related.order_id) || null;
}

function amountOf(event) {
  const resource = (event && event.resource) || {};
  const unit = (resource.purchase_units && resource.purchase_units[0]) || {};
  const amount = resource.amount || unit.amount || {};
  return {
    value: amount.value || null,
    currency: amount.currency_code || null,
    captureId: event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? resource.id || null : null,
  };
}

async function writeAudit(row, paymentStatus, reason, append = appendAudit) {
  await append({
    timestamp: new Date().toISOString(),
    request_summary: row.request_summary || row.intent_id,
    merchant: row.merchant,
    quoted_amount: row.quoted_amount,
    checkout_amount: Number(row.approved_amount),
    decision: row.decision || 'DENY',
    reason,
    risk_score: row.risk_score || 0,
    paypal_order_id: row.paypal_order_id,
    payment_status: paymentStatus,
  });
}

async function processWebhook(event, rawBody, headers, deps = {}) {
  const verify = deps.verify || paypal.verifyWebhookSignature;
  const dIntents = deps.intents || intents;
  const events = deps.webhookEvents || webhookEvents;

  if (!event || typeof event !== 'object' || !event.id || !event.event_type) {
    return { httpStatus: 400, body: { error: 'invalid webhook event' } };
  }

  let verified = false;
  try {
    verified = await verify({
      headers: headers || {},
      rawBody: rawBody || JSON.stringify(event),
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
      event,
    });
  } catch (err) {
    if (err && err.code === 'WEBHOOK_NOT_CONFIGURED') {
      return { httpStatus: 503, body: { error: 'Webhook verification is not configured' } };
    }
    console.error('webhook verify error:', err.message);
    return { httpStatus: 500, body: { error: 'Webhook verification failed' } };
  }

  if (!verified) {
    return { httpStatus: 401, body: { error: 'Invalid webhook signature' } };
  }

  if (!HANDLED.has(event.event_type)) {
    return { httpStatus: 200, body: { ok: true, ignored: true } };
  }

  const orderId = orderIdFrom(event);
  if (!events.claim(event.id, event.event_type, orderId)) {
    return { httpStatus: 200, body: { ok: true, duplicate: true } };
  }

  try {
    const row = orderId ? dIntents.findByPaypalOrderId(orderId) : null;
    if (!row) {
      events.complete(event.id);
      return { httpStatus: 200, body: { ok: true, matched: false } };
    }

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      dIntents.setPaypalStatus(row.intent_id, 'APPROVED');
      await writeAudit(
        row,
        'ORDER_APPROVED',
        'PayPal webhook CHECKOUT.ORDER.APPROVED',
        deps.appendAudit || appendAudit
      );
    }

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const amount = amountOf(event);
      const money = (v) => Number(v).toFixed(2);
      const mismatch =
        !amount.value ||
        !amount.currency ||
        money(amount.value) !== money(row.approved_amount) ||
        amount.currency !== row.approved_currency ||
        !amount.captureId;
      if (mismatch) {
        if (row.status !== 'CAPTURED') {
          dIntents.setStatus(row.intent_id, 'CAPTURE_MISMATCH');
        }
        await writeAudit(
          row,
          'CAPTURE_MISMATCH',
          'Webhook capture details were missing or did not match the approved amount',
          deps.appendAudit || appendAudit
        );
      } else if (row.status !== 'CAPTURED') {
        dIntents.setCapture(row.intent_id, 'CAPTURED', amount.captureId);
        await writeAudit(
          row,
          'CAPTURED',
          'PayPal webhook PAYMENT.CAPTURE.COMPLETED',
          deps.appendAudit || appendAudit
        );
      }
    }

    events.complete(event.id);
    return { httpStatus: 200, body: { ok: true, matched: true } };
  } catch (err) {
    events.release(event.id);
    console.error('webhook processing error:', err.message);
    return { httpStatus: 500, body: { error: 'Webhook processing failed' } };
  }
}

async function webhookRoute(req, res) {
  try {
    const event = req.body;
    const r = await processWebhook(event, req.rawBody, req.headers);
    res.status(r.httpStatus).json(r.body);
  } catch (err) {
    console.error('webhook route error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = webhookRoute;
module.exports.processWebhook = processWebhook;
