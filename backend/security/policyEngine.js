/**
 * GUY 1 (BYCER): Deterministic Policy Engine
 * "The LLM proposes. Deterministic code disposes."
 */

const { getLiveCheckoutPrice } = require("../catalog/attackStorefront");

const DEFAULT_POLICY_CONFIG = {
  autoApproveLimit: 50.00,
  hardTransactionCap: 150.00,
  dailyBudgetCap: 300.00,
  maxTxPerMinute: 3,
  allowedMerchants: [
    "merch_technova",
    "merch_cyberdock",
    "merch_shadydeals",
  ],
};

let policyState = {
  dailySpentUSD: 0.00,
  recentTransactionTimestamps: [],
};

function evaluatePurchaseIntent(intent, customConfig = {}) {
  const config = { ...DEFAULT_POLICY_CONFIG, ...customConfig };
  const now = Date.now();

  const extracted = intent.quarantine_extracted || {};
  const productId = extracted.product_id;
  const merchantId = extracted.merchant_id;
  const quotedPrice = Number(extracted.quoted_price || 0);

  let checkoutCheck = {
    live_checkout_price: quotedPrice,
    price_drift_detected: false,
  };
  try {
    if (productId) {
      checkoutCheck = getLiveCheckoutPrice(productId);
    }
  } catch (err) {
    checkoutCheck = {
      live_checkout_price: quotedPrice,
      price_drift_detected: true,
      error: err.message,
    };
  }

  const livePrice = Number(checkoutCheck.live_checkout_price);

  const merchantAllowlistPass = config.allowedMerchants.includes(merchantId);
  const priceDriftPass = !checkoutCheck.price_drift_detected && livePrice === quotedPrice;
  const hardCapPass = livePrice > 0 && livePrice <= config.hardTransactionCap;
  const dailyBudgetPass = policyState.dailySpentUSD + livePrice <= config.dailyBudgetCap;

  policyState.recentTransactionTimestamps = policyState.recentTransactionTimestamps.filter((ts) => now - ts < 60000);
  const velocityPass = policyState.recentTransactionTimestamps.length < config.maxTxPerMinute;

  const quarantineCleanPass = !extracted.injection_detected;
  const intentAlignmentPass = intent.intent_alignment_pass !== undefined ? Boolean(intent.intent_alignment_pass) : quarantineCleanPass;

  let riskScore = 5;
  const failedReasons = [];

  if (!quarantineCleanPass) {
    riskScore += 90;
    failedReasons.push(`Prompt Injection detected & stripped by Quarantine LLM (${extracted.stripped_payload || "malicious instruction override"})`);
  }
  if (!intentAlignmentPass) {
    riskScore += 85;
    failedReasons.push("Proposed purchase does not match original user request intent");
  }
  if (!merchantAllowlistPass) {
    riskScore += 90;
    failedReasons.push(`Merchant '${merchantId}' is NOT in the verified allowlist`);
  }
  if (!priceDriftPass) {
    riskScore += 90;
    failedReasons.push(`TOCTOU Price-Drift Attack blocked: Quoted $${quotedPrice.toFixed(2)} != Checkout $${livePrice.toFixed(2)}`);
  }
  if (!hardCapPass) {
    riskScore += 75;
    failedReasons.push(`Amount $${livePrice.toFixed(2)} exceeds hard per-transaction cap of $${config.hardTransactionCap.toFixed(2)}`);
  }
  if (!dailyBudgetPass) {
    riskScore += 70;
    failedReasons.push(`Purchase would exceed daily cap of $${config.dailyBudgetCap.toFixed(2)} (Already spent: $${policyState.dailySpentUSD.toFixed(2)})`);
  }
  if (!velocityPass) {
    riskScore += 65;
    failedReasons.push(`Velocity limit exceeded: Max ${config.maxTxPerMinute} purchases per minute`);
  }

  if (failedReasons.length === 0 && livePrice > config.autoApproveLimit) {
    riskScore = 35;
  }

  riskScore = Math.min(100, riskScore);

  let decision = "ALLOW";
  let reason = "All deterministic security gates passed.";

  if (failedReasons.length > 0) {
    decision = "DENY";
    reason = failedReasons.join(" | ");
  } else if (livePrice > config.autoApproveLimit) {
    decision = "ASK_HUMAN";
    reason = `Clean check, but $${livePrice.toFixed(2)} exceeds $${config.autoApproveLimit.toFixed(2)} autonomous limit. Human payer approval required.`;
  }

  return {
    intent_id: intent.intent_id || `int_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user_prompt: intent.user_prompt || "",
    quarantine_extracted: {
      product_id: productId,
      product_name: extracted.product_name || "Unknown Product",
      merchant_id: merchantId,
      quoted_price: quotedPrice,
      currency: extracted.currency || "USD",
      injection_detected: Boolean(extracted.injection_detected),
      stripped_payload: extracted.stripped_payload || null,
    },
    checkout_verification: {
      live_checkout_price: livePrice,
      price_drift_detected: Boolean(checkoutCheck.price_drift_detected),
    },
    policy_evaluation: {
      decision,
      risk_score: riskScore,
      rules_checked: {
        quarantine_clean_pass: quarantineCleanPass,
        budget_cap_pass: hardCapPass && dailyBudgetPass,
        merchant_allowlist_pass: merchantAllowlistPass,
        price_drift_pass: priceDriftPass,
        intent_alignment_pass: intentAlignmentPass,
        velocity_pass: velocityPass,
      },
      reason,
    },
  };
}

function recordSuccessfulSpend(amountUSD) {
  policyState.dailySpentUSD += Number(amountUSD);
  policyState.recentTransactionTimestamps.push(Date.now());
}

function resetPolicyState() {
  policyState = { dailySpentUSD: 0.00, recentTransactionTimestamps: [] };
  return policyState;
}

function getPolicyConfig() {
  return DEFAULT_POLICY_CONFIG;
}

module.exports = {
  evaluatePurchaseIntent,
  recordSuccessfulSpend,
  resetPolicyState,
  getPolicyConfig,
};
