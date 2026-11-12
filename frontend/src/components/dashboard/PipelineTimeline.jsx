import React, { useState } from 'react';
import { ChevronDown, Shield, Sparkles, LockKeyhole, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function PipelineTimeline({ latestResult }) {
  const [timelineRange, setTimelineRange] = useState('Realtime');

  // Determine which phase is active based on latestResult
  let currentPhase = 4;
  let phaseStatus = '100% verified';
  if (latestResult) {
    if (latestResult.decision === 'DENY') {
      currentPhase = 3;
      phaseStatus = 'Intercepted at Policy Gate';
    } else if (latestResult.decision === 'ASK_HUMAN') {
      currentPhase = 3;
      phaseStatus = 'Awaiting Human Payer Signature';
    } else {
      currentPhase = 4;
      phaseStatus = '100% policy bound & settled';
    }
  }

  return (
    <div className="warden-card p-5 lg:p-6 flex flex-col gap-6">
      {/* Header with Title and Timeline Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1E2631]/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-[#6C8CA1] uppercase tracking-wider">
              Verification Flow
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] pulse-green" />
          </div>
          <h3 className="text-base lg:text-lg font-bold text-[#EBE8E0] mt-0.5">
            Deterministic Pipeline Milestones
          </h3>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Autonomous Purchase Governance — 4-Stage Zero-Trust Guardrail (Phase 1 → Phase 4)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-medium text-[#10B981]">
            {phaseStatus}
          </span>
          <div className="relative">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-[#0D131C] border border-[#1E2631] text-[#EBE8E0] rounded-lg text-xs font-medium hover:border-[#6C8CA1] transition-all">
              <span>{timelineRange}</span>
              <ChevronDown size={13} className="text-[#8FA3B0]" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-segment Milestone Progress Bar (Matching Reference) */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-2 relative">
          {/* Phase 1: Proposal */}
          <div className="flex flex-col gap-1.5">
            <div className="h-2 rounded-full bg-[#6C8CA1] relative overflow-hidden shadow-[0_0_8px_rgba(108,140,161,0.4)]">
              <div className="h-full bg-gradient-to-r from-[#6C8CA1] to-[#EBE8E0] w-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-[#8FA3B0]">
              <span className="font-semibold text-[#EBE8E0]">Phase 1</span>
              <span>Proposal</span>
            </div>
          </div>

          {/* Phase 2: Quarantine */}
          <div className="flex flex-col gap-1.5">
            <div className="h-2 rounded-full bg-[#6C8CA1] relative overflow-hidden shadow-[0_0_8px_rgba(108,140,161,0.4)]">
              <div className="h-full bg-gradient-to-r from-[#6C8CA1] to-[#EBE8E0] w-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-[#8FA3B0]">
              <span className="font-semibold text-[#EBE8E0]">Phase 2</span>
              <span>Quarantine</span>
            </div>
          </div>

          {/* Phase 3: Policy Gate */}
          <div className="flex flex-col gap-1.5">
            <div
              className={`h-2 rounded-full relative overflow-hidden ${
                currentPhase >= 3
                  ? latestResult?.decision === 'DENY'
                    ? 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                    : 'bg-[#6C8CA1] shadow-[0_0_8px_rgba(108,140,161,0.4)]'
                  : 'bg-[#1E2631]'
              }`}
            >
              <div
                className={`h-full w-full ${
                  latestResult?.decision === 'DENY'
                    ? 'bg-gradient-to-r from-[#EF4444] to-[#F87171]'
                    : 'bg-gradient-to-r from-[#6C8CA1] to-[#EBE8E0]'
                }`}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-[#8FA3B0]">
              <span className="font-semibold text-[#EBE8E0]">Phase 3</span>
              <span>Policy Gate</span>
            </div>
          </div>

          {/* Phase 4: Cryptographic Settlement */}
          <div className="flex flex-col gap-1.5">
            <div
              className={`h-2 rounded-full relative overflow-hidden ${
                currentPhase >= 4
                  ? 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : latestResult?.decision === 'DENY'
                  ? 'bg-[#1E2631]'
                  : 'bg-[#1E2631]'
              }`}
            >
              {currentPhase >= 4 && (
                <div className="h-full bg-gradient-to-r from-[#6C8CA1] to-[#10B981] w-full" />
              )}
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-[#8FA3B0]">
              <span className="font-semibold text-[#EBE8E0]">Phase 4</span>
              <span>Settlement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytical Wave / Area Chart (0-100 vertical scale, Mon-Sat horizontal scale) */}
      <div className="relative pt-2">
        <div className="flex items-center justify-between text-xs font-mono text-[#8FA3B0] mb-2">
          <span>Security Threat &amp; Spend Evaluation Volume</span>
          <span className="text-[#6C8CA1]">0 ms Latency Penalty</span>
        </div>

        <div className="relative h-44 w-full">
          {/* Y Axis Guide Lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] font-mono text-[#8FA3B0]/60 pr-2">
            <div className="border-b border-[#1E2631]/40 w-full flex justify-between">
              <span>100</span>
              <span className="text-[9px]">Peak Guardrail</span>
            </div>
            <div className="border-b border-[#1E2631]/40 w-full flex justify-between">
              <span>75</span>
            </div>
            <div className="border-b border-[#1E2631]/40 w-full flex justify-between">
              <span>50</span>
              <span className="text-[9px]">Threshold Boundary ($50)</span>
            </div>
            <div className="border-b border-[#1E2631]/40 w-full flex justify-between">
              <span>25</span>
            </div>
            <div className="border-b border-[#1E2631]/40 w-full flex justify-between">
              <span>0</span>
            </div>
          </div>

          {/* SVG Smooth Curve */}
          <svg className="w-full h-full overflow-visible" viewBox="0 0 700 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6C8CA1" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#6C8CA1" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#101722" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Filled Area */}
            <path
              d="M 20 135 
                 C 100 130, 140 85, 200 85 
                 C 260 85, 300 115, 370 100 
                 C 440 85, 480 35, 540 60 
                 C 600 85, 640 40, 680 25 
                 L 680 155 L 20 155 Z"
              fill="url(#chartAreaGrad)"
            />

            {/* Smooth Spline Stroke */}
            <path
              d="M 20 135 
                 C 100 130, 140 85, 200 85 
                 C 260 85, 300 115, 370 100 
                 C 440 85, 480 35, 540 60 
                 C 600 85, 640 40, 680 25"
              fill="none"
              stroke="#6C8CA1"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Points on the curve */}
            <circle cx="200" cy="85" r="4" fill="#101722" stroke="#6C8CA1" strokeWidth="2" />
            <circle cx="370" cy="100" r="4" fill="#101722" stroke="#6C8CA1" strokeWidth="2" />
            <circle cx="540" cy="60" r="4" fill="#101722" stroke="#6C8CA1" strokeWidth="2" />
            <circle cx="680" cy="25" r="5" fill="#EBE8E0" stroke="#6C8CA1" strokeWidth="2" />
            <circle cx="680" cy="25" r="8" fill="#6C8CA1" opacity="0.3" />
          </svg>
        </div>

        {/* X Axis Labels */}
        <div className="flex justify-between text-[11px] font-mono text-[#8FA3B0] pt-2 px-4">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>
      </div>
    </div>
  );
}
