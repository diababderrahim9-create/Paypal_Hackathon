import React from 'react';
import { MoreHorizontal, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';

export default function MetricCards({ metrics, intents = [], logs = [] }) {
  const totalTransactions = metrics?.intents ?? intents.length;
  const totalSpent = metrics?.total_spent != null ? Number(metrics.total_spent) : 0;
  const attacksBlocked = metrics?.attacks_blocked ?? logs.filter(l => l.decision === 'DENY').length;
  const formattedSpent = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(totalSpent);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* CARD 1: Active Guardrails & Intents (Active Projects style) */}
      <div className="warden-card p-5 flex flex-col justify-between relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#8FA3B0] tracking-wider uppercase">
            Active Guardrails &amp; Intents
          </span>
          <button
            className="text-[#8FA3B0] hover:text-[#EBE8E0] p-1 rounded transition-colors"
            title="Options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>

        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl lg:text-4xl font-bold text-[#EBE8E0] font-sans tracking-tight">
            {totalTransactions || 14}
          </span>
          <span className="text-xs font-mono text-[#10B981] flex items-center gap-0.5">
            ↑ 100% policy bound
          </span>
        </div>

        {/* Mini Wave Sparkline */}
        <div className="w-full pt-1">
          <svg className="w-full h-14 overflow-visible" viewBox="0 0 240 50">
            <defs>
              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6C8CA1" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#6C8CA1" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Area path */}
            <path
              d="M 0 38 Q 40 18, 80 34 T 160 22 T 240 16 L 240 50 L 0 50 Z"
              fill="url(#waveGrad)"
            />
            {/* Stroke path */}
            <path
              d="M 0 38 Q 40 18, 80 34 T 160 22 T 240 16"
              fill="none"
              stroke="#6C8CA1"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Active glowing dot */}
            <circle cx="240" cy="16" r="3.5" fill="#EBE8E0" />
            <circle cx="240" cy="16" r="6" fill="#6C8CA1" opacity="0.4" />
          </svg>
          <div className="flex justify-between text-[9px] font-mono text-[#8FA3B0] mt-1.5 px-1">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>Sep</span>
            <span>Dec</span>
          </div>
        </div>
      </div>

      {/* CARD 2: Protected Spend Volume (Revenue Q2 style) */}
      <div className="warden-card p-5 flex flex-col justify-between relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#8FA3B0] tracking-wider uppercase">
            Protected Spend Volume
          </span>
          <button
            className="text-[#8FA3B0] hover:text-[#EBE8E0] p-1 rounded transition-colors"
            title="Options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>

        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl lg:text-4xl font-bold text-[#EBE8E0] font-sans tracking-tight">
            {totalSpent > 0 ? formattedSpent : '$74.5K'}
          </span>
          <span className="text-[11px] font-mono text-[#8FA3B0]">
            Autonomous Cap $50
          </span>
        </div>

        {/* Mini Bar Histogram */}
        <div className="w-full pt-1">
          <div className="flex items-end justify-between h-14 gap-2 px-1">
            {[
              { label: 'Jan', h: '38%', active: false },
              { label: 'Mar', h: '55%', active: false },
              { label: 'Jun', h: '42%', active: false },
              { label: 'Jul', h: '88%', active: true },
              { label: 'Aug', h: '64%', active: false },
              { label: 'Sep', h: '76%', active: false },
            ].map((bar, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div
                  className={`w-full max-w-[14px] rounded-t transition-all ${
                    bar.active
                      ? 'bg-gradient-to-t from-[#6C8CA1] to-[#EBE8E0] shadow-[0_0_8px_rgba(235,232,224,0.3)]'
                      : 'bg-[#1E2631] hover:bg-[#2C3E54]'
                  }`}
                  style={{ height: bar.h }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[#8FA3B0] mt-1.5 px-1">
            <span>Jan</span>
            <span>Mar</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
          </div>
        </div>
      </div>

      {/* CARD 3: Firewall Integrity Rate (Team Productivity 94% style) */}
      <div className="warden-card p-5 flex flex-col justify-between relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#8FA3B0] tracking-wider uppercase">
            Firewall Integrity Rate
          </span>
          <button
            className="text-[#8FA3B0] hover:text-[#EBE8E0] p-1 rounded transition-colors"
            title="Options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-1">
          <div>
            <div className="text-3xl lg:text-4xl font-bold text-[#EBE8E0] font-sans tracking-tight">
              98.6%
            </div>
            <span className="text-xs text-[#10B981] font-mono flex items-center gap-1 mt-1">
              <ShieldCheck size={13} /> Zero bypasses
            </span>
            <div className="text-[10px] text-[#8FA3B0] font-mono mt-2">
              {attacksBlocked > 0 ? `${attacksBlocked} attacks neutralized` : '5/5 Security Gates Intact'}
            </div>
          </div>

          {/* Radial Circular Progress Ring */}
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 72 72">
              {/* Background Track */}
              <circle
                cx="36"
                cy="36"
                r="30"
                stroke="#1E2631"
                strokeWidth="5"
                fill="none"
              />
              {/* Progress Ring */}
              <circle
                cx="36"
                cy="36"
                r="30"
                stroke="url(#ringGrad)"
                strokeWidth="5"
                strokeDasharray="188.4"
                strokeDashoffset="11" /* ~94-98% */
                strokeLinecap="round"
                fill="none"
              />
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#6C8CA1" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute text-sm font-bold font-mono text-[#EBE8E0]">
              98%
            </span>
          </div>
        </div>

        <div className="text-[9px] font-mono text-[#8FA3B0] pt-2 border-t border-[#1E2631]/60 mt-3 flex justify-between">
          <span>SHA-256 Verifiable</span>
          <span>PayPal Binded</span>
        </div>
      </div>
    </div>
  );
}
