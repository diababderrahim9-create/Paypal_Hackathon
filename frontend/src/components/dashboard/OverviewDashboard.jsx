import React, { useState } from 'react';
import MetricCards from './MetricCards';
import PipelineTimeline from './PipelineTimeline';
import FloatingPendingCard from './FloatingPendingCard';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flame,
  FlaskConical,
  History,
  Lock,
  Play,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function OverviewDashboard({
  metrics,
  intents = [],
  logs = [],
  latestResult,
  currentIntent,
  pendingApprovals = [],
  approvalTokens = {},
  onApprove,
  onReject,
  approvalBusy = '',
  onRunDemo,
  onNavigateTab,
  onSubmitPrompt,
  prompt,
  setPrompt,
  busyAction,
  connection,
  scenarios = [],
  onRunScenario,
}) {
  return (
    <div className="flex-1 flex flex-col gap-6 max-w-full">
      {/* 1. Main Title & Action Bar (Matching Reference header 'Project Overview' + '+ New Projects') */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#6C8CA1] uppercase font-bold">
              Autonomous Governance
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] pulse-green" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#EBE8E0] tracking-tight mt-1">
            Security Overview
          </h1>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Real-time deterministic policy enforcement, spend containment, and cryptographic auditing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('scenarios')}
            className="px-3.5 py-2 bg-[#121A24] hover:bg-[#162230] text-[#EBE8E0] text-xs font-semibold rounded-xl border border-[#1E2631] flex items-center gap-2 transition-all shadow-sm"
          >
            <FlaskConical size={14} className="text-[#6C8CA1]" />
            <span>Adversarial Lab</span>
          </button>

          <button
            onClick={() => onNavigateTab('pipeline')}
            className="px-4 py-2 bg-[#1E2631] hover:bg-[#2A374A] text-[#EBE8E0] text-xs font-semibold rounded-xl border border-[#2E3E52] flex items-center gap-2 transition-all shadow-sm hover:border-[#6C8CA1]"
          >
            <Zap size={14} className="text-[#EBE8E0]" />
            <span>+ Run Security Check</span>
          </button>
        </div>
      </div>

      {/* 2. Top 3 Metric Cards (Active Projects, Revenue Q2, Team Productivity) */}
      <MetricCards metrics={metrics} intents={intents} logs={logs} />

      {/* 3. Middle Timeline Milestones & Wave Activity Chart (Project Milestones) */}
      <PipelineTimeline latestResult={latestResult} />

      {/* 4. Judge Quick Scenarios Bar (One-click real pipeline testing) */}
      <div className="warden-card p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider">
              Verification Scenarios
            </span>
            <span className="text-xs text-[#8FA3B0]">· Real /api/shop backend runs</span>
          </div>
          <button
            onClick={() => onNavigateTab('scenarios')}
            className="text-xs text-[#6C8CA1] hover:text-[#EBE8E0] font-mono flex items-center gap-1 transition-colors"
          >
            Open Attack Lab <ArrowRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {scenarios.map((sc, index) => {
            const isBusy = busyAction === sc.key;
            return (
              <button
                key={sc.key}
                onClick={() => onRunScenario(sc)}
                disabled={Boolean(busyAction) || connection !== 'connected'}
                className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] hover:border-[#6C8CA1] hover:bg-[#162230] text-left flex flex-col justify-between gap-3 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-mono text-[#8FA3B0]">0{index + 1}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                      sc.expected === 'ALLOW'
                        ? 'text-[#10B981] bg-[#10B981]/15'
                        : sc.expected === 'ASK_HUMAN'
                        ? 'text-[#F59E0B] bg-[#F59E0B]/15'
                        : 'text-[#EF4444] bg-[#EF4444]/15'
                    }`}
                  >
                    EXPECT {sc.expected}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#EBE8E0] block group-hover:text-white leading-tight">
                    {sc.title}
                  </span>
                  <span className="text-[10px] text-[#8FA3B0] block mt-0.5">
                    {sc.subtitle}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#6C8CA1] pt-1 border-t border-[#1E2631]/60">
                  <span>Execute test</span>
                  <Play size={10} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Floating Pending Card (Matching Reference bottom-right overlay) */}
      <FloatingPendingCard
        pendingApprovals={pendingApprovals}
        approvalTokens={approvalTokens}
        onApprove={onApprove}
        onReject={onReject}
        approvalBusy={approvalBusy}
        onRunDemo={onRunDemo}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
}
