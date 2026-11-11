/**
 * GUY 1 -> GUY 2: Cryptographic SHA-256 Hash-Chained Audit Ledger
 * Computes hashes, chains entries to backend/db, and verifies ledger integrity.
 * Capture outcomes are new rows. Historical rows are never rewritten here.
 */

const crypto = require("crypto");

function getDb() {
  const candidates = ["../db", "../backend/db"];
  for (const candidate of candidates) {
    try {
      const db = require(candidate);
      if (db && typeof db.appendLog === "function" && typeof db.getLastLog === "function") {
        return db;
      }
    } catch (_) {
      /* try the next location */
    }
  }
  throw new Error("Unable to locate backend/db");
}

const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Pure SHA-256 hash over the canonical payload.
 * payment_status is stored on the row but is not part of this payload,
 * matching the original chain contract. Tampering with a hashed field breaks verifyChain.
 */
function computeHash(entry, prevHash = GENESIS_HASH) {
  const canonical = JSON.stringify({
    prev_hash: prevHash,
    timestamp: entry.timestamp || "",
    request_summary: entry.request_summary || "",
    merchant: entry.merchant || "",
    quoted_amount: Number(entry.quoted_amount || 0).toFixed(2),
    checkout_amount: Number(entry.checkout_amount || 0).toFixed(2),
    decision: entry.decision || "",
    reason: entry.reason || "",
    risk_score: Number(entry.risk_score || 0),
  });

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function paymentStatusFor(decision) {
  if (decision === "ALLOW") return "PENDING_EXECUTION";
  if (decision === "ASK_HUMAN") return "AWAITING_APPROVAL";
  return "BLOCKED";
}

/**
 * In-memory hashed entry used by the offline shopper demo.
 * Does not write to the database.
 */
function createAuditLogEntry(evaluatedIntent, prevHash = GENESIS_HASH) {
  const source = evaluatedIntent || {};
  const pe = source.policy_evaluation || {};
  const q = source.quarantine_extracted || {};
  const c = source.checkout_verification || {};
  const decision = ["ALLOW", "ASK_HUMAN", "DENY"].includes(pe.decision) ? pe.decision : "DENY";
  const entry = {
    timestamp: source.timestamp || new Date().toISOString(),
    request_summary: String(q.product_name || q.product_id || "").slice(0, 120),
    merchant: q.merchant_id || "",
    quoted_amount: Number(q.quoted_price || 0),
    checkout_amount:
      c.live_checkout_price === undefined || c.live_checkout_price === null
        ? Number(q.quoted_price || 0)
        : Number(c.live_checkout_price),
    decision,
    reason: pe.reason || "Policy Engine returned no valid decision",
    risk_score: Number(pe.risk_score || 0),
    paypal_order_id: null,
    payment_status: paymentStatusFor(decision),
    prev_hash: prevHash || GENESIS_HASH,
    user_prompt: source.user_prompt || "",
  };
  entry.entry_hash = computeHash(entry, entry.prev_hash);
  return entry;
}

/**
 * Appends an entry to the audit log.
 * @param {Object} entry Unhashed log data
 * @returns {number|string|Promise<number|string>} New row ID
 */
function appendAudit(entry) {
  const db = getDb();
  const lastResult = db.getLastLog ? db.getLastLog() : null;

  if (lastResult && typeof lastResult.then === "function") {
    return (async () => {
      const lastRow = await lastResult;
      const prev_hash = lastRow && lastRow.entry_hash ? lastRow.entry_hash : GENESIS_HASH;
      const payload = {
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
        prev_hash,
      };
      payload.entry_hash = computeHash(payload, prev_hash);
      const res = await db.appendLog(payload);
      return res && (res.id || res.lastInsertRowid) ? res.id || res.lastInsertRowid : res;
    })();
  }

  const prev_hash = lastResult && lastResult.entry_hash ? lastResult.entry_hash : GENESIS_HASH;
  const payload = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
    prev_hash,
  };
  payload.entry_hash = computeHash(payload, prev_hash);
  const res = db.appendLog(payload);
  return res && (res.id || res.lastInsertRowid) ? res.id || res.lastInsertRowid : res;
}

function getLastAudit() {
  const db = getDb();
  return db.getLastLog();
}

function verifyChain() {
  const db = getDb();
  const allLogsResult = db.getAllLogs ? db.getAllLogs() : db.getLogs ? db.getLogs() : [];

  if (allLogsResult && typeof allLogsResult.then === "function") {
    return (async () => {
      const logs = await allLogsResult;
      return _checkChain(logs);
    })();
  }

  return _checkChain(allLogsResult);
}

function _checkChain(logs = []) {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < logs.length; i++) {
    const row = logs[i];
    const recalculated = computeHash(row, expectedPrevHash);

    if (row.prev_hash !== expectedPrevHash || row.entry_hash !== recalculated) {
      return {
        ok: false,
        brokenAt: row.id !== undefined ? row.id : i + 1,
        reason: `Cryptographic hash mismatch at Block #${row.id !== undefined ? row.id : i + 1} (${row.request_summary || "Unknown"}). Expected prev_hash: ${expectedPrevHash.slice(0, 10)}..., recalculated: ${recalculated.slice(0, 10)}..., stored: ${row.entry_hash ? row.entry_hash.slice(0, 10) : "null"}...`,
      };
    }
    expectedPrevHash = row.entry_hash;
  }

  return {
    ok: true,
    brokenAt: null,
    reason: `All ${logs.length} hash-chained audit blocks cryptographically verified.`,
  };
}

function generateDisputeEvidencePacket(auditRow, allLogs = []) {
  return require("./disputeEvidence").buildDisputeEvidenceBundle(auditRow, allLogs);
}

module.exports = {
  appendAudit,
  verifyChain,
  computeHash,
  createAuditLogEntry,
  getLastAudit,
  generateDisputeEvidencePacket,
  GENESIS_HASH,
  computeEntryHash: computeHash,
  verifyAuditChain: (entries) => {
    const v = _checkChain(entries);
    return {
      valid: v.ok,
      broken_at_id: v.brokenAt,
      broken_at_index: v.brokenAt,
      message: v.reason,
    };
  },
};
