/**
 * GUY 1 -> GUY 2: Deterministic Policy Engine
 * "The LLM proposes. Deterministic code disposes."
 * Pure, synchronous, deterministic rule-based evaluation. Zero I/O.
 * The only decisions are ALLOW, ASK_HUMAN, and DENY. Anything else fails closed.
 */

const DECISIONS = Object.freeze(["ALLOW", "ASK_HUMAN", "DENY"]);

const POLICY_RULES = Object.freeze({
  AUTO_APPROVE_LIMIT: 50.0,
  HARD_TRANSACTION_CAP: 150.0,
  DAILY_BUDGET_CAP: 300.0,
  MAX_TX_PER_MINUTE: 3,
  ALLOWED_MERCHANTS: Object.freeze(["merch_technova", "merch_cyberdock", "merch_shadydeals"]),
});

// In-memory spend ledger for the offline shopper demo only.
// The HTTP path passes policy_context from the database and never reads this.
let memoryLedger = { dailySpent: 0, timestamps: [] };

function resetPolicyState() {
  memoryLedger = { dailySpent: 0, timestamps: [] };
  return { dailySpent: 0, txLastMinute: 0 };
}

function recordSuccessfulSpend(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { ...memoryLedger };
  const now = Date.now();
  memoryLedger.dailySpent += n;
  memoryLedger.timestamps.push(now);
  memoryLedger.timestamps = memoryLedger.timestamps.filter((t) => now - t < 60_000);
  return { dailySpent: memoryLedger.dailySpent, txLastMinute: memoryLedger.timestamps.length };
}

function getInMemoryContext() {
  const now = Date.now();
  memoryLedger.timestamps = memoryLedger.timestamps.filter((t) => now - t < 60_000);
  return {
    daily_spent: memoryLedger.dailySpent,
    tx_last_minute: memoryLedger.timestamps.length,
  };
}

function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function money(c) {
  return (c / 100).toFixed(2);
}

function limitsFrom(intent) {
  const cfg = (intent && intent.policy_config) || {};
  const merchants = Array.isArray(cfg.allowedMerchants)
    ? cfg.allowedMerchants
        .map(String)
        .filter((merchant) => POLICY_RULES.ALLOWED_MERCHANTS.includes(merchant))
    : POLICY_RULES.ALLOWED_MERCHANTS;
  const configuredAuto = cents(
    cfg.autoApproveLimit !== undefined ? cfg.autoApproveLimit : POLICY_RULES.AUTO_APPROVE_LIMIT
  );
  const configuredHard = cents(
    cfg.hardTransactionCap !== undefined ? cfg.hardTransactionCap : POLICY_RULES.HARD_TRANSACTION_CAP
  );
  return {
    auto: configuredAuto === null
      ? cents(POLICY_RULES.AUTO_APPROVE_LIMIT)
      : Math.min(configuredAuto, cents(POLICY_RULES.AUTO_APPROVE_LIMIT)),
    hard: configuredHard === null
      ? cents(POLICY_RULES.HARD_TRANSACTION_CAP)
      : Math.min(configuredHard, cents(POLICY_RULES.HARD_TRANSACTION_CAP)),
    daily: Math.min(
      cents(cfg.dailyBudgetCap !== undefined ? cfg.dailyBudgetCap : POLICY_RULES.DAILY_BUDGET_CAP) ??
        cents(POLICY_RULES.DAILY_BUDGET_CAP),
      cents(POLICY_RULES.DAILY_BUDGET_CAP)
    ),
    velocity: Number.isFinite(Number(cfg.maxTxPerMinute)) && Number(cfg.maxTxPerMinute) > 0
      ? Math.min(Number(cfg.maxTxPerMinute), POLICY_RULES.MAX_TX_PER_MINUTE)
      : POLICY_RULES.MAX_TX_PER_MINUTE,
    merchants,
  };
}

function closedDeny(reason, rules) {
  return {
    decision: "DENY",
    risk_score: 100,
    rules_checked: rules,
    reason,
  };
}

/**
 * Evaluates a purchase intent against deterministic rules.
 * Ignores any decision proposed by an LLM.
 * @param {Object} intent
 * @returns {{ decision: "ALLOW"|"ASK_HUMAN"|"DENY", risk_score: number, rules_checked: Object, reason: string }}
 */
function evaluate(intent) {
  const emptyRules = {
    quarantine_clean: false,
    intent_alignment: false,
    merchant_allowlist: false,
    merchant_binding: false,
    price_drift_pass: false,
    hard_cap_pass: false,
    budget_cap_pass: false,
    daily_budget_pass: false,
    velocity_pass: false,
  };

  if (!intent || typeof intent !== "object") {
    return closedDeny("Policy Engine received no purchase intent", emptyRules);
  }

  const q = intent.quarantine_extracted || {};
  const c = intent.checkout_verification || {};
  const ctx = intent.policy_context || {};
  const limits = limitsFrom(intent);
  const contextPresent =
    Object.prototype.hasOwnProperty.call(intent, "policy_context") &&
    ctx.daily_spent !== undefined &&
    ctx.tx_last_minute !== undefined;

  const quotedCents = cents(q.quoted_price);
  const liveCents = cents(c.live_checkout_price);
  const quotedMerchant = String(q.merchant_id || "");
  const liveMerchant = c.merchant_id ? String(c.merchant_id) : "";
  const merchantForList = liveMerchant || quotedMerchant;
  const quotedCurrency = q.currency ? String(q.currency).toUpperCase() : "";
  const liveCurrency = c.currency ? String(c.currency).toUpperCase() : "";

  const injectionDetected = Boolean(q.injection_detected);
  const currencyValid =
    /^[A-Z]{3}$/.test(quotedCurrency) &&
    /^[A-Z]{3}$/.test(liveCurrency) &&
    quotedCurrency === liveCurrency;
  const priceMismatch =
    quotedCents === null || liveCents === null || quotedCents !== liveCents || !currencyValid;
  const currencyMismatch = !currencyValid;
  const priceDriftDetected = Boolean(c.price_drift_detected) || priceMismatch || currencyMismatch;
  const alignmentPass = intent.intent_alignment_pass !== false && ctx.intent_alignment_pass !== false;
  const bindingPass = Boolean(quotedMerchant && liveMerchant && liveMerchant === quotedMerchant);
  const merchantPass = limits.merchants.includes(merchantForList);
  const hardCapPass = liveCents !== null && liveCents > 0 && liveCents <= limits.hard;

  const dailySpent = cents(ctx.daily_spent === undefined ? 0 : ctx.daily_spent);
  const projected = (liveCents || 0) + dailySpent;
  const dailyPass =
    contextPresent &&
    dailySpent !== null &&
    dailySpent >= 0 &&
    liveCents !== null &&
    projected <= limits.daily;
  const recent = Number(ctx.tx_last_minute === undefined ? 0 : ctx.tx_last_minute);
  const velocityPass =
    contextPresent && Number.isFinite(recent) && recent >= 0 && recent < limits.velocity;

  const rules_checked = {
    quarantine_clean: !injectionDetected,
    intent_alignment: alignmentPass,
    merchant_allowlist: merchantPass,
    merchant_binding: bindingPass,
    checkout_verification_pass: !priceMismatch && bindingPass,
    price_drift_pass: !priceDriftDetected,
    hard_cap_pass: hardCapPass,
    // Historical name used by earlier callers for the per-transaction cap.
    budget_cap_pass: hardCapPass,
    daily_budget_pass: dailyPass,
    velocity_pass: velocityPass,
  };

  const violations = [];
  let risk_score = 5;

  if (injectionDetected) {
    risk_score += 90;
    violations.push(
      `Prompt Injection detected in untrusted product page (${q.stripped_payload || "SYSTEM OVERRIDE detected"})`
    );
  }
  if (!alignmentPass) {
    risk_score += 85;
    violations.push("Purchase intent does not match the user's request");
  }
  if (!bindingPass) {
    risk_score += 90;
    violations.push(
      `Quoted merchant '${quotedMerchant}' does not match the live checkout merchant '${liveMerchant}'`
    );
  }
  if (!merchantPass) {
    risk_score += 90;
    violations.push(`Merchant '${merchantForList}' is NOT in the verified allowlist`);
  }
  if (priceDriftDetected) {
    risk_score += 90;
    const quotedLabel = quotedCents === null ? "invalid" : money(quotedCents);
    const liveLabel = liveCents === null ? "invalid" : money(liveCents);
    violations.push(
      `TOCTOU Price-Drift Attack blocked: Quoted $${quotedLabel} != Checkout $${liveLabel}`
    );
  }
  if (!hardCapPass) {
    risk_score += 75;
    const liveLabel = liveCents === null ? "invalid" : money(liveCents);
    violations.push(
      `Amount $${liveLabel} exceeds hard per-transaction cap of $${money(limits.hard)}`
    );
  }
  if (!dailyPass) {
    risk_score += 70;
    violations.push(
      `Daily spending limit exceeded: projected $${money(projected)} exceeds $${money(limits.daily)}`
    );
  }
  if (!velocityPass) {
    risk_score += 65;
    violations.push(
      `Velocity limit exceeded: ${recent} purchases in the last minute (max ${limits.velocity})`
    );
  }

  if (violations.length === 0 && liveCents > limits.auto) {
    risk_score = 35;
  }
  risk_score = Math.min(100, Math.max(0, risk_score));

  let decision = "ALLOW";
  let reason = "All deterministic security gates passed.";

  if (violations.length > 0) {
    decision = "DENY";
    reason = violations.join(" | ");
  } else if (liveCents > limits.auto) {
    decision = "ASK_HUMAN";
    reason = `Amount $${money(liveCents)} exceeds autonomous threshold ($${money(limits.auto)}). Human payer approval required.`;
  }

  if (!DECISIONS.includes(decision)) {
    return closedDeny("Policy Engine produced an invalid decision", rules_checked);
  }

  return { decision, risk_score, rules_checked, reason };
}

function evaluatePurchaseIntent(intent, policyConfig) {
  const prepared = {
    ...(intent || {}),
    policy_config: policyConfig || (intent && intent.policy_config) || undefined,
    policy_context: (intent && intent.policy_context) || getInMemoryContext(),
  };
  return {
    intent_id: prepared.intent_id || `int_${Date.now()}`,
    timestamp: prepared.timestamp || new Date().toISOString(),
    user_prompt: prepared.user_prompt || "",
    quarantine_extracted: prepared.quarantine_extracted,
    checkout_verification: prepared.checkout_verification,
    intent_alignment_pass: prepared.intent_alignment_pass,
    policy_evaluation: evaluate(prepared),
  };
}

module.exports = {
  evaluate,
  evaluatePurchaseIntent,
  resetPolicyState,
  recordSuccessfulSpend,
  getInMemoryContext,
  POLICY_RULES,
  DECISIONS,
};
