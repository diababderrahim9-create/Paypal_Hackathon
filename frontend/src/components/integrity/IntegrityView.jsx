import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  Fingerprint,
  Hash,
  Info,
  Link as LinkIcon,
  LoaderCircle,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

export default function IntegrityView({
  verification,
  onVerifyChain,
  logs = [],
  health,
  tamperOptIn,
  setTamperOptIn,
  onTamperSelected,
  selectedLog,
  setSelectedLog,
  tamperResult,
  busyAction,
}) {
  const chainOk = verification?.ok === true;
  const brokenAt = verification?.brokenAt;

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#6C8CA1] uppercase font-bold">
              Cryptographic Validation &amp; Chain Proof
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                chainOk ? 'bg-[#10B981] pulse-green' : 'bg-[#EF4444] pulse-red'
              }`}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#EBE8E0] tracking-tight mt-1">
            Audit Chain Integrity
          </h1>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Every audit entry commits to the previous SHA-256 hash. Any historical tampering breaks cryptographic continuity.
          </p>
        </div>

        <button
          onClick={onVerifyChain}
          disabled={busyAction === 'verify'}
          className="px-4 py-2 bg-[#1E2631] hover:bg-[#2A374A] text-[#EBE8E0] text-xs font-semibold rounded-xl border border-[#2E3E52] flex items-center gap-2 transition-all hover:border-[#6C8CA1]"
        >
          <Fingerprint size={14} className="text-[#6C8CA1]" />
          <span>Verify Chain Now</span>
        </button>
      </div>

      {/* Main Chain Status Banner */}
      <div
        className={`warden-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${
          chainOk
            ? 'border-[#10B981]/40 bg-[#10B981]/5'
            : 'border-[#EF4444]/40 bg-[#EF4444]/5'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              chainOk ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'
            }`}
          >
            {chainOk ? <ShieldCheck size={28} /> : <AlertOctagon size={28} />}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#8FA3B0]">
              SHA-256 Ledger State
            </div>
            <h2 className="text-lg font-bold text-[#EBE8E0]">
              {chainOk ? 'Hash Chain Verified & Intact' : 'Integrity Violation Detected'}
            </h2>
            <p className="text-xs text-[#8FA3B0] mt-0.5">
              {verification?.reason || 'Calculated deterministically by WARDEN cryptographic service.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 font-mono">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              chainOk ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'
            }`}
          >
            {chainOk ? 'STATUS: VALID' : `BROKEN AT BLOCK #${brokenAt}`}
          </span>
          <span className="text-[10px] text-[#8FA3B0]">
            {logs.length} Blocks In Chain
          </span>
        </div>
      </div>

      {/* Visual Hash Chain Representation (First 4-5 blocks) */}
      <div className="warden-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider">
            Linked Hash Chain Visualization
          </span>
          <span className="text-[10px] font-mono text-[#8FA3B0]">Parent → Child Hash Links</span>
        </div>

        <div className="flex flex-col gap-3 overflow-x-auto pb-2">
          {logs.slice(0, 4).map((log, idx) => (
            <div
              key={log.id}
              className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all ${
                brokenAt && log.id >= brokenAt
                  ? 'bg-[#EF4444]/10 border-[#EF4444]/30'
                  : 'bg-[#0D131C] border-[#1E2631]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-[#1E2631] text-[#6C8CA1] flex items-center justify-center font-bold text-[10px]">
                    #{log.id}
                  </span>
                  <span className="text-[#EBE8E0] font-semibold">{log.request_summary || 'Transaction'}</span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    log.decision === 'ALLOW'
                      ? 'text-[#10B981] bg-[#10B981]/15'
                      : log.decision === 'ASK_HUMAN'
                      ? 'text-[#F59E0B] bg-[#F59E0B]/15'
                      : 'text-[#EF4444] bg-[#EF4444]/15'
                  }`}
                >
                  {log.decision}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                <div className="truncate">
                  <span className="text-[#8FA3B0]">prev_hash: </span>
                  <code className="text-[#8FA3B0]">{log.prev_hash || '0'.repeat(64)}</code>
                </div>
                <div className="truncate">
                  <span className="text-[#8FA3B0]">entry_hash: </span>
                  <code className="text-[#6C8CA1]">{log.entry_hash}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controlled Tamper Simulation Tool */}
      <div className="warden-card p-5 flex flex-col gap-4 border-[#F59E0B]/30 bg-[#121A24]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F59E0B]/15 text-[#F59E0B] flex items-center justify-center shrink-0 mt-0.5">
            <AlertOctagon size={18} />
          </div>
          <div>
            <strong className="text-sm font-bold text-[#EBE8E0] block">
              Controlled Tamper Demonstration (Judge Simulation)
            </strong>
            <p className="text-xs text-[#8FA3B0] mt-0.5">
              Demonstrates why historical database alteration fails cryptographic verification. Modifies an existing row's amount without recalculating subsequent block hashes.
            </p>
          </div>
        </div>

        {health?.demo_tamper_enabled ? (
          <div className="flex flex-col gap-3 pt-2">
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] text-xs font-mono flex items-center justify-between">
              <span>Target Record to Tamper:</span>
              <span className="text-[#EBE8E0] font-bold">
                {selectedLog ? `#${selectedLog.id} · ${selectedLog.request_summary}` : 'Select a record in Audit Ledger (Defaults to Record #1)'}
              </span>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#8FA3B0] cursor-pointer">
              <input
                type="checkbox"
                checked={tamperOptIn}
                onChange={(e) => setTamperOptIn(e.target.checked)}
                className="rounded border-[#1E2631] bg-[#0D131C] text-[#EF4444]"
              />
              <span>I confirm I want to test intentional tampering on demo audit records.</span>
            </label>

            <button
              onClick={onTamperSelected}
              disabled={!tamperOptIn || Boolean(busyAction)}
              className="py-2.5 px-4 bg-[#EF4444]/20 hover:bg-[#EF4444]/30 text-[#EF4444] text-xs font-semibold rounded-xl border border-[#EF4444]/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyAction === 'tamper' ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <AlertOctagon size={15} />
              )}
              <span>Execute Demo Tamper (/api/demo/tamper)</span>
            </button>

            {tamperResult && (
              <div className="p-3 rounded-lg bg-[#0D131C] border border-[#EF4444]/40 text-xs font-mono text-[#EF4444]">
                <strong>Tamper Result:</strong> {tamperResult.warning}
                <div className="text-[11px] text-[#8FA3B0] mt-1">
                  Reason: {tamperResult.verification?.reason}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-[#0D131C] text-xs font-mono text-[#8FA3B0] flex items-center gap-2">
            <Lock size={14} className="text-[#F59E0B]" />
            <span>Demo tampering route is disabled by server configuration.</span>
          </div>
        )}
      </div>
    </div>
  );
}
