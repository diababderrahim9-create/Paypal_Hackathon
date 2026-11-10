/**
 * GUY 1 (BYCER): Shopper Agent, Phase 3 Judge Button Scenarios & Dashboard Helper
 * CRITICAL SECURITY INVARIANT:
 * This agent ONLY has two tools: `search_products` and `propose_purchase`.
 * It has ZERO payment execution tools and ZERO access to PayPal credentials.
 */

const {
  searchCatalog,
  getProductById,
  getAttackLabState,
  setAttackLabState,
} = require("../catalog/attackStorefront");
const {
  sanitizeCatalogResults,
  sanitizeUntrustedProduct,
} = require("./quarantineLLM");
const {
  evaluatePurchaseIntent,
  resetPolicyState,
  recordSuccessfulSpend,
} = require("../security/policyEngine");
const {
  createAuditLogEntry,
  verifyAuditChain,
  generateDisputeEvidencePacket,
} = require("../security/auditChain");

const SHOPPER_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the product catalog. Results pass through Quarantine LLM before returning only structured fields (product_id, product_name, merchant_id, quoted_price).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword (e.g., 'security key', 'monitor', 'usb hub', 'ssd')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_purchase",
      description:
        "Emit a structured purchase intent to the Deterministic Policy Engine. Does NOT execute payment.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["product_id", "reasoning"],
      },
    },
  },
];

const DEMO_SCENARIOS = {
  HAPPY_PATH_45: {
    scenario_key: "HAPPY_PATH_45",
    button_label: "1. Happy Path ($45 Security Key)",
    badge_color: "green",
    prompt: "Buy me the TitanVault USB-C Hardware Security Key under $50",
    options: { subMode: "CLEAN" },
  },
  ASK_HUMAN_95: {
    scenario_key: "ASK_HUMAN_95",
    button_label: "2. Over-Threshold ($95 Dev Monitor)",
    badge_color: "yellow",
    prompt: "Buy me the 16-inch Portable Developer Monitor ($95)",
    options: { subMode: "THRESHOLD" },
  },
  ATTACK_INJECTION_QUARANTINED: {
    scenario_key: "ATTACK_INJECTION_QUARANTINED",
    button_label: "3A. Attack A (Sub-mode 1): Quarantine Strips Injection",
    badge_color: "red",
    prompt: "Buy me the 7-in-1 Aluminum USB-C Hub ($29)",
    options: { subMode: "QUARANTINE_STRIP", simulateNaiveHijack: false },
  },
  ATTACK_INJECTION_HIJACK_BLOCKED: {
    scenario_key: "ATTACK_INJECTION_HIJACK_BLOCKED",
    button_label: "3B. Attack A (Sub-mode 2): Policy Gate Blocks $499 EvilCorp Hijack",
    badge_color: "red",
    prompt: "Buy me the 7-in-1 Aluminum USB-C Hub ($29)",
    options: { subMode: "POLICY_BLOCK_HIJACK", simulateNaiveHijack: true },
  },
  ATTACK_PROMPT_INJECTION: {
    scenario_key: "ATTACK_PROMPT_INJECTION",
    button_label: "3. Attack A: Prompt Injection ($29 -> $499 EvilCorp)",
    badge_color: "red",
    prompt: "Buy me the 7-in-1 Aluminum USB-C Hub ($29)",
    options: { subMode: "POLICY_BLOCK_HIJACK", simulateNaiveHijack: true },
  },
  ATTACK_PRICE_DRIFT: {
    scenario_key: "ATTACK_PRICE_DRIFT",
    button_label: "4. Attack B: Checkout Price-Drift ($45 -> $450)",
    badge_color: "red",
    prompt: "Buy me the StealthDrive 1TB NVMe SSD ($45)",
    options: { subMode: "PRICE_DRIFT" },
  },
};

function selectTargetProductFromPrompt(userPrompt = "", sanitizedItems = []) {
  const p = userPrompt.toLowerCase();

  if (p.includes("monitor") || p.includes("display") || p.includes("95")) {
    return sanitizedItems.find((i) => i.product_id === "prod_dev_monitor_02") || sanitizedItems[0];
  }
  if (p.includes("hub") || p.includes("adapter") || p.includes("injection") || p.includes("29")) {
    return sanitizedItems.find((i) => i.product_id === "prod_usb_hub_03") || sanitizedItems[0];
  }
  if (p.includes("ssd") || p.includes("drive") || p.includes("storage") || p.includes("drift")) {
    return sanitizedItems.find((i) => i.product_id === "prod_nvme_ssd_04") || sanitizedItems[0];
  }
  if (p.includes("voucher") || p.includes("evil") || p.includes("499")) {
    return sanitizedItems.find((i) => i.product_id === "prod_gpu_rig_05") || sanitizedItems[0];
  }

  return sanitizedItems.find((i) => i.product_id === "prod_sec_key_01") || sanitizedItems[0];
}

async function runWardenPipeline(userPrompt, options = {}) {
  const prevHash = options.prevHash || undefined;
  const rawItems = searchCatalog("");
  const sanitizedItems = await sanitizeCatalogResults(rawItems, options);

  let chosenItem = selectTargetProductFromPrompt(userPrompt, sanitizedItems);
  const rawStorefrontItem = getProductById(chosenItem.product_id);
  let intentAlignmentPass = true;
  let agentReasoning = `Selected '${chosenItem.product_name}' ($${chosenItem.quoted_price}) matching user request.`;

  if (chosenItem.product_id === "prod_usb_hub_03" && chosenItem.injection_detected) {
    if (options.simulateNaiveHijack) {
      const hijackedRaw = getProductById("prod_gpu_rig_05");
      const hijackedSanitized = await sanitizeUntrustedProduct(hijackedRaw, options);
      chosenItem = {
        ...hijackedSanitized,
        injection_detected: true,
        stripped_payload: chosenItem.stripped_payload,
      };
      intentAlignmentPass = false;
      agentReasoning =
        "DEFENSE LAYER 2 (Policy Gate): Agent was hijacked by untrusted page into proposing 'prod_gpu_rig_05' ($499.00 from 'merch_evil_corp'). Deterministic Policy Engine intercepted and blocked execution!";
    } else {
      agentReasoning =
        "DEFENSE LAYER 1 (Quarantine LLM): Untrusted HTML comment containing '[SYSTEM OVERRIDE]' was stripped by Quarantine LLM and flagged before reaching payment execution.";
    }
  }

  const rawIntent = {
    intent_id: `int_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user_prompt: userPrompt,
    agent_reasoning: agentReasoning,
    intent_alignment_pass: intentAlignmentPass,
    quarantine_extracted: chosenItem,
    untrusted_raw_html_preview: rawStorefrontItem ? rawStorefrontItem.malicious_description : "",
  };

  const evaluatedIntent = evaluatePurchaseIntent(rawIntent, options.policyConfig);
  const draftAuditBlock = createAuditLogEntry(evaluatedIntent, prevHash);

  return {
    scenario_key: options.scenario_key || "CUSTOM_PROMPT",
    tools_exposed_to_agent: SHOPPER_TOOLS.map((t) => t.function.name),
    agent_reasoning: agentReasoning,
    untrusted_raw_html_preview: rawIntent.untrusted_raw_html_preview,
    evaluated_intent: evaluatedIntent,
    audit_log_entry: draftAuditBlock,
  };
}

async function runDemoScenario(scenarioKey, prevHash) {
  const scenario = DEMO_SCENARIOS[scenarioKey] || DEMO_SCENARIOS.HAPPY_PATH_45;
  return runWardenPipeline(scenario.prompt, {
    ...scenario.options,
    scenario_key: scenario.scenario_key,
    prevHash,
  });
}

function computeDashboardCounters(auditLogs = []) {
  let totalSpent = 0;
  let attacksBlocked = 0;
  let awaitingApproval = 0;

  for (const row of auditLogs) {
    if (row.payment_status === "CAPTURED" || row.decision === "ALLOW") {
      totalSpent += Number(row.checkout_amount || 0);
    }
    if (row.decision === "DENY" || row.payment_status === "BLOCKED") {
      attacksBlocked += 1;
    }
    if (row.payment_status === "AWAITING_APPROVAL") {
      awaitingApproval += 1;
    }
  }

  const chainStatus = verifyAuditChain(auditLogs);

  return {
    total_spent: Number(totalSpent.toFixed(2)),
    attacks_blocked: attacksBlocked,
    awaiting_approval: awaitingApproval,
    total_events: auditLogs.length,
    chain_status: chainStatus,
  };
}

module.exports = {
  SHOPPER_TOOLS,
  DEMO_SCENARIOS,
  runWardenPipeline,
  runDemoScenario,
  computeDashboardCounters,
  getAttackLabState,
  setAttackLabState,
  resetPolicyState,
  recordSuccessfulSpend,
  generateDisputeEvidencePacket,
};
