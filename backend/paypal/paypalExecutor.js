/**
 * paypalExecutor.js
 *
 * The ONLY file in the project that talks to PayPal.
 * Wraps PayPal's Orders v2 REST API.
 *
 * Design principle: "The LLM proposes. Deterministic code disposes."
 *   - The Shopper Agent never gets a payment tool.
 *   - Only this module can move money.
 *   - The server calls it only after the Policy Engine approves.
 *
 * Exports:
 *   createOrder({ amount, currency, description, returnUrl, cancelUrl, requestId })
 *   captureOrder(id, { requestId })   -> normalized result, NO raw payload
 *   getOrderDetails(id)               -> { id, status, amount, currency }
 */

'use strict';

const crypto = require('node:crypto');

// Load .env from the project root regardless of the working directory.
// (Render injects env vars directly, so this only matters locally.)
require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env'),
});

// ---------- configuration ----------

const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

// Sandbox-only. Strict hostname check, not a substring match.
(function assertSandbox() {
  let endpoint;
  try {
    endpoint = new URL(PAYPAL_API_BASE);
  } catch {
    throw new Error(`PAYPAL_API_BASE is not a valid URL: ${PAYPAL_API_BASE}`);
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.hostname !== 'api-m.sandbox.paypal.com' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      `Refusing to run: ${PAYPAL_API_BASE} is not the HTTPS PayPal Sandbox API endpoint`
    );
  }
})();

const REQUEST_TIMEOUT_MS = 15_000;

// Defense in depth: even a server bug cannot create an order above this.
const configuredHardMax = Number(process.env.WARDEN_HARD_MAX_AMOUNT);
const HARD_MAX_AMOUNT =
  Number.isFinite(configuredHardMax) && configuredHardMax > 0
    ? Math.min(configuredHardMax, 150)
    : 150;

function getCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'PayPal is not configured: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.'
    );
  }
  return { clientId, clientSecret };
}

function createRequestId(operation, value) {
  return crypto
    .createHash('sha256')
    .update(`${operation}:${value}`)
    .digest('hex')
    .slice(0, 36);
}

// ---------- internal helpers ----------

let _cachedToken = null;
let _cachedTokenExpiry = 0;

async function getAccessToken() {
  const { clientId, clientSecret } = getCredentials();

  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExpiry - 60_000) {
    return _cachedToken;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  );

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(
      `PayPal auth failed (${res.status} ${res.statusText}): ${text}`
    );
  }

  const json = await res.json();
  _cachedToken = json.access_token;
  _cachedTokenExpiry = now + (json.expires_in || 3600) * 1000;
  return _cachedToken;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

/**
 * Core JSON request helper against the PayPal REST API.
 * POSTs ask for the full representation so capture returns purchase_units.
 */
async function paypalRequest(method, path, body, extraHeaders = {}) {
  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { Prefer: 'return=representation' } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await safeText(res);
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || parsed.error_description || text;
      // PayPal puts the real reason (e.g. INSTRUMENT_DECLINED) in details[].
      if (Array.isArray(parsed.details) && parsed.details.length) {
        const issues = parsed.details
          .map((d) => d.issue + (d.description ? ` (${d.description})` : ''))
          .join('; ');
        detail = `${detail} [${issues}]`;
      }
    } catch {
      /* keep raw text */
    }
    const err = new Error(
      `PayPal API error ${res.status} ${res.statusText} on ${method} ${path}: ${detail}`
    );
    err.status = res.status;
    err.paypalBody = text; // server-side debugging only, never send to client
    err.debugId = res.headers.get('paypal-debug-id');
    try {
      const parsed = JSON.parse(text);
      err.issues = Array.isArray(parsed.details) ? parsed.details.map((d) => d.issue).filter(Boolean) : [];
    } catch {
      err.issues = [];
    }
    if (err.debugId) err.message += ` debug_id=${err.debugId}`;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ---------- public API ----------

async function createOrder({
  amount,
  currency,
  description,
  returnUrl,
  cancelUrl,
  requestId,
} = {}) {
  if (amount === undefined || amount === null || amount === '') {
    throw new Error('createOrder: amount is required');
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`createOrder: invalid amount (${amount})`);
  }
  if (n > HARD_MAX_AMOUNT) {
    throw new Error(
      `createOrder: amount ${n} exceeds hard cap ${HARD_MAX_AMOUNT}`
    );
  }
  if (!currency) {
    throw new Error('createOrder: currency is required');
  }
  if (!/^[A-Z]{3}$/.test(String(currency).toUpperCase())) {
    throw new Error('createOrder: currency must be a 3-letter ISO code');
  }

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: String(currency).toUpperCase(),
          value: n.toFixed(2),
        },
        ...(description
          ? { description: String(description).slice(0, 127) }
          : {}),
      },
    ],
    application_context: {
      brand_name: process.env.PAYPAL_BRAND_NAME || 'AI Shopper',
      user_action: 'PAY_NOW',
      ...(returnUrl ? { return_url: returnUrl } : {}),
      ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
    },
  };

  const order = await paypalRequest(
    'POST',
    '/v2/checkout/orders',
    payload,
    { 'PayPal-Request-Id': requestId || createRequestId('create', crypto.randomUUID()) }
  );

  const approveLink = (order.links || []).find(
    (l) => l.rel === 'approve' || l.rel === 'payer-action'
  );
  let approveUrl = null;
  if (approveLink && approveLink.href) {
    try {
      const url = new URL(approveLink.href);
      if (
        url.protocol === 'https:' &&
        ['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname)
      ) {
        approveUrl = url.href;
      }
    } catch {
      approveUrl = null;
    }
  }
  if (!order.id || !approveUrl) {
    throw new Error('PayPal order response did not include a valid Sandbox buyer approval URL');
  }

  return {
    id: order.id,
    status: order.status,
    approveUrl,
  };
}

/**
 * Capture an approved order. Call ONLY after the Policy Engine approved.
 * A successful HTTP response does NOT mean money moved: callers must check
 * status, captureStatus and the captured amount.
 */
function normalizeCapture(result) {
  const purchaseUnits = (result.purchase_units || []).map((pu) => {
    const cap =
      (pu.payments && pu.payments.captures && pu.payments.captures[0]) || null;
    return {
      referenceId: pu.reference_id || null,
      captureId: cap ? cap.id : null,
      captureStatus: cap ? cap.status : null,
      amount: cap && cap.amount ? cap.amount.value : null,
      currency: cap && cap.amount ? cap.amount.currency_code : null,
    };
  });

  return {
    id: result.id,
    status: result.status, // "COMPLETED" | "PENDING" | "DECLINED" | ...
    purchaseUnits,
    // The PayPal response intentionally is not returned because it contains payer PII.
  };
}

async function captureOrder(id, { requestId } = {}) {
  if (!id) {
    throw new Error('captureOrder: order id is required');
  }

  try {
    const result = await paypalRequest(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      {},
      { 'PayPal-Request-Id': requestId || createRequestId('capture', id) }
    );
    return normalizeCapture(result);
  } catch (err) {
    // A retried capture of an order PayPal already completed is success, not a second charge.
    if (err.issues && err.issues.includes('ORDER_ALREADY_CAPTURED')) {
      const details = await getOrderDetails(id);
      if (details.status === 'COMPLETED') {
        return {
          id: details.id,
          status: 'COMPLETED',
          alreadyCaptured: true,
          purchaseUnits: [
            {
              referenceId: null,
              captureId: details.captureId,
              captureStatus: details.captureStatus || 'COMPLETED',
              amount: details.amount,
              currency: details.currency,
            },
          ],
        };
      }
    }
    throw err;
  }
}

async function getOrderDetails(id) {
  if (!id) {
    throw new Error('getOrderDetails: order id is required');
  }
  const o = await paypalRequest(
    'GET',
    `/v2/checkout/orders/${encodeURIComponent(id)}`
  );
  const pu = (o.purchase_units || [])[0] || {};
  const cap = (pu.payments && pu.payments.captures && pu.payments.captures[0]) || null;
  return {
    id: o.id,
    status: o.status,
    amount: pu.amount ? pu.amount.value : null,
    currency: pu.amount ? pu.amount.currency_code : null,
    captureId: cap ? cap.id : null,
    captureStatus: cap ? cap.status : null,
  };
}

function paypalHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

/**
 * Verifies a webhook via PayPal's verify-webhook-signature endpoint.
 * Certificate URLs are restricted to PayPal hosts. Missing configuration throws.
 */
async function verifyWebhookSignature({ headers = {}, rawBody, webhookId } = {}) {
  const id = webhookId || process.env.PAYPAL_WEBHOOK_ID;
  if (!id) {
    const err = new Error('PAYPAL_WEBHOOK_ID is not configured');
    err.code = 'WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  const certUrl = headers['paypal-cert-url'];
  const host = paypalHost(certUrl);
  const certAllowed = host === 'api.paypal.com' || host === 'api.sandbox.paypal.com' || host.endsWith('.paypal.com');
  const requiredHeaders = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ];
  if (requiredHeaders.some((name) => !headers[name]) || !certAllowed) {
    return false;
  }
  if (paypalHost(certUrl) && new URL(certUrl).protocol !== 'https:') return false;

  let event;
  try {
    event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    return false;
  }

  const result = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: certUrl,
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: id,
    webhook_event: event,
  });
  return Boolean(result && result.verification_status === 'SUCCESS');
}

module.exports = {
  createOrder,
  captureOrder,
  getOrderDetails,
  verifyWebhookSignature,
  createRequestId,
  _internal: { getAccessToken, PAYPAL_API_BASE },
};