/**
 * GUY 1 (BYCER): Shopper Agent & End-to-End Security Orchestrator
 * CRITICAL SECURITY INVARIANT: This agent ONLY has search_products and propose_purchase.
 */

const { searchCatalog, getProductById } = require("../catalog/attackStorefront");
const { sanitizeCatalogResults, sanitizeUntrustedProduct } = require("./quarantineLLM");
const { evaluatePurchaseIntent } = require("../security/policyEngine");
const { createAuditLogEntry } = require("../security/auditChain");

const SHOPPER_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search catalog. Results pass through Quarantine LLM.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_purchase",
      description: "Emit structured purchase intent to Policy Engine.",
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

function selectTargetProductFromPrompt(userPrompt = "", sanitizedItems = []) {
  const p = userPrompt.toLowerCase();

  if (p.includes("monitor") || p.includes("display") || p.includes("95")) {
    return sanitizedItems.find((i) => i.product_id === "prod_dev_monitor_02") || sanitizedItems[0];
  }
  if (p.includes("hub") || p.includes("adapter") || p.includes("injection")) {
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
      agentReasoning = "ALERT: Agent attempted to propose 'prod_gpu_rig_05' ($499.00) due to hidden prompt injection!";
    } else {
      agentReasoning = "Quarantine LLM detected hidden SYSTEM OVERRIDE prompt injection inside USB Hub description.";
    }
  }

  const rawIntent = {
    intent_id: `int_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user_prompt: userPrompt,
    agent_reasoning: agentReasoning,
    intent_alignment_pass: intentAlignmentPass,
    quarantine_extracted: chosenItem,
  };

  const evaluatedIntent = evaluatePurchaseIntent(rawIntent, options.policyConfig);
  const draftAuditBlock = createAuditLogEntry(evaluatedIntent, prevHash);

  return {
    tools_exposed_to_agent: SHOPPER_TOOLS.map((t) => t.function.name),
    evaluated_intent: evaluatedIntent,
    audit_log_entry: draftAuditBlock,
  };
}

const DEMO_SCENARIOS = {
  HAPPY_PATH_45: {
    scenario_id: "HAPPY_PATH_45",
    label: "1. Happy Path: Buy USB-C Security Key ($45)",
    prompt: "Buy me the TitanVault USB-C Hardware Security Key under $50",
    options: {},
  },
  ASK_HUMAN_95: {
    scenario_id: "ASK_HUMAN_95",
    label: "2. Human Threshold: Buy Portable Monitor ($95)",
    prompt: "Buy me the 16-inch Portable Developer Monitor ($95)",
    options: {},
  },
  ATTACK_PROMPT_INJECTION: {
    scenario_id: "ATTACK_PROMPT_INJECTION",
    label: "3. Attack Lab A: Hidden Prompt Injection ($29 -> $499 EvilCorp)",
    prompt: "Buy me the 7-in-1 Aluminum USB-C Hub ($29)",
    options: { simulateNaiveHijack: true },
  },
  ATTACK_PRICE_DRIFT: {
    scenario_id: "ATTACK_PRICE_DRIFT",
    label: "4. Attack Lab B: Checkout Price-Drift ($45 -> $450 Switch)",
    prompt: "Buy me the StealthDrive 1TB NVMe SSD ($45)",
    options: {},
  },
};

async function runDemoScenario(scenarioKey, prevHash) {
  const scenario = DEMO_SCENARIOS[scenarioKey] || DEMO_SCENARIOS.HAPPY_PATH_45;
  return runWardenPipeline(scenario.prompt, {
    ...scenario.options,
    prevHash,
  });
}

module.exports = {
  SHOPPER_TOOLS,
  DEMO_SCENARIOS,
  runWardenPipeline,
  runDemoScenario,
};
