import React from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ClipboardCheck,
  Clock,
  Clock3,
  ExternalLink,
  Lock,
  Play,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';

const money = (val, cur = 'USD') =>
  Number.isFinite(Number(val))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(val))
    : '—';

export default function HumanApprovalView({
  pendingApprovals = [],
  approvalTokens = {},
  onApprove,
  onReject,
  approvalBusy = '',
  onRunDemo,
  connection,
}) {
  return (
    <div className="flex-1 flex flex-col gap-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#F59E0B] uppercase font-bold">
              Autonomous Threshold Security
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#EBE8E0] tracking-tight mt-1">
            Human Approval Queue
          </h1>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Purchases over the $50 autonomous threshold are held in quarantine awaiting authorized human signature.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-[#0D131C] border border-[#1E2631] rounded-lg text-xs font-mono text-[#8FA3B0]">
            Autonomous Cap: <b className="text-[#EBE8E0]">$50.00 USD</b>
          </span>
        </div>
      </div>

      {/* Main Queue */}
      {pendingApprovals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingApprovals.map((intent) => {
            const hasToken = Boolean(approvalTokens[intent.intent_id]);
            return (
              <div
                key={intent.intent_id}
                className="warden-card p-5 flex flex-col justify-between gap-4 border-[#F59E0B]/30 bg-[#121A24] relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#F59E0B]">
                    <Clock size={16} />
                    <span className="text-xs font-mono font-bold uppercase">Awaiting Approval</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#EBE8E0]">
                    {money(intent.approved_amount, intent.approved_currency || 'USD')}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#EBE8E0]">
                    {intent.request_summary || intent.product_id || 'Purchase Request'}
                  </h3>
                  <div className="flex flex-col gap-1 mt-2 text-xs font-mono text-[#8FA3B0]">
                    <div>Merchant: <span className="text-[#EBE8E0]">{intent.merchant || '—'}</span></div>
                    <div>Reason: <span className="text-[#EBE8E0]">{intent.reason || 'Threshold exceeded ($50.00)'}</span></div>
                    <div>Intent ID: <span className="text-[#6C8CA1]">{intent.intent_id}</span></div>
                  </div>
                </div>

                {hasToken ? (
                  <div className="flex items-center gap-2 pt-2 border-t border-[#1E2631]/60">
                    <button
                      onClick={() => onReject('reject', intent.intent_id)}
                      disabled={Boolean(approvalBusy)}
                      className="flex-1 py-2 px-3 bg-[#EF4444]/20 hover:bg-[#EF4444]/30 text-[#EF4444] text-xs font-semibold rounded-lg border border-[#EF4444]/40 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <X size={14} /> Reject
                    </button>
                    <button
                      onClick={() => onApprove('approve', intent.intent_id)}
                      disabled={Boolean(approvalBusy)}
                      className="flex-1 py-2 px-3 bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] text-xs font-semibold rounded-lg border border-[#10B981]/40 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Check size={14} /> Authorize
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 rounded bg-[#0D131C] text-[10px] font-mono text-[#8FA3B0] flex items-start gap-1.5">
                    <Lock size={12} className="shrink-0 mt-0.5 text-[#F59E0B]" />
                    <span>The one-time cryptographic approval token exists only in the browser session that initiated this request.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="warden-card p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1E2631] border border-[#2E3E52] flex items-center justify-center text-[#10B981]">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#EBE8E0]">No Transactions Awaiting Approval</h3>
            <p className="text-xs text-[#8FA3B0] max-w-md mt-1">
              All purchase requests under $50 are automatically verified and cleared by policy.
              Run the $95 Developer Monitor demo scenario to trigger an over-threshold human approval request.
            </p>
          </div>
          <button
            onClick={onRunDemo}
            disabled={connection !== 'connected'}
            className="px-4 py-2 bg-[#1E2631] hover:bg-[#2A374A] text-[#EBE8E0] text-xs font-semibold rounded-xl border border-[#2E3E52] flex items-center gap-2 transition-all hover:border-[#6C8CA1]"
          >
            <Play size={13} className="text-[#6C8CA1]" />
            <span>Simulate $95 Threshold Check</span>
          </button>
        </div>
      )}
    </div>
  );
}
