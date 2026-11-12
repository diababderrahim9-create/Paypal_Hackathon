import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flame,
  FlaskConical,
  Info,
  LoaderCircle,
  Lock,
  LockKeyhole,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function AttackLabView({
  scenarios = [],
  onRunScenario,
  busyAction,
  connection,
  latestResult,
  attackMode = { drift: false, injection: false },
  onUpdateAttackMode,
  attackPrompt,
  setAttackPrompt,
  onRunInjectionTest,
  onRunUnauthorizedTest,
  health,
  onResetDemo,
}) {
  return (
    <div className="flex-1 flex flex-col gap-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#6C8CA1] uppercase font-bold">
              Adversarial Sandbox &amp; Verification
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                attackMode.drift || attackMode.injection ? 'bg-[#EF4444] pulse-red' : 'bg-[#10B981]'
              }`}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#EBE8E0] tracking-tight mt-1">
            Attack Lab &amp; Judge Scenarios
          </h1>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Test the deterministic firewall against prompt injections, checkout price manipulation, and unauthorized merchants.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {health?.demo_routes_enabled && onResetDemo && (
            <button
              onClick={onResetDemo}
              disabled={Boolean(busyAction)}
              className="px-3 py-1.5 bg-[#0D131C] hover:bg-[#162230] text-[#8FA3B0] hover:text-[#EBE8E0] text-xs font-mono rounded-lg border border-[#1E2631] flex items-center gap-1.5 transition-all"
            >
              <RotateCcw size={12} />
              <span>Reset Attack Lab</span>
            </button>
          )}
          <div className="px-3 py-1 bg-[#0D131C] border border-[#1E2631] rounded-lg text-xs font-mono text-[#8FA3B0]">
            Status: <b className={attackMode.drift || attackMode.injection ? 'text-[#EF4444]' : 'text-[#10B981]'}>
              {attackMode.drift || attackMode.injection ? 'ATTACK ARMED' : 'SYSTEM NOMINAL'}
            </b>
          </div>
        </div>
      </div>

      {/* 1. Judge Scenarios (4 Cards) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider">
            One-Click Judge Scenarios (/api/shop)
          </span>
          <span className="text-[11px] text-[#8FA3B0]">Runs real server pipeline</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {scenarios.map((sc, index) => {
            const isBusy = busyAction === sc.key;
            const Icon = sc.icon;
            const isAllow = sc.expected === 'ALLOW';
            const isHuman = sc.expected === 'ASK_HUMAN';
            const isDeny = sc.expected === 'DENY';

            return (
              <div
                key={sc.key}
                className="warden-card p-5 flex flex-col justify-between gap-4 relative overflow-hidden group hover:border-[#6C8CA1]/60 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isAllow
                        ? 'bg-[#10B981]/15 text-[#10B981]'
                        : isHuman
                        ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                        : 'bg-[#EF4444]/15 text-[#EF4444]'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-xs font-mono text-[#8FA3B0]">0{index + 1}</span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#EBE8E0] leading-tight">
                    {sc.title}
                  </h3>
                  <p className="text-xs text-[#8FA3B0] mt-1">
                    {sc.subtitle}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#1E2631]/60 flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      isAllow
                        ? 'bg-[#10B981]/15 text-[#10B981]'
                        : isHuman
                        ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                        : 'bg-[#EF4444]/15 text-[#EF4444]'
                    }`}
                  >
                    EXPECT {sc.expected}
                  </span>

                  <button
                    onClick={() => onRunScenario(sc)}
                    disabled={Boolean(busyAction) || connection !== 'connected'}
                    className="p-2 bg-[#1E2631] hover:bg-[#2A374A] text-[#EBE8E0] rounded-lg transition-all group-hover:bg-[#6C8CA1] group-hover:text-[#101722]"
                    title={`Run ${sc.title}`}
                  >
                    {isBusy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Attack Control Plane (Interactive Toggles & Custom Payloads) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Left: Toggles and Attack Triggers (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="warden-card p-5 flex flex-col gap-4">
            <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider border-b border-[#1E2631]/60 pb-2">
              Adversarial Controls (/api/demo/attack)
            </span>

            {/* Toggle 1: Price Drift */}
            <div className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EF4444]/15 text-[#EF4444] flex items-center justify-center shrink-0 mt-0.5">
                  <ArrowDownRight size={17} />
                </div>
                <div>
                  <strong className="text-xs font-semibold text-[#EBE8E0] block">
                    Checkout Price-Drift Attack
                  </strong>
                  <p className="text-[11px] text-[#8FA3B0] mt-0.5">
                    Storefront displays $45 quoted, but the merchant silently charges $450 at live checkout.
                  </p>
                </div>
              </div>

              <button
                role="switch"
                aria-checked={attackMode.drift}
                onClick={() => onUpdateAttackMode('drift', !attackMode.drift)}
                disabled={Boolean(busyAction) || !health?.demo_routes_enabled}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${
                  attackMode.drift ? 'bg-[#EF4444]' : 'bg-[#1E2631]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    attackMode.drift ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Prompt Injection */}
            <div className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert size={17} />
                </div>
                <div>
                  <strong className="text-xs font-semibold text-[#EBE8E0] block">
                    Storefront Prompt-Injection Payload
                  </strong>
                  <p className="text-[11px] text-[#8FA3B0] mt-0.5">
                    Embeds malicious instructions inside raw product HTML to hijack the autonomous shopper.
                  </p>
                </div>
              </div>

              <button
                role="switch"
                aria-checked={attackMode.injection}
                onClick={() => onUpdateAttackMode('injection', !attackMode.injection)}
                disabled={Boolean(busyAction) || !health?.demo_routes_enabled}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${
                  attackMode.injection ? 'bg-[#8B5CF6]' : 'bg-[#1E2631]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    attackMode.injection ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Malicious Prompt Test */}
            <div className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] flex flex-col gap-2.5">
              <label htmlFor="attack-prompt-input" className="text-xs font-semibold text-[#EBE8E0]">
                Malicious Storefront Payload Simulator:
              </label>
              <textarea
                id="attack-prompt-input"
                rows={2}
                maxLength={500}
                value={attackPrompt}
                onChange={(e) => setAttackPrompt(e.target.value)}
                className="w-full p-2.5 bg-[#121A24] border border-[#1E2631] rounded-lg text-xs text-[#EF4444] font-mono focus:outline-none focus:border-[#EF4444]"
              />
              <button
                onClick={onRunInjectionTest}
                disabled={Boolean(busyAction) || connection !== 'connected'}
                className="py-2 px-3 bg-[#EF4444]/20 hover:bg-[#EF4444]/30 text-[#EF4444] text-xs font-semibold rounded-lg border border-[#EF4444]/40 flex items-center justify-center gap-1.5 transition-all"
              >
                {busyAction === 'attack-injection-test' ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
                <span>Execute Injection Attack Probe</span>
              </button>
            </div>

            {/* Merchant Allowlist Gate */}
            <div className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] flex items-center justify-between gap-4">
              <div>
                <strong className="text-xs font-semibold text-[#EBE8E0] block">
                  Unauthorized Merchant Probe
                </strong>
                <p className="text-[11px] text-[#8FA3B0] mt-0.5">
                  Tries to buy an unauthorized $499 EvilCorp offer not in the merchant allowlist.
                </p>
              </div>
              <button
                onClick={onRunUnauthorizedTest}
                disabled={Boolean(busyAction) || connection !== 'connected'}
                className="py-2 px-3 bg-[#1E2631] hover:bg-[#2A374A] text-[#EBE8E0] text-xs font-semibold rounded-lg border border-[#2E3E52] shrink-0 flex items-center gap-1.5 transition-all"
              >
                {busyAction === 'attack-merchant-test' ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
                <span>Test Allowlist Gate</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Attack State & Live Forensics Evidence (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="warden-card p-5 flex flex-col gap-4">
            <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider border-b border-[#1E2631]/60 pb-2">
              Live Firewall Intercept Evidence
            </span>

            {latestResult && (latestResult.scenario_key?.startsWith('ATTACK') || latestResult.quarantine_extracted) ? (
              <div className="flex flex-col gap-3">
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    latestResult.decision === 'DENY'
                      ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]'
                      : 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-mono uppercase block text-[#8FA3B0]">
                      Verdict Recorded
                    </span>
                    <strong className="text-sm font-mono font-bold">
                      {latestResult.decision}
                    </strong>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#0D131C] text-[#EBE8E0]">
                    {latestResult.scenario_key || 'ATTACK_RUN'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] text-xs text-[#8FA3B0] flex flex-col gap-1.5 font-mono">
                  <div>Reason: <span className="text-[#EBE8E0]">{latestResult.reason || latestResult.policy_evaluation?.reason || '—'}</span></div>
                  <div>Quarantine Injection Detected: <b className={latestResult.quarantine_extracted?.injection_detected ? 'text-[#EF4444]' : 'text-[#10B981]'}>{latestResult.quarantine_extracted?.injection_detected ? 'YES' : 'NO'}</b></div>
                  <div>Price Drift Detected: <b className={latestResult.price_drift_detected ? 'text-[#EF4444]' : 'text-[#10B981]'}>{latestResult.price_drift_detected ? 'YES' : 'NO'}</b></div>
                  <div>PayPal Order Created: <b className="text-[#EBE8E0]">{latestResult.paypal_order_id || 'HALTED (Zero created)'}</b></div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#8FA3B0] flex flex-col items-center justify-center gap-2">
                <ShieldAlert size={24} className="text-[#6C8CA1]" />
                <span>Run an attack probe above to observe the live intercept proof.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
