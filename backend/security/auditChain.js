/**
 * GUY 1 (BYCER): Cryptographic SHA-256 Hash-Chained Audit Ledger
 */

const crypto = require("crypto");

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

function computeEntryHash(entry, prevHash = GENESIS_HASH) {
  const canonicalPayload = JSON.stringify({
    prev_hash: prevHash,
    timestamp: entry.timestamp,
    request_summary: entry.request_summary,
    merchant: entry.merchant,
    quoted_amount: Number(entry.quoted_amount).toFixed(2),
    checkout_amount: Number(entry.checkout_amount).toFixed(2),
    decision: entry.decision,
    reason: entry.reason,
    risk_score: Number(entry.risk_score),
  });

  return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}

function createAuditLogEntry(evaluatedIntent, prevHash = GENESIS_HASH, extra = {}) {
  const q = evaluatedIntent.quarantine_extracted;
  const c = evaluatedIntent.checkout_verification;
  const p = evaluatedIntent.policy_evaluation;

  const draftEntry = {
    timestamp: evaluatedIntent.timestamp || new Date().toISOString(),
    request_summary: q.product_name || evaluatedIntent.user_prompt,
    merchant: q.merchant_id,
    quoted_amount: q.quoted_price,
    checkout_amount: c.live_checkout_price,
    decision: p.decision,
    reason: p.reason,
    risk_score: p.risk_score,
    paypal_order_id: extra.paypal_order_id || null,
    payment_status: extra.payment_status || (p.decision === "DENY" ? "BLOCKED" : p.decision === "ASK_HUMAN" ? "AWAITING_APPROVAL" : "PENDING_EXECUTION"),
    prev_hash: prevHash || GENESIS_HASH,
  };

  draftEntry.entry_hash = computeEntryHash(draftEntry, draftEntry.prev_hash);
  return draftEntry;
}

function verifyAuditChain(entries = []) {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    const recalculatedHash = computeEntryHash(row, expectedPrevHash);

    if (row.prev_hash !== expectedPrevHash || row.entry_hash !== recalculatedHash) {
      return {
        valid: false,
        total_blocks: entries.length,
        broken_at_index: i,
        broken_at_id: row.id ?? i + 1,
        expected_hash: recalculatedHash,
        actual_hash: row.entry_hash,
        message: `CRITICAL: Tampering detected at Audit Block #${row.id ?? i + 1} (${row.request_summary}). Hash mismatch!`,
      };
    }
    expectedPrevHash = row.entry_hash;
  }

  return {
    valid: true,
    total_blocks: entries.length,
    broken_at_index: null,
    broken_at_id: null,
    message: `All ${entries.length} hash-chained audit blocks cryptographically verified.`,
  };
}

module.exports = {
  GENESIS_HASH,
  computeEntryHash,
  createAuditLogEntry,
  verifyAuditChain,
};
