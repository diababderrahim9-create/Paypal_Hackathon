'use strict';

// Uses Node's built-in SQLite (node:sqlite). No npm package, no compiling.
// Requires Node 22.13+. On Render, DB_PATH must be a persistent disk mount.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

if (process.env.RENDER && !process.env.DB_PATH) {
  throw new Error(
    'Refusing ephemeral SQLite on Render. Set DB_PATH to a persistent disk path such as /var/data/warden.db'
  );
}

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../warden.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT, request_summary TEXT, merchant TEXT,
  quoted_amount REAL, checkout_amount REAL,
  decision TEXT, reason TEXT, risk_score INTEGER,
  paypal_order_id TEXT, payment_status TEXT,
  prev_hash TEXT, entry_hash TEXT
);

CREATE TABLE IF NOT EXISTS intents (
  intent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  paypal_order_id TEXT,
  approved_amount TEXT,
  approved_currency TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  resource_id TEXT,
  status TEXT,
  received_at TEXT
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  intent_id TEXT,
  http_status INTEGER,
  response_json TEXT,
  created_at TEXT
);
`);

function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function ensureColumn(table, name, ddl) {
  if (!columnNames(table).includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

ensureColumn('intents', 'decision', 'TEXT');
ensureColumn('intents', 'human_approved', 'INTEGER DEFAULT 0');
ensureColumn('intents', 'product_id', 'TEXT');
ensureColumn('intents', 'request_summary', 'TEXT');
ensureColumn('intents', 'merchant', 'TEXT');
ensureColumn('intents', 'quoted_amount', 'REAL');
ensureColumn('intents', 'risk_score', 'INTEGER');
ensureColumn('intents', 'reason', 'TEXT');
ensureColumn('intents', 'user_prompt', 'TEXT');
ensureColumn('intents', 'capture_id', 'TEXT');
ensureColumn('intents', 'paypal_status', 'TEXT');
ensureColumn('intents', 'rules_json', 'TEXT');
ensureColumn('intents', 'intent_alignment_pass', 'INTEGER');
ensureColumn('intents', 'approval_token_hash', 'TEXT');
ensureColumn('intents', 'approval_expires_at', 'TEXT');

ensureColumn('audit_logs', 'user_prompt', 'TEXT');
ensureColumn('audit_logs', 'injection_detected', 'INTEGER');
ensureColumn('audit_logs', 'intent_alignment_pass', 'INTEGER');

const RESERVED_STATUSES = [
  'ORDER_CREATING',
  'ORDER_UNKNOWN',
  'AWAITING_APPROVAL',
  'CAPTURING',
  'CAPTURED',
  'CAPTURE_UNKNOWN',
];

const insertLog = db.prepare(`
  INSERT INTO audit_logs (timestamp, request_summary, merchant, quoted_amount,
    checkout_amount, decision, reason, risk_score, paypal_order_id,
    payment_status, prev_hash, entry_hash, user_prompt, injection_detected, intent_alignment_pass)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const n = (v) => (v === undefined ? null : v);

function appendLog(e) {
  const r = insertLog.run(
    n(e.timestamp),
    n(e.request_summary),
    n(e.merchant),
    n(e.quoted_amount),
    n(e.checkout_amount),
    n(e.decision),
    n(e.reason),
    n(e.risk_score),
    n(e.paypal_order_id),
    n(e.payment_status),
    n(e.prev_hash),
    n(e.entry_hash),
    n(e.user_prompt),
    e.injection_detected ? 1 : (e.injection_detected === false ? 0 : null),
    e.intent_alignment_pass ? 1 : (e.intent_alignment_pass === false ? 0 : null)
  );
  return Number(r.lastInsertRowid);
}

const getLogs = () => db.prepare('SELECT * FROM audit_logs ORDER BY id').all();
const getAllLogs = getLogs;  // alias used by auditChain.js

const getLastLog = () =>
  db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get() || null;

function tamperRow(id, newAmount) {
  return (
    db.prepare('UPDATE audit_logs SET quoted_amount=? WHERE id=?').run(Number(newAmount), n(id))
      .changes === 1
  );
}

const now = () => new Date().toISOString();

const intents = {
  create({
    intent_id,
    paypal_order_id = null,
    approved_amount,
    approved_currency,
    status,
    decision = null,
    human_approved = 0,
    product_id = null,
    request_summary = null,
    merchant = null,
    quoted_amount = null,
    risk_score = null,
    reason = null,
    user_prompt = null,
    rules_json = null,
    intent_alignment_pass = null,
    approval_token_hash = null,
    approval_expires_at = null,
    created_at = null,
  }) {
    const ts = created_at || now();
    db.prepare(
      `INSERT INTO intents (
         intent_id, status, paypal_order_id, approved_amount, approved_currency,
         created_at, updated_at, decision, human_approved, product_id, request_summary,
         merchant, quoted_amount, risk_score, reason, user_prompt, rules_json,
         intent_alignment_pass, paypal_status, approval_token_hash, approval_expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      n(intent_id),
      n(status),
      paypal_order_id,
      n(approved_amount === undefined ? undefined : String(approved_amount)),
      n(approved_currency),
      ts,
      ts,
      n(decision),
      human_approved ? 1 : 0,
      n(product_id),
      n(request_summary),
      n(merchant),
      n(quoted_amount),
      n(risk_score),
      n(reason),
      n(user_prompt),
      n(rules_json),
      intent_alignment_pass === null || intent_alignment_pass === undefined
        ? null
        : intent_alignment_pass
          ? 1
          : 0,
      'CREATED',
      n(approval_token_hash),
      n(approval_expires_at)
    );
  },

  get(intent_id) {
    return db.prepare('SELECT * FROM intents WHERE intent_id=?').get(n(intent_id)) || null;
  },

  list() {
    return db.prepare('SELECT * FROM intents ORDER BY created_at').all();
  },

  findByPaypalOrderId(orderId) {
    return (
      db.prepare('SELECT * FROM intents WHERE paypal_order_id=?').get(n(orderId)) || null
    );
  },

  setStatus(intent_id, status) {
    db.prepare('UPDATE intents SET status=?, updated_at=? WHERE intent_id=?').run(
      n(status),
      now(),
      n(intent_id)
    );
  },

  setPaypalStatus(intent_id, paypalStatus) {
    db.prepare('UPDATE intents SET paypal_status=?, updated_at=? WHERE intent_id=?').run(
      n(paypalStatus),
      now(),
      n(intent_id)
    );
  },

  setPaypalOrder(intent_id, paypalOrderId) {
    return (
      db
        .prepare(
          `UPDATE intents
           SET paypal_order_id=?, status='AWAITING_APPROVAL', updated_at=?
           WHERE intent_id=? AND status='ORDER_CREATING'`
        )
        .run(n(paypalOrderId), now(), n(intent_id)).changes === 1
    );
  },

  setCapture(intent_id, status, captureId) {
    db.prepare(
      'UPDATE intents SET status=?, capture_id=?, paypal_status=?, updated_at=? WHERE intent_id=?'
    ).run(n(status), n(captureId), n(status), now(), n(intent_id));
  },

  approveHuman(intent_id, tokenHash) {
    if (!tokenHash) return false;
    return (
      db
        .prepare(
          `UPDATE intents
           SET human_approved=1, approval_token_hash=NULL, updated_at=?
           WHERE intent_id=? AND decision='ASK_HUMAN' AND status='AWAITING_APPROVAL'
             AND approval_token_hash=? AND approval_expires_at>?`
        )
        .run(now(), n(intent_id), n(tokenHash), now()).changes === 1
    );
  },

  rejectHuman(intent_id, tokenHash) {
    if (!tokenHash) return false;
    return (
      db
        .prepare(
          `UPDATE intents
           SET status='REJECTED', approval_token_hash=NULL, updated_at=?
           WHERE intent_id=? AND decision='ASK_HUMAN' AND human_approved=0
             AND status='AWAITING_APPROVAL' AND approval_token_hash=?
             AND approval_expires_at>?`
        )
        .run(now(), n(intent_id), n(tokenHash), now()).changes === 1
    );
  },

  rotateApprovalToken(intent_id, tokenHash, expiresAt) {
    return (
      db
        .prepare(
          `UPDATE intents
           SET approval_token_hash=?, approval_expires_at=?, updated_at=?
           WHERE intent_id=? AND decision='ASK_HUMAN' AND human_approved=0
             AND status='AWAITING_APPROVAL'`
        )
        .run(n(tokenHash), n(expiresAt), now(), n(intent_id)).changes === 1
    );
  },

  claim(intent_id, from, to) {
    return (
      db
        .prepare('UPDATE intents SET status=?, updated_at=? WHERE intent_id=? AND status=?')
        .run(n(to), now(), n(intent_id), n(from)).changes === 1
    );
  },
};

function sumAmounts(row) {
  if (!row) return 0;
  const value = row.total !== undefined ? row.total : row.n;
  return Number(value || 0);
}

function getPolicyContext() {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const placeholders = RESERVED_STATUSES.map(() => '?').join(', ');
  const daily = db
    .prepare(
      `SELECT COALESCE(SUM(CAST(approved_amount AS REAL)), 0) AS total
       FROM intents WHERE status IN (${placeholders}) AND created_at >= ?`
    )
    .get(...RESERVED_STATUSES, dayStart.toISOString());
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS n FROM intents
       WHERE status IN (${placeholders}) AND created_at >= ?`
    )
    .get(...RESERVED_STATUSES, minuteAgo);
  return {
    daily_spent: sumAmounts(daily),
    tx_last_minute: sumAmounts(recent),
  };
}

function isConstraintError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /UNIQUE|constraint/i.test(msg);
}

const webhookEvents = {
  claim(eventId, eventType, resourceId) {
    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = db.prepare(
      `INSERT INTO webhook_events (event_id, event_type, resource_id, status, received_at)
       VALUES (?, ?, ?, 'processing', ?)
       ON CONFLICT(event_id) DO UPDATE SET
         event_type=excluded.event_type,
         resource_id=excluded.resource_id,
         status='processing',
         received_at=excluded.received_at
       WHERE webhook_events.status='processing' AND webhook_events.received_at<?`
    ).run(n(eventId), n(eventType), n(resourceId), now(), staleBefore);
    return result.changes === 1;
  },
  complete(eventId) {
    db.prepare(`UPDATE webhook_events SET status='done' WHERE event_id=?`).run(n(eventId));
  },
  release(eventId) {
    db.prepare(`DELETE FROM webhook_events WHERE event_id=? AND status='processing'`).run(n(eventId));
  },
};

function getIdempotent(key) {
  return db.prepare('SELECT * FROM idempotency_keys WHERE key=?').get(n(key)) || null;
}

function claimIdempotent(key, intentId) {
  try {
    db.prepare(
      `INSERT INTO idempotency_keys (key, intent_id, http_status, response_json, created_at)
       VALUES (?, ?, NULL, NULL, ?)`
    ).run(String(key).slice(0, 200), n(intentId), now());
    return true;
  } catch (err) {
    if (isConstraintError(err)) return false;
    throw err;
  }
}

function saveIdempotent(key, intentId, httpStatus, responseBody) {
  if (!key) return;
  db.prepare(
    `UPDATE idempotency_keys SET http_status=?, response_json=?
     WHERE key=? AND intent_id=? AND http_status IS NULL`
  ).run(httpStatus, JSON.stringify(responseBody), String(key).slice(0, 200), n(intentId));
}

module.exports = {
  db,
  DB_PATH,
  appendLog,
  getLogs,
  getAllLogs,
  getLastLog,
  tamperRow,
  intents,
  getPolicyContext,
  webhookEvents,
  getIdempotent,
  claimIdempotent,
  saveIdempotent,
};
