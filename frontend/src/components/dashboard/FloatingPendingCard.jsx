import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Lock,
  MoreHorizontal,
  Play,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

export default function FloatingPendingCard({
  pendingApprovals = [],
  approvalTokens = {},
  onApprove,
  onReject,
  approvalBusy = '',
  onRunDemo,
  onNavigateTab,
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div
      className={`fixed bottom-5 right-5 z-20 w-80 lg:w-88 warden-floating rounded-2xl p-4 transition-all duration-300 select-none ${
        minimized ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#28374A]/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#EBE8E0]">Pending Authorizations</span>
          {pendingApprovals.length > 0 ? (
            <span className="px-1.5 py-0.2 bg-[#F59E0B] text-black text-[10px] font-bold rounded-full">
              {pendingApprovals.length}
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 text-[#8FA3B0] hover:text-[#EBE8E0] rounded transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={() => onNavigateTab('approvals')}
            className="p-1 text-[#8FA3B0] hover:text-[#EBE8E0] rounded transition-colors"
            title="Open Approvals Tab"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="pt-3 flex flex-col gap-2.5">
        {pendingApprovals.length > 0 ? (
          pendingApprovals.map((item) => {
            const hasToken = Boolean(approvalTokens[item.intent_id]);
            const formattedPrice = item.approved_amount
              ? `$${Number(item.approved_amount).toFixed(2)}`
              : '$95.00';

            return (
              <div
                key={item.intent_id}
                className="p-2.5 rounded-xl bg-[#0D131C]/90 border border-[#28374A] flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-md bg-[#F59E0B]/15 text-[#F59E0B] flex items-center justify-center shrink-0 mt-0.5">
                      <Clock size={12} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[#EBE8E0] block truncate">
                        {item.request_summary || item.product_id || 'Developer Monitor'}
                      </span>
                      <span className="text-[10px] text-[#8FA3B0] block">
                        Autonomous limit exceeded ({formattedPrice})
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#EBE8E0] shrink-0">
                    {formattedPrice}
                  </span>
                </div>

                {hasToken ? (
                  <div className="flex items-center gap-2 pt-1 border-t border-[#1E2631]/60">
                    <button
                      onClick={() => onReject('reject', item.intent_id)}
                      disabled={Boolean(approvalBusy)}
                      className="flex-1 py-1 px-2 rounded-lg bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] text-[11px] font-medium border border-[#EF4444]/30 flex items-center justify-center gap-1 transition-all"
                    >
                      <X size={12} /> Reject
                    </button>
                    <button
                      onClick={() => onApprove('approve', item.intent_id)}
                      disabled={Boolean(approvalBusy)}
                      className="flex-1 py-1 px-2 rounded-lg bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] text-[11px] font-medium border border-[#10B981]/40 flex items-center justify-center gap-1 transition-all"
                    >
                      <Check size={12} /> Authorize
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#8FA3B0] font-mono flex items-center gap-1 pt-1">
                    <Lock size={10} /> Approval token bound to generating session
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col gap-2">
            <div className="p-2.5 rounded-xl bg-[#0D131C]/60 border border-[#1E2631] flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-5 h-5 rounded-md bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                  <CheckCircle2 size={12} />
                </div>
                <div>
                  <span className="text-xs font-medium text-[#EBE8E0] block leading-tight">
                    Autonomous Threshold
                  </span>
                  <span className="text-[10px] text-[#8FA3B0]">All items under $50 pass automatically</span>
                </div>
              </div>
              <span className="text-xs font-mono text-[#10B981]">0 Queued</span>
            </div>

            <button
              onClick={onRunDemo}
              className="w-full py-1.5 px-3 rounded-lg bg-[#1E2631] hover:bg-[#28374A] text-[#EBE8E0] text-xs font-medium border border-[#2E3E52] flex items-center justify-center gap-1.5 transition-all"
            >
              <Play size={12} className="text-[#6C8CA1]" />
              <span>Simulate $95 Threshold Check</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
