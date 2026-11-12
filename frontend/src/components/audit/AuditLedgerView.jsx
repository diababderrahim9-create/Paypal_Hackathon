import React, { lazy, Suspense, useState } from 'react';
import {
  ExternalLink,
  FileCheck,
  Fingerprint,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import EvidenceModal from '../common/EvidenceModal';

const AuditGrid = lazy(() => import('../../AuditGrid.jsx'));

const money = (val, cur = 'USD') =>
  Number.isFinite(Number(val))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(val))
    : '—';

export default function AuditLedgerView({
  logs = [],
  intents = [],
  search,
  setSearch,
  decisionFilter,
  setDecisionFilter,
  selectedLog,
  setSelectedLog,
  refreshAll,
  refreshing,
  chainOk,
}) {
  const [evidenceModalRow, setEvidenceModalRow] = useState(null);

  const filteredLogs = logs.filter(
    (row) => decisionFilter === 'ALL' || row.decision === decisionFilter
  );

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#6C8CA1] uppercase font-bold">
              Immutable Forensic Audit
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] pulse-green" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#EBE8E0] tracking-tight mt-1">
            Transaction Audit Ledger
          </h1>
          <p className="text-xs text-[#8FA3B0] mt-0.5">
            Cryptographically linked SQLite records. Each entry hashes the previous block with SHA-256.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refreshAll()}
            disabled={refreshing}
            className="px-3.5 py-1.5 bg-[#121A24] hover:bg-[#162230] text-[#EBE8E0] text-xs font-semibold rounded-xl border border-[#1E2631] flex items-center gap-2 transition-all"
          >
            <RefreshCw size={13} className={refreshing ? 'spin text-[#6C8CA1]' : ''} />
            <span>Refresh Ledger</span>
          </button>
        </div>
      </div>

      {/* Grid Card */}
      <div className="warden-card p-5 flex flex-col gap-4">
        {/* Filters and search toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#1E2631]/60">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-[#EBE8E0]">
              {logs.length} Total Audit Entries
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                chainOk ? 'bg-[#10B981]/15 text-[#10B981]' : 'bg-[#EF4444]/15 text-[#EF4444]'
              }`}
            >
              {chainOk ? 'CHAIN VALID' : 'CHAIN BROKEN'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-[#8FA3B0]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ledger..."
                className="pl-8 pr-3 py-1.5 bg-[#0D131C] border border-[#1E2631] rounded-lg text-xs text-[#EBE8E0] placeholder-[#8FA3B0]/50 focus:outline-none focus:border-[#6C8CA1] w-48 sm:w-60"
              />
            </div>

            <select
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              className="py-1.5 px-3 bg-[#0D131C] border border-[#1E2631] rounded-lg text-xs font-mono text-[#EBE8E0] focus:outline-none focus:border-[#6C8CA1]"
            >
              <option value="ALL">All Decisions</option>
              <option value="ALLOW">ALLOW</option>
              <option value="ASK_HUMAN">ASK_HUMAN</option>
              <option value="DENY">DENY</option>
            </select>
          </div>
        </div>

        {/* AG-Grid Table */}
        <div className="min-h-[380px] w-full">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#8FA3B0]">
                <LoaderCircle className="spin text-[#6C8CA1]" size={28} />
                <span className="text-xs font-mono">Mounting Interactive Audit Grid…</span>
              </div>
            }
          >
            <AuditGrid
              rowData={filteredLogs}
              quickFilterText={search}
              onRowSelected={(row) => setSelectedLog(row)}
            />
          </Suspense>
        </div>
      </div>

      {/* Selected Row Detail Drawer */}
      {selectedLog && (
        <div className="warden-card p-5 flex flex-col gap-4 border-[#6C8CA1]/50 bg-[#121A24]">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2631]/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E2631] text-[#6C8CA1] flex items-center justify-center font-bold">
                #{selectedLog.id}
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#8FA3B0] uppercase block">
                  Selected Audit Record
                </span>
                <strong className="text-sm font-bold text-[#EBE8E0]">
                  {selectedLog.request_summary || 'Transaction'}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setEvidenceModalRow(selectedLog)}
                className="px-3 py-1.5 bg-[#1E2631] hover:bg-[#253242] text-[#EBE8E0] text-xs font-semibold rounded-lg border border-[#2E3E52] flex items-center gap-1.5 transition-all"
              >
                <FileCheck size={14} className="text-[#6C8CA1]" />
                <span>Forensic Dispute Evidence</span>
              </button>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-[#8FA3B0] hover:text-[#EBE8E0] rounded-lg transition-colors"
                title="Close Record Details"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
              <span className="text-[10px] text-[#8FA3B0] block">Timestamp</span>
              <strong className="text-[#EBE8E0]">
                {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '—'}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
              <span className="text-[10px] text-[#8FA3B0] block">Merchant</span>
              <strong className="text-[#EBE8E0]">{selectedLog.merchant || '—'}</strong>
            </div>
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
              <span className="text-[10px] text-[#8FA3B0] block">Quoted Amount</span>
              <strong className="text-[#EBE8E0]">{money(selectedLog.quoted_amount)}</strong>
            </div>
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
              <span className="text-[10px] text-[#8FA3B0] block">Checkout Amount</span>
              <strong className="text-[#EBE8E0]">{money(selectedLog.checkout_amount)}</strong>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] flex flex-col gap-1 text-xs font-mono">
            <span className="text-[10px] text-[#8FA3B0]">Policy Reasoning</span>
            <p className="text-[#EBE8E0]">{selectedLog.reason || 'None specified.'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] break-all">
              <span className="text-[10px] text-[#8FA3B0] block">Previous Hash (Parent)</span>
              <code className="text-[#8FA3B0]">{selectedLog.prev_hash || 'Genesis Block'}</code>
            </div>
            <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] break-all">
              <span className="text-[10px] text-[#8FA3B0] block">Entry Hash (Block Seal)</span>
              <code className="text-[#6C8CA1]">{selectedLog.entry_hash || '—'}</code>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Modal if Opened */}
      {evidenceModalRow && (
        <EvidenceModal
          auditRow={evidenceModalRow}
          onClose={() => setEvidenceModalRow(null)}
        />
      )}
    </div>
  );
}
