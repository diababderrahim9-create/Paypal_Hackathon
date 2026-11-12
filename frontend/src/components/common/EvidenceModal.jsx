import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileCheck,
  FileText,
  Fingerprint,
  LoaderCircle,
  Printer,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function EvidenceModal({ auditRow, onClose }) {
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!auditRow?.id) return;
    let isMounted = true;
    setLoading(true);
    setError('');

    fetch(`${API_BASE}/api/audit/${auditRow.id}/evidence`)
      .then((res) => {
        if (!res.ok) throw new Error(`Evidence failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setEvidence(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [auditRow?.id]);

  const copyJSON = () => {
    if (!evidence) return;
    navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const printableUrl = auditRow?.id
    ? `${API_BASE}/api/audit/${auditRow.id}/evidence/html`
    : '#';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="warden-card w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border-[#6C8CA1]/40 shadow-2xl">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-[#101722] border-b border-[#1E2631] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2631] text-[#6C8CA1] flex items-center justify-center border border-[#2E3E52]">
              <FileCheck size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider">
                  PayPal Dispute Forensics
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#10B981]/20 text-[#10B981]">
                  SHA-256 SEALED
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[#EBE8E0]">
                Forensic Evidence Packet · #{auditRow?.id}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={printableUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-[#1E2631] hover:bg-[#253242] text-[#EBE8E0] text-xs font-mono rounded-lg border border-[#2E3E52] flex items-center gap-1.5 transition-all"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Printable Certificate</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-[#8FA3B0] hover:text-[#EBE8E0] rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 bg-[#0D131C] border-b border-[#1E2631] text-xs font-mono">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'summary'
                ? 'border-[#6C8CA1] text-[#EBE8E0] font-bold'
                : 'border-transparent text-[#8FA3B0]'
            }`}
          >
            Audit Summary
          </button>
          <button
            onClick={() => setActiveTab('paypal')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'paypal'
                ? 'border-[#6C8CA1] text-[#EBE8E0] font-bold'
                : 'border-transparent text-[#8FA3B0]'
            }`}
          >
            PayPal Dispute API Payload
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'raw'
                ? 'border-[#6C8CA1] text-[#EBE8E0] font-bold'
                : 'border-transparent text-[#8FA3B0]'
            }`}
          >
            Full Forensic JSON
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 font-mono text-xs">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8FA3B0]">
              <LoaderCircle className="spin text-[#6C8CA1]" size={28} />
              <span>Compiling cryptographic evidence bundle…</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444]">
              Error loading evidence: {error}
            </div>
          ) : evidence ? (
            activeTab === 'summary' ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
                    <span className="text-[10px] text-[#8FA3B0] block">Packet ID</span>
                    <strong className="text-xs text-[#6C8CA1]">{evidence.evidence_packet_id}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631]">
                    <span className="text-[10px] text-[#8FA3B0] block">Generated At</span>
                    <strong className="text-xs text-[#EBE8E0]">
                      {new Date(evidence.generated_at).toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0D131C] border border-[#1E2631] flex flex-col gap-2">
                  <div className="text-[11px] font-bold text-[#EBE8E0]">
                    Deterministic Firewall Verdict
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        auditRow.decision === 'ALLOW'
                          ? 'bg-[#10B981]/20 text-[#10B981]'
                          : auditRow.decision === 'ASK_HUMAN'
                          ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                          : 'bg-[#EF4444]/20 text-[#EF4444]'
                      }`}
                    >
                      {auditRow.decision}
                    </span>
                    <span className="text-xs text-[#8FA3B0]">
                      Risk Score: {auditRow.risk_score}/100
                    </span>
                  </div>
                  <p className="text-xs text-[#8FA3B0] mt-1">{auditRow.reason}</p>
                </div>

                <div className="p-4 rounded-xl bg-[#0D131C] border border-[#1E2631] flex flex-col gap-2">
                  <div className="text-[11px] font-bold text-[#EBE8E0]">
                    Cryptographic SHA-256 Proof
                  </div>
                  <div className="text-[10px] text-[#8FA3B0] break-all">
                    Entry Hash: <span className="text-[#6C8CA1]">{auditRow.entry_hash}</span>
                  </div>
                  <div className="text-[10px] text-[#8FA3B0] break-all">
                    Previous Hash: <span className="text-[#8FA3B0]">{auditRow.prev_hash || '0'.repeat(64)}</span>
                  </div>
                </div>
              </div>
            ) : activeTab === 'paypal' ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center text-[11px] text-[#8FA3B0]">
                  <span>Payload mapped to PayPal `provide-evidence` format:</span>
                  <button
                    onClick={copyJSON}
                    className="flex items-center gap-1 text-[#6C8CA1] hover:text-[#EBE8E0]"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] text-[11px] text-[#10B981] overflow-x-auto">
                  {JSON.stringify(evidence.paypal_dispute_api_payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center text-[11px] text-[#8FA3B0]">
                  <span>Full WARDEN Dispute Bundle:</span>
                  <button
                    onClick={copyJSON}
                    className="flex items-center gap-1 text-[#6C8CA1] hover:text-[#EBE8E0]"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-[#0D131C] border border-[#1E2631] text-[11px] text-[#6C8CA1] overflow-x-auto">
                  {JSON.stringify(evidence, null, 2)}
                </pre>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
