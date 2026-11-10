/**
 * GUY 1 (BYCER) - PHASE 4: PayPal Disputes API Forensic Evidence Generator
 * Bundles User Prompt, Quarantine LLM Snapshot, Policy Gate Rules,
 * SHA-256 Hash Chain Proof, and PayPal Sandbox Order ID into:
 * 1) A PayPal Customer Disputes API (`provide-evidence`) JSON payload
 * 2) A printable HTML/PDF Forensic Certificate
 */

const crypto = require("crypto");
const { computeEntryHash, verifyAuditChain } = require("./auditChain");

function buildDisputeEvidenceBundle(auditRow, allLogs = []) {
  if (!auditRow) {
    throw new Error("auditRow is required to generate a dispute evidence packet");
  }

  const recalculatedRowHash = computeEntryHash(auditRow, auditRow.prev_hash);
  const rowHashIntact = recalculatedRowHash === auditRow.entry_hash;
  const fullChainStatus =
    allLogs.length > 0
      ? verifyAuditChain(allLogs)
      : {
          valid: rowHashIntact,
          total_blocks: 1,
          message: rowHashIntact ? "Single block hash verified intact." : "CRITICAL: Block hash mismatch!",
        };

  const evidencePacketId = `WARDEN-EVID-${auditRow.id || 1}-${Date.now().toString().slice(-5)}`;

  const payloadForSeal = JSON.stringify({
    packet_id: evidencePacketId,
    block_id: auditRow.id,
    paypal_order_id: auditRow.paypal_order_id,
    entry_hash: auditRow.entry_hash,
    row_hash_intact: rowHashIntact,
  });

  const forensicSeal = crypto.createHash("sha256").update(payloadForSeal).digest("hex");

  return {
    evidence_packet_id: evidencePacketId,
    generated_at: new Date().toISOString(),
    schema_version: "paypal.disputes.evidence.v1",
    paypal_dispute_api_payload: {
      evidence_type:
        auditRow.decision === "ALLOW"
          ? "PROOF_OF_FULFILLMENT_AND_AUTHORIZATION"
          : "PROOF_OF_FRAUD_OR_INJECTION_PREVENTION",
      evidence_info: {
        tracking_info: [],
        refund_ids: [],
        custom_forensic_metadata: {
          paypal_sandbox_order_id: auditRow.paypal_order_id || "NONE_BLOCKED_PRE_EXECUTION",
          payment_settlement_status: auditRow.payment_status,
          merchant_identifier: auditRow.merchant,
          item_description: auditRow.request_summary,
          quoted_price_usd: Number(auditRow.quoted_amount).toFixed(2),
          checkout_price_usd: Number(auditRow.checkout_amount).toFixed(2),
          price_drift_delta_usd: (Number(auditRow.checkout_amount) - Number(auditRow.quoted_amount)).toFixed(2),
        },
      },
      notes: `Warden Deterministic Firewall Verdict: [${auditRow.decision}] (Risk Score: ${auditRow.risk_score}/100). Reason: ${auditRow.reason}. Cryptographic SHA-256 Block Hash: ${auditRow.entry_hash}.`,
    },
    warden_forensic_audit: {
      block_number: auditRow.id || 1,
      timestamp_utc: auditRow.timestamp,
      original_user_intent: auditRow.user_prompt || `Purchase request: ${auditRow.request_summary}`,
      quarantine_llm_snapshot: {
        sanitized_product_name: auditRow.request_summary,
        merchant_id: auditRow.merchant,
        quoted_amount_usd: Number(auditRow.quoted_amount),
        untrusted_payload_preview: auditRow.raw_html || "Clean structured extraction (No HTML injection)",
      },
      deterministic_policy_gate: {
        principle: "The LLM proposes. Deterministic code disposes.",
        verdict: auditRow.decision,
        risk_score: auditRow.risk_score,
        rule_explanation: auditRow.reason,
      },
      cryptographic_hash_chain_proof: {
        hash_algorithm: "SHA-256",
        previous_block_hash: auditRow.prev_hash,
        recorded_entry_hash: auditRow.entry_hash,
        recalculated_entry_hash: recalculatedRowHash,
        block_signature_valid: rowHashIntact,
        ledger_chain_valid: fullChainStatus.valid,
        ledger_verification_note: fullChainStatus.message,
        packet_integrity_seal: forensicSeal,
      },
    },
  };
}

function generatePrintableDisputeHTML(evidenceBundle) {
  const api = evidenceBundle.paypal_dispute_api_payload;
  const meta = api.evidence_info.custom_forensic_metadata;
  const audit = evidenceBundle.warden_forensic_audit;
  const cryptoProof = audit.cryptographic_hash_chain_proof;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PayPal Forensic Dispute Evidence - ${evidenceBundle.evidence_packet_id}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #0f172a; padding: 32px; max-width: 820px; margin: 0 auto; }
    .header { border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .badge { padding: 4px 10px; font-weight: bold; border-radius: 4px; font-size: 12px; border: 1px solid #0f172a; }
    .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 16px; background: #f8fafc; }
    .section h3 { margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 210px 1fr; row-gap: 6px; font-size: 12px; }
    .hash { word-break: break-all; font-size: 11px; background: #e2e8f0; padding: 6px; border-radius: 4px; margin-top: 4px; }
    .status-ok { color: #047857; font-weight: bold; }
    .status-bad { color: #be123c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin:0; font-size: 20px;">🛡️ WARDEN FORENSIC DISPUTE EVIDENCE PACKET</h1>
      <div style="font-size: 12px; color: #475569; margin-top: 4px;">
        PayPal Disputes API Ready • Principle: "The LLM proposes. Deterministic code disposes."
      </div>
    </div>
    <div class="badge">${evidenceBundle.evidence_packet_id}</div>
  </div>

  <div class="section">
    <h3>1. PayPal Sandbox Transaction & Settlement Summary</h3>
    <div class="grid">
      <strong>Evidence Type:</strong> <span>${api.evidence_type}</span>
      <strong>PayPal Order ID:</strong> <span>${meta.paypal_sandbox_order_id}</span>
      <strong>Settlement Status:</strong> <span>${meta.payment_settlement_status}</span>
      <strong>Merchant ID:</strong> <span>${meta.merchant_identifier}</span>
      <strong>Item Summary:</strong> <span>${meta.item_description}</span>
      <strong>Quoted vs. Checkout:</strong> <span>Quoted $${meta.quoted_price_usd} USD / Checkout $${meta.checkout_price_usd} USD (Delta: $${meta.price_drift_delta_usd})</span>
    </div>
  </div>

  <div class="section">
    <h3>2. Dual-LLM Quarantine & Deterministic Policy Gate Verdict</h3>
    <div class="grid">
      <strong>Audit Block #:</strong> <span>#${audit.block_number} (${audit.timestamp_utc})</span>
      <strong>Gate Decision:</strong> <span>${audit.deterministic_policy_gate.verdict} (Risk Score: ${audit.deterministic_policy_gate.risk_score}/100)</span>
      <strong>Deterministic Rule Reason:</strong> <span>${audit.deterministic_policy_gate.rule_explanation}</span>
      <strong>Quarantine Payload Snapshot:</strong> <span>${audit.quarantine_llm_snapshot.untrusted_payload_preview}</span>
    </div>
  </div>

  <div class="section">
    <h3>3. Cryptographic SHA-256 Hash-Chain Verification</h3>
    <div class="grid">
      <strong>Block Signature Status:</strong>
      <span class="${cryptoProof.block_signature_valid ? "status-ok" : "status-bad"}">
        ${cryptoProof.block_signature_valid ? "VERIFIED INTACT (MATCHES SHA-256)" : "TAMPERING DETECTED (HASH MISMATCH)"}
      </span>
      <strong>Full Ledger Chain Status:</strong>
      <span>${cryptoProof.ledger_verification_note}</span>
    </div>
    <div class="hash"><strong>Previous Block Hash:</strong> ${cryptoProof.previous_block_hash}</div>
    <div class="hash"><strong>Recorded Entry Hash:</strong> ${cryptoProof.recorded_entry_hash}</div>
    <div class="hash"><strong>Recalculated Hash:</strong>   ${cryptoProof.recalculated_entry_hash}</div>
    <div class="hash"><strong>Forensic Packet Seal:</strong> ${cryptoProof.packet_integrity_seal}</div>
  </div>
</body>
</html>`;
}

module.exports = {
  buildDisputeEvidenceBundle,
  generatePrintableDisputeHTML,
};
