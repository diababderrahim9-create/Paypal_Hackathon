/**
 * GUY 1 (BYCER) -> GUY 2: Dynamic Human-Controlled Deterministic Policy Engine
 * "The LLM proposes. Deterministic code disposes."
 * Pure, synchronous, deterministic rule-based evaluation with dynamic human budget bounds.
 */

const SYSTEM_SAFETY_CEILING = 1000.00; // Absolute upper bound safety guardrail

const DEFAULT_POLICY_LIMITS = {
  autoApproveLimit: Number(process.env.AUTO_APPROVE_LIMIT || 50.00),
  hardTransactionCap: Number(process.env.HARD_TRANSACTION_CAP || 150.00),
  dailyBudgetCap: Number(process.env.DAILY_BUDGET_CAP || 300.00),
  maxTxPerMinute: 3,
  allowedMerchants: [
    "merch_technova",
    "merch_cyberdock",
    "merch_shadydeals",
  ],
};

let humanPolicyLimits = {
  autoApproveLimit: DEFAULT_POLICY_LIMITS.autoApproveLimit,
  hardTransactionCap: DEFAULT_POLICY_LIMITS.hardTransactionCap,
  dailyBudgetCap: DEFAULT_POLICY_LIMITS.dailyBudgetCap,
  maxTxPerMinute: DEFAULT_POLICY_LIMITS.maxTxPerMinute,
  allowedMerchants: [...DEFAULT_POLICY_LIMITS.allowedMerchants],
};

let isHumanLimitOverridden = false;

let spendTracker = {
  dailySpentUSD: 0.00,
  recentTransactionTimestamps: [],
};

const POLICY_RULES = {};
Object.defineProperties(POLICY_RULES, {
  autoApproveLimit: {
    get: () => humanPolicyLimits.autoApproveLimit,
    enumerable: true,
  },
  hardTransactionCap: {
    get: () => humanPolicyLimits.hardTransactionCap,
    enumerable: true,
  },
  dailyBudgetCap: {
    get: () => humanPolicyLimits.dailyBudgetCap,
    enumerable: true,
  },
  maxTxPerMinute: {
    get: () => humanPolicyLimits.maxTxPerMinute,
    enumerable: true,
  },
  MAX_TX_PER_MINUTE: {
    get: () => humanPolicyLimits.maxTxPerMinute,
    enumerable: true,
  },
  allowedMerchants: {
    get: () => [...humanPolicyLimits.allowedMerchants],
    enumerable: true,
  },
});

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampLimit(value, min, max, fallback) {
  const safe = normalizeNumber(value, fallback);
  return Math.min(Math.max(safe, min), max);
}

function setPolicyLimits(newLimits = {}) {
  const nextHumanLimits = { ...humanPolicyLimits };
  const source = newLimits && typeof newLimits === 'object' ? newLimits : {};

  let dailyCap =
    source.dailyBudgetCap !== undefined ? Number(source.dailyBudgetCap) : nextHumanLimits.dailyBudgetCap;
  let hardCap =
    source.hardTransactionCap !== undefined ? Number(source.hardTransactionCap) : nextHumanLimits.hardTransactionCap;
  let autoLimit =
    source.autoApproveLimit !== undefined ? Number(source.autoApproveLimit) : nextHumanLimits.autoApproveLimit;
  let maxTx =
    source.maxTxPerMinute !== undefined ? Number(source.maxTxPerMinute) : nextHumanLimits.maxTxPerMinute;

  dailyCap = clampLimit(dailyCap, 1, SYSTEM_SAFETY_CEILING, 300);
  hardCap = clampLimit(hardCap, 1, dailyCap, 150);
  autoLimit = clampLimit(autoLimit, 0, hardCap, 50);
  maxTx = clampLimit(maxTx, 1, 100, DEFAULT_POLICY_LIMITS.maxTxPerMinute);

  humanPolicyLimits = {
    ...humanPolicyLimits,
    autoApproveLimit: Number(autoLimit.toFixed(2)),
    hardTransactionCap: Number(hardCap.toFixed(2)),
    dailyBudgetCap: Number(dailyCap.toFixed(2)),
    maxTxPerMinute: Number(maxTx.toFixed(0)),
    allowedMerchants: Array.isArray(source.allowedMerchants)
      ? [...source.allowedMerchants]
      : [...humanPolicyLimits.allowedMerchants],
  };

  isHumanLimitOverridden = true;
  return getPolicyLimits();
}

function extractPromptAutoApproveLimit(userPrompt = "") {
  if (isHumanLimitOverridden) {
    return humanPolicyLimits.autoApproveLimit;
  }

  const text = String(userPrompt || "");
  const match = text.match(
    /(?:under|below|max|limit|up\s+to|budget(?:\s+of)?)\s*\$\s*(\d+(?:\.\d{1,2})?)/i
  );

  if (match && match[1]) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return Math.min(parsed, humanPolicyLimits.hardTransactionCap);
    }
  }

  return humanPolicyLimits.autoApproveLimit;
}

function getPolicyLimits() {
  return {
    ...humanPolicyLimits,
    isHumanLimitOverridden,
    systemSafetyCeiling: SYSTEM_SAFETY_CEILING,
    dailySpentUSD: Number(spendTracker.dailySpentUSD.toFixed(2)),
    remainingDailyBudgetUSD: Number(
      Math.max(0, humanPolicyLimits.dailyBudgetCap - spendTracker.dailySpentUSD).toFixed(2)
    ),
    MAX_TX_PER_MINUTE: humanPolicyLimits.maxTxPerMinute,
  };
}

function resetPolicyState() {
  humanPolicyLimits = {
    autoApproveLimit: DEFAULT_POLICY_LIMITS.autoApproveLimit,
    hardTransactionCap: DEFAULT_POLICY_LIMITS.hardTransactionCap,
    dailyBudgetCap: DEFAULT_POLICY_LIMITS.dailyBudgetCap,
    maxTxPerMinute: DEFAULT_POLICY_LIMITS.maxTxPerMinute,
    allowedMerchants: [...DEFAULT_POLICY_LIMITS.allowedMerchants],
  };
  isHumanLimitOverridden = false;
  spendTracker = {
    dailySpentUSD: 0.00,
    recentTransactionTimestamps: [],
  };
  return getPolicyLimits();
}

function recordSuccessfulSpend(amountUSD) {
  const amt = normalizeNumber(amountUSD, 0);
  if (amt > 0) {
    spendTracker.dailySpentUSD = Number((spendTracker.dailySpentUSD + amt).toFixed(2));
    spendTracker.recentTransactionTimestamps.push(Date.now());
  }
  return getPolicyLimits();
}

function invalidPolicyResult(reason, extra = {}) {
  return {
    decision: 'DENY',
    risk_score: 100,
    rules_checked: {
      quarantine_clean: false,
      quarantine_clean_pass: false,
      merchant_allowlist: false,
      merchant_allowlist_pass: false,
      price_drift_pass: false,
      per_tx_upper_bound_pass: false,
      daily_budget_upper_bound_pass: false,
      budget_cap_pass: false,
      intent_alignment_pass: false,
      velocity_pass: false,
    },
    reason,
    applied_limits: {
      autoApproveLimit: humanPolicyLimits.autoApproveLimit,
      hardTransactionCap: humanPolicyLimits.hardTransactionCap,
      dailyBudgetCap: humanPolicyLimits.dailyBudgetCap,
    },
    ...extra,
  };
}

function evaluate(intent, overrideLimits = {}) {
  if (!intent || typeof intent !== 'object') {
    return invalidPolicyResult('Policy request missing or invalid');
  }

  const safeIntent = intent;
  const q =
    safeIntent.quarantine_extracted && typeof safeIntent.quarantine_extracted === 'object'
      ? safeIntent.quarantine_extracted
      : {};
  const c =
    safeIntent.checkout_verification && typeof safeIntent.checkout_verification === 'object'
      ? safeIntent.checkout_verification
      : {};
  const policyContext =
    safeIntent.policy_context && typeof safeIntent.policy_context === 'object'
      ? safeIntent.policy_context
      : null;

  if (!policyContext) {
    return invalidPolicyResult('Policy context missing; purchase denied');
  }

  const hasLiveCheckoutPrice =
    c && Object.prototype.hasOwnProperty.call(c, 'live_checkout_price') &&
    c.live_checkout_price !== null &&
    c.live_checkout_price !== undefined &&
    c.live_checkout_price !== '' &&
    !Number.isNaN(Number(c.live_checkout_price));

  if (!hasLiveCheckoutPrice) {
    return invalidPolicyResult('Checkout verification missing live price; purchase denied');
  }

  const overrideConfig = overrideLimits && typeof overrideLimits === 'object' ? overrideLimits : {};
  const activeLimits = {
    ...humanPolicyLimits,
  };

  if (overrideConfig.hardTransactionCap !== undefined) {
    const hardCap = Number(overrideConfig.hardTransactionCap);
    if (!Number.isNaN(hardCap)) {
      activeLimits.hardTransactionCap = Math.min(hardCap, humanPolicyLimits.hardTransactionCap);
    }
  }

  if (overrideConfig.dailyBudgetCap !== undefined) {
    const dailyCap = Number(overrideConfig.dailyBudgetCap);
    if (!Number.isNaN(dailyCap)) {
      activeLimits.dailyBudgetCap = Math.min(dailyCap, humanPolicyLimits.dailyBudgetCap);
    }
  }

  if (overrideConfig.autoApproveLimit !== undefined) {
    const autoLimit = Number(overrideConfig.autoApproveLimit);
    if (!Number.isNaN(autoLimit)) {
      activeLimits.autoApproveLimit = Math.min(autoLimit, humanPolicyLimits.autoApproveLimit);
    }
  }

  if (overrideConfig.maxTxPerMinute !== undefined) {
    const maxTx = Number(overrideConfig.maxTxPerMinute);
    if (!Number.isNaN(maxTx)) {
      activeLimits.maxTxPerMinute = Math.min(maxTx, humanPolicyLimits.maxTxPerMinute);
    }
  }

  if (Array.isArray(overrideConfig.allowedMerchants)) {
    const intersection = overrideConfig.allowedMerchants.filter((merchant) =>
      humanPolicyLimits.allowedMerchants.includes(String(merchant))
    );
    if (intersection.length > 0) {
      activeLimits.allowedMerchants = [...intersection];
    }
  }

  if (isHumanLimitOverridden) {
    activeLimits.autoApproveLimit = humanPolicyLimits.autoApproveLimit;
    activeLimits.hardTransactionCap = humanPolicyLimits.hardTransactionCap;
    activeLimits.dailyBudgetCap = humanPolicyLimits.dailyBudgetCap;
    activeLimits.maxTxPerMinute = humanPolicyLimits.maxTxPerMinute;
  }

  const quotedPrice = Number(q.quoted_price ?? 0);
  const livePrice = Number(c.live_checkout_price);
  const merchantId = String(q.merchant_id || c.merchant_id || "");
  const injectionDetected = Boolean(q.injection_detected);
  const priceDriftDetected = Boolean(c.price_drift_detected || livePrice !== quotedPrice);
  const dailySpent = normalizeNumber(policyContext.daily_spent, 0);
  const txLastMinute = normalizeNumber(policyContext.tx_last_minute, 0);

  const quarantineCleanPass = !injectionDetected;
  const merchantAllowlistPass = activeLimits.allowedMerchants.includes(merchantId);
  const priceDriftPass = !priceDriftDetected;
  const perTxUpperBoundPass = livePrice > 0 && livePrice <= activeLimits.hardTransactionCap;
  const dailyUpperBoundPass = dailySpent + livePrice <= activeLimits.dailyBudgetCap;
  const velocityPass = txLastMinute < activeLimits.maxTxPerMinute;
  const budgetCapPass = perTxUpperBoundPass && dailyUpperBoundPass;
  const intentAlignmentPass =
    safeIntent.intent_alignment_pass !== undefined
      ? Boolean(safeIntent.intent_alignment_pass)
      : quarantineCleanPass;

  const rules_checked = {
    quarantine_clean: quarantineCleanPass,
    quarantine_clean_pass: quarantineCleanPass,
    merchant_allowlist: merchantAllowlistPass,
    merchant_allowlist_pass: merchantAllowlistPass,
    price_drift_pass: priceDriftPass,
    per_tx_upper_bound_pass: perTxUpperBoundPass,
    daily_budget_upper_bound_pass: dailyUpperBoundPass,
    budget_cap_pass: budgetCapPass,
    intent_alignment_pass: intentAlignmentPass,
    velocity_pass: velocityPass,
  };

  const violations = [];
  let risk_score = 5;

  if (!quarantineCleanPass) {
    risk_score += 90;
    violations.push(
      `Prompt Injection detected in untrusted product page (${q.stripped_payload || 'SYSTEM OVERRIDE detected'})`
    );
  }
  if (!intentAlignmentPass) {
    risk_score += 85;
    violations.push('Proposed purchase does not match original user request intent');
  }
  if (!merchantAllowlistPass) {
    risk_score += 90;
    violations.push(`Merchant '${merchantId}' is NOT in the verified allowlist`);
  }
  if (!priceDriftPass) {
    risk_score += 90;
    violations.push(
      `TOCTOU Price-Drift Attack blocked: Quoted $${quotedPrice.toFixed(2)} != Checkout $${livePrice.toFixed(2)}`
    );
  }
  if (!perTxUpperBoundPass) {
    risk_score += 75;
    violations.push(
      `Amount $${livePrice.toFixed(2)} exceeds human-configured upper bound of $${activeLimits.hardTransactionCap.toFixed(2)} per transaction`
    );
  }
  if (!dailyUpperBoundPass) {
    risk_score += 70;
    violations.push(
      `Amount $${livePrice.toFixed(2)} would exceed daily budget upper bound of $${activeLimits.dailyBudgetCap.toFixed(2)} (Already spent: $${dailySpent.toFixed(2)})`
    );
  }
  if (!velocityPass) {
    risk_score += 60;
    violations.push(
      `Velocity limit exceeded: ${txLastMinute} transactions in the last minute exceeds max ${activeLimits.maxTxPerMinute}`
    );
  }

  if (violations.length === 0 && livePrice > activeLimits.autoApproveLimit) {
    risk_score = 35;
  }

  risk_score = Math.min(100, risk_score);

  let decision = 'ALLOW';
  let reason = `All deterministic security gates passed (<= $${activeLimits.autoApproveLimit.toFixed(2)} auto-approve limit, <= $${activeLimits.hardTransactionCap.toFixed(2)} upper bound).`;

  if (violations.length > 0) {
    decision = 'DENY';
    reason = violations.join(' | ');
  } else if (livePrice > activeLimits.autoApproveLimit) {
    decision = 'ASK_HUMAN';
    reason = `Amount $${livePrice.toFixed(2)} exceeds human-set auto-approve limit ($${activeLimits.autoApproveLimit.toFixed(2)}) but is within upper bound ($${activeLimits.hardTransactionCap.toFixed(2)}). Human payer approval required.`;
  }

  return {
    decision,
    risk_score,
    rules_checked,
    reason,
    applied_limits: {
      autoApproveLimit: activeLimits.autoApproveLimit,
      hardTransactionCap: activeLimits.hardTransactionCap,
      dailyBudgetCap: activeLimits.dailyBudgetCap,
    },
  };
}

function evaluatePurchaseIntent(intent, customConfig = {}) {
  const baseIntent = intent && typeof intent === 'object' ? intent : {};
  const res = evaluate(baseIntent, customConfig);
  return {
    intent_id: baseIntent.intent_id || `int_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user_prompt: baseIntent.user_prompt || '',
    quarantine_extracted: baseIntent.quarantine_extracted || null,
    checkout_verification: baseIntent.checkout_verification || {
      live_checkout_price: Number(baseIntent.quarantine_extracted?.quoted_price || 0),
      price_drift_detected: false,
    },
    policy_evaluation: res,
  };
}

module.exports = {
  evaluate,
  evaluatePurchaseIntent,
  extractPromptAutoApproveLimit,
  setPolicyLimits,
  getPolicyLimits,
  setPolicyConfig: setPolicyLimits,
  getPolicyConfig: getPolicyLimits,
  resetPolicyState,
  recordSuccessfulSpend,
  DEFAULT_POLICY_CONFIG: DEFAULT_POLICY_LIMITS,
  POLICY_RULES,
};
