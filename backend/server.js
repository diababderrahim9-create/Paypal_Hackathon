/**
 * WARDEN BACKEND SERVER (Express Entry Point)
 * Coordinates Guy 1 (Security/AI), Guy 2 (PayPal/DB), and Guy 3 (UI).
 */

const express = require("express");
const cors = require("cors");
const {
  runDemoScenario,
  runWardenPipeline,
  computeDashboardCounters,
  getAttackLabState,
  setAttackLabState,
  resetPolicyState,
} = require("./agents/shopperAgent");
const { verifyAuditChain, generateDisputeEvidencePacket } = require("./security/auditChain");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 4000;

// In-memory audit log store for zero-config live demo
let memoryAuditLogs = [];

// GET /api/logs -> Returns ledger rows, chain verification status, and counters
app.get("/api/logs", (req, res) => {
  const chainStatus = verifyAuditChain(memoryAuditLogs);
  const counters = computeDashboardCounters(memoryAuditLogs);
  res.json({
    logs: memoryAuditLogs,
    chain_status: chainStatus,
    counters,
  });
});

// POST /api/demo/scenario -> Triggers one of the 4 Judge Demo Buttons
app.post("/api/demo/scenario", async (req, res) => {
  try {
    const { scenario_key } = req.body;
    const prevHash =
      memoryAuditLogs.length > 0
        ? memoryAuditLogs[memoryAuditLogs.length - 1].entry_hash
        : undefined;

    const result = await runDemoScenario(scenario_key, prevHash);
    
    // Assign incremental ID if database row
    const newEntry = {
      id: memoryAuditLogs.length + 1,
      ...result.audit_log_entry,
    };

    memoryAuditLogs.push(newEntry);

    const chainStatus = verifyAuditChain(memoryAuditLogs);
    const counters = computeDashboardCounters(memoryAuditLogs);

    res.json({
      success: true,
      last_run: result,
      logs: memoryAuditLogs,
      chain_status: chainStatus,
      counters,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent/purchase -> Custom prompt execution
app.post("/api/agent/purchase", async (req, res) => {
  try {
    const { prompt } = req.body;
    const prevHash =
      memoryAuditLogs.length > 0
        ? memoryAuditLogs[memoryAuditLogs.length - 1].entry_hash
        : undefined;

    const result = await runWardenPipeline(prompt, { prevHash });
    const newEntry = {
      id: memoryAuditLogs.length + 1,
      ...result.audit_log_entry,
    };

    memoryAuditLogs.push(newEntry);

    res.json({
      success: true,
      result,
      logs: memoryAuditLogs,
      chain_status: verifyAuditChain(memoryAuditLogs),
      counters: computeDashboardCounters(memoryAuditLogs),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/paypal/approve/:id -> Approves an ASK_HUMAN pending order
app.post("/api/paypal/approve/:id", (req, res) => {
  const rowId = Number(req.params.id);
  memoryAuditLogs = memoryAuditLogs.map((row) => {
    if (row.id === rowId) {
      return {
        ...row,
        decision: "ALLOW",
        payment_status: "CAPTURED",
        paypal_order_id: `PAYPAL-SBX-CAPTURED-${Math.floor(100000 + Math.random() * 900000)}`,
        reason: "Approved by Human Payer via PayPal Sandbox 1-Click Popup.",
      };
    }
    return row;
  });

  res.json({
    success: true,
    logs: memoryAuditLogs,
    chain_status: verifyAuditChain(memoryAuditLogs),
    counters: computeDashboardCounters(memoryAuditLogs),
  });
});

// POST /api/audit/tamper -> Simulates DB tampering to test hash chain defense
app.post("/api/audit/tamper", (req, res) => {
  if (memoryAuditLogs.length > 0) {
    // Tamper with the first block's amount
    memoryAuditLogs[0].checkout_amount = 1.00;
  }
  const chainStatus = verifyAuditChain(memoryAuditLogs);
  res.json({
    success: true,
    tampered: true,
    logs: memoryAuditLogs,
    chain_status: chainStatus,
    counters: computeDashboardCounters(memoryAuditLogs),
  });
});

// POST /api/demo/reset -> Resets audit ledger & counters
app.post("/api/demo/reset", (req, res) => {
  memoryAuditLogs = [];
  resetPolicyState();
  res.json({
    success: true,
    message: "Warden demo state successfully reset.",
    logs: [],
    chain_status: verifyAuditChain([]),
    counters: computeDashboardCounters([]),
  });
});

// GET /api/evidence/:id -> Generates PayPal dispute evidence packet
app.get("/api/evidence/:id", (req, res) => {
  const rowId = Number(req.params.id);
  const row = memoryAuditLogs.find((r) => r.id === rowId);
  if (!row) {
    return res.status(404).json({ error: "Audit block not found" });
  }
  const packet = generateDisputeEvidencePacket(row);
  res.json(packet);
});

app.listen(PORT, () => {
  console.log(`🛡️ Warden Backend Server running live on http://localhost:${PORT}`);
});
