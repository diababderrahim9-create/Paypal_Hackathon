import React from 'react';
import { Database, ShieldCheck, Tag, X } from 'lucide-react';

const money = (val) =>
  Number.isFinite(Number(val))
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(val))
    : '—';

export default function CatalogModal({ catalog = [], onClose, onSelectProduct }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="warden-card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border-[#6C8CA1]/40 shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#101722] border-b border-[#1E2631] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2631] text-[#6C8CA1] flex items-center justify-center border border-[#2E3E52]">
              <Database size={18} />
            </div>
            <div>
              <span className="text-xs font-mono font-bold text-[#6C8CA1] uppercase tracking-wider block">
                Storefront Catalog &amp; Merchant Allowlist
              </span>
              <h2 className="text-sm sm:text-base font-bold text-[#EBE8E0]">
                Authorized Catalog Items ({catalog.length})
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8FA3B0] hover:text-[#EBE8E0] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Product List */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3 font-mono text-xs">
          {catalog.map((prod) => (
            <div
              key={prod.id || prod.product_id}
              className="p-3.5 rounded-xl bg-[#0D131C] border border-[#1E2631] flex items-center justify-between gap-4 hover:border-[#6C8CA1]/50 transition-all"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-[#EBE8E0] truncate">
                    {prod.name || prod.product_name}
                  </strong>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#10B981]/20 text-[#10B981] font-bold">
                    ALLOWLISTED
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#8FA3B0]">
                  <span>ID: <code className="text-[#6C8CA1]">{prod.id || prod.product_id}</code></span>
                  <span>Merchant: <b className="text-[#EBE8E0]">{prod.merchant || prod.merchant_id}</b></span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-[#EBE8E0]">
                  {money(prod.price || prod.quoted_price)}
                </span>
                {onSelectProduct && (
                  <button
                    onClick={() => {
                      onSelectProduct(prod);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-[#1E2631] hover:bg-[#253242] text-[#EBE8E0] rounded-lg border border-[#2E3E52] text-xs transition-colors"
                  >
                    Test Buy
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
