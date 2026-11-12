import React from 'react';
import WardenLogo from '../WardenLogo';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Command,
  Fingerprint,
  FlaskConical,
  History,
  Menu,
  Play,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

export default function HeaderNav({
  activeTab,
  setActiveTab,
  pendingCount = 0,
  connection = 'connected',
  onRefresh,
  refreshing = false,
  onNewRun,
  attackActive = false,
  chainOk = true,
}) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'pipeline', label: 'Agent Pipeline' },
    { id: 'scenarios', label: 'Attack Lab' },
    { id: 'approvals', label: 'Approvals', badge: pendingCount > 0 ? pendingCount : null },
    { id: 'ledger', label: 'Audit Ledger' },
    { id: 'integrity', label: 'Integrity & Proof' },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-[#101722]/90 backdrop-blur-md border-b border-[#1E2631] px-4 lg:px-6 py-2.5">
      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-6">
          <WardenLogo variant="full" size={32} />

          {/* Center Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5 ml-2 p-1 bg-[#0D131C] border border-[#1E2631] rounded-xl">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`nav-tab-pill px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                    isActive ? 'active' : ''
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="px-1.5 py-0.2 bg-[#EF4444] text-white text-[10px] font-bold rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Sync with WARDEN backend"
            className="p-2 text-[#8FA3B0] hover:text-[#EBE8E0] bg-[#121A24] hover:bg-[#162230] border border-[#1E2631] rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'spin text-[#6C8CA1]' : ''} />
          </button>

          {/* System Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#0D131C] border border-[#1E2631] rounded-lg text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                connection === 'connected'
                  ? 'bg-[#10B981] pulse-green'
                  : connection === 'checking'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#EF4444] pulse-red'
              }`}
            />
            <span className="text-[#8FA3B0] uppercase text-[10px] tracking-wider font-semibold">
              {connection === 'connected' ? 'Sandbox API' : connection === 'checking' ? 'Syncing' : 'Offline'}
            </span>
          </div>

          {/* Quick Action Button */}
          <button
            onClick={onNewRun}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#1E2631] hover:bg-[#253242] text-[#EBE8E0] text-xs font-semibold rounded-lg border border-[#2E3E52] shadow-sm transition-all hover:border-[#6C8CA1]"
          >
            <Zap size={13} className="text-[#6C8CA1]" />
            <span>+ New Run</span>
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setActiveTab('approvals')}
              className="p-2 text-[#8FA3B0] hover:text-[#EBE8E0] bg-[#121A24] border border-[#1E2631] rounded-lg relative"
              title="Notifications"
            >
              <Bell size={14} />
              {(pendingCount > 0 || attackActive) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#EF4444] rounded-full border-2 border-[#101722]" />
              )}
            </button>
          </div>

          {/* User / Workspace Avatar Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#1E2631]">
            <div className="w-8 h-8 rounded-full bg-[#1E2631] border border-[#2C3E54] flex items-center justify-center text-xs font-bold text-[#EBE8E0] tracking-wider">
              WD
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#EBE8E0] leading-tight">Admin Ops</span>
              <span className="text-[10px] font-mono text-[#8FA3B0]">Policy Officer</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile navigation tab scrollbar */}
      <div className="flex md:hidden overflow-x-auto gap-1 pt-2 pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-tab-pill whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                isActive ? 'active' : ''
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 bg-[#EF4444] text-white text-[10px] font-bold rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
}
