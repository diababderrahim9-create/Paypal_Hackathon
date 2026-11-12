import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileCheck,
  FileText,
  Fingerprint,
  FlaskConical,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

export default function LeftSidebar({
  logs = [],
  intents = [],
  attackMode = { drift: false, injection: false },
  chainOk = true,
  onNavigateTab,
  onOpenForensics,
  onOpenCatalog,
}) {
  const [checkedGuardrails, setCheckedGuardrails] = useState({
    priceLock: true,
    merchantAllowlist: true,
    autonomousThreshold: true,
    quarantineLLM: true,
    hashChaining: true,
    zeroPaymentLLM: true,
  });

  const toggleGuardrail = (key) => {
    setCheckedGuardrails((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Extract recent 2-3 intercepts or activities from actual logs
  const recentItems = logs.slice(0, 3).map((log) => {
    const isDeny = log.decision === 'DENY';
    const isHuman = log.decision === 'ASK_HUMAN';
    const isAllow = log.decision === 'ALLOW';
    const timeFormatted = log.timestamp
      ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now';

    return {
      id: log.id,
      title: log.request_summary || 'Purchase intent evaluated',
      time: timeFormatted,
      status: log.decision,
      tone: isDeny ? 'red' : isHuman ? 'amber' : 'green',
      amount: log.checkout_amount || log.quoted_amount,
    };
  });

  return (
    <aside className="w-full xl:w-72 shrink-0 flex flex-col gap-4 select-none">
      {/* 1. Guardrails Checklist (Tasks 12 style) */}
      <div className="warden-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#EBE8E0]">Guardrails</span>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-[#1E2631] text-[#6C8CA1] rounded-full border border-[#2E3E52]">
              6 Active
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigateTab('integrity')}
              className="p-1 text-[#8FA3B0] hover:text-[#EBE8E0] hover:bg-[#1E2631] rounded transition-colors"
              title="Add Guardrail"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onNavigateTab('integrity')}
              className="p-1 text-[#8FA3B0] hover:text-[#EBE8E0] hover:bg-[#1E2631] rounded transition-colors"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>

        {/* Check items */}
        <div className="flex flex-col gap-2 pt-1 text-xs">
          {/* Price Lock */}
          <div
            onClick={() => toggleGuardrail('priceLock')}
            className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D131C] border border-[#1E2631]/60 hover:border-[#6C8CA1]/40 cursor-pointer transition-all"
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                checkedGuardrails.priceLock
                  ? 'bg-[#1E2631] border-[#6C8CA1] text-[#EBE8E0]'
                  : 'border-[#2E3E52] bg-transparent'
              }`}
            >
              {checkedGuardrails.priceLock && <Check size={11} />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[#EBE8E0] font-medium block leading-tight">Deterministic Price Lock</span>
              <span className="text-[10px] text-[#8FA3B0] font-mono mt-0.5 block">0% price drift tolerance</span>
            </div>
          </div>

          {/* Prompt Injection Quarantine */}
          <div
            onClick={() => toggleGuardrail('quarantineLLM')}
            className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D131C] border border-[#1E2631]/60 hover:border-[#6C8CA1]/40 cursor-pointer transition-all"
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                checkedGuardrails.quarantineLLM
                  ? 'bg-[#1E2631] border-[#6C8CA1] text-[#EBE8E0]'
                  : 'border-[#2E3E52] bg-transparent'
              }`}
            >
              {checkedGuardrails.quarantineLLM && <Check size={11} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[#EBE8E0] font-medium block leading-tight">Quarantine Isolation</span>
                {attackMode.injection && (
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] pulse-red" title="Injection attack active" />
                )}
              </div>
              <span className="text-[10px] text-[#8FA3B0] font-mono mt-0.5 block">Raw HTML stripped</span>
            </div>
          </div>

          {/* Autonomous Cap */}
          <div
            onClick={() => toggleGuardrail('autonomousThreshold')}
            className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D131C] border border-[#1E2631]/60 hover:border-[#6C8CA1]/40 cursor-pointer transition-all"
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                checkedGuardrails.autonomousThreshold
                  ? 'bg-[#1E2631] border-[#6C8CA1] text-[#EBE8E0]'
                  : 'border-[#2E3E52] bg-transparent'
              }`}
            >
              {checkedGuardrails.autonomousThreshold && <Check size={11} />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[#EBE8E0] font-medium block leading-tight">Autonomous $50 Cap</span>
              <span className="text-[10px] text-[#8FA3B0] font-mono mt-0.5 block">&gt;$50 triggers human auth</span>
            </div>
          </div>

          {/* Merchant Allowlist */}
          <div
            onClick={() => toggleGuardrail('merchantAllowlist')}
            className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D131C] border border-[#1E2631]/60 hover:border-[#6C8CA1]/40 cursor-pointer transition-all"
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                checkedGuardrails.merchantAllowlist
                  ? 'bg-[#1E2631] border-[#6C8CA1] text-[#EBE8E0]'
                  : 'border-[#2E3E52] bg-transparent'
              }`}
            >
              {checkedGuardrails.merchantAllowlist && <Check size={11} />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[#EBE8E0] font-medium block leading-tight">Strict Merchant Binding</span>
              <span className="text-[10px] text-[#8FA3B0] font-mono mt-0.5 block">Unlisted merchants blocked</span>
            </div>
          </div>

          {/* SHA-256 Hash Chain */}
          <div
            onClick={() => toggleGuardrail('hashChaining')}
            className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D131C] border border-[#1E2631]/60 hover:border-[#6C8CA1]/40 cursor-pointer transition-all"
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                checkedGuardrails.hashChaining
                  ? 'bg-[#1E2631] border-[#6C8CA1] text-[#EBE8E0]'
                  : 'border-[#2E3E52] bg-transparent'
              }`}
            >
              {checkedGuardrails.hashChaining && <Check size={11} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[#EBE8E0] font-medium block leading-tight">SHA-256 Audit Seal</span>
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    chainOk ? 'text-[#10B981] bg-[#10B981]/10' : 'text-[#EF4444] bg-[#EF4444]/10'
                  }`}
                >
                  {chainOk ? 'INTACT' : 'TAMPER'}
                </span>
              </div>
              <span className="text-[10px] text-[#8FA3B0] font-mono mt-0.5 block">Immutable linked chain</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Recent Intercepts / Recent Activity */}
      <div className="warden-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#EBE8E0]">Recent Intercepts</span>
          <button
            onClick={() => onNavigateTab('ledger')}
            className="text-[10px] font-mono text-[#6C8CA1] hover:text-[#EBE8E0] transition-colors"
          >
            View All
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {recentItems.length > 0 ? (
            recentItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigateTab('ledger')}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[#162230] cursor-pointer transition-colors border border-transparent hover:border-[#1E2631]"
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                    item.tone === 'red'
                      ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20'
                      : item.tone === 'amber'
                      ? 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                      : 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20'
                  }`}
                >
                  {item.tone === 'red' ? (
                    <ShieldAlert size={12} />
                  ) : item.tone === 'amber' ? (
                    <Clock size={12} />
                  ) : (
                    <ShieldCheck size={12} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-[#EBE8E0] font-medium block truncate leading-tight">
                    {item.title}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-[#8FA3B0]">{item.time}</span>
                    <span
                      className={`text-[9px] font-mono px-1 rounded ${
                        item.tone === 'red'
                          ? 'text-[#EF4444] bg-[#EF4444]/10'
                          : item.tone === 'amber'
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#10B981] bg-[#10B981]/10'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-xs text-[#8FA3B0]">
              <span>No recent intercepts recorded.</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Quick Access / Governance Tools */}
      <div className="warden-card p-4 flex flex-col gap-3">
        <span className="text-sm font-semibold text-[#EBE8E0]">Quick Access</span>

        <div className="grid grid-cols-3 gap-2">
          {/* Evidence Forensic */}
          <button
            onClick={onOpenForensics}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#0D131C] border border-[#1E2631] hover:border-[#6C8CA1] hover:bg-[#162230] text-[#8FA3B0] hover:text-[#EBE8E0] transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#121A24] flex items-center justify-center text-[#6C8CA1] group-hover:text-[#EBE8E0]">
              <FileCheck size={16} />
            </div>
            <span className="text-[10px] font-medium">Disputes</span>
          </button>

          {/* Attack Lab */}
          <button
            onClick={() => onNavigateTab('scenarios')}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#0D131C] border border-[#1E2631] hover:border-[#6C8CA1] hover:bg-[#162230] text-[#8FA3B0] hover:text-[#EBE8E0] transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#121A24] flex items-center justify-center text-[#6C8CA1] group-hover:text-[#EBE8E0]">
              <FlaskConical size={16} />
            </div>
            <span className="text-[10px] font-medium">Attack Lab</span>
          </button>

          {/* Public Catalog */}
          <button
            onClick={onOpenCatalog}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#0D131C] border border-[#1E2631] hover:border-[#6C8CA1] hover:bg-[#162230] text-[#8FA3B0] hover:text-[#EBE8E0] transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#121A24] flex items-center justify-center text-[#6C8CA1] group-hover:text-[#EBE8E0]">
              <Database size={16} />
            </div>
            <span className="text-[10px] font-medium">Catalog</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
