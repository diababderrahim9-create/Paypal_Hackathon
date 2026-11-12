import React from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { ExternalLink, LoaderCircle, Lock, ShieldCheck } from 'lucide-react';

export default function PaymentCheckout({
  result,
  clientId,
  onCapture,
  onError,
  capturing,
}) {
  const intentId = result?.intent_id;
  const orderId = result?.paypal_order_id;
  if (!intentId || !orderId) return null;

  return (
    <div className="p-4 rounded-xl bg-[#0D131C] border border-[#1E2631] flex flex-col gap-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1E2631]/60">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-[#10B981]/20 text-[#10B981] flex items-center justify-center font-bold text-[10px]">
            04
          </span>
          <strong className="text-xs text-[#EBE8E0]">PayPal Buyer Consent</strong>
        </div>
        <span className="text-[10px] text-[#8FA3B0]">Sandbox Gateway</span>
      </div>

      <div className="flex items-center justify-between text-xs bg-[#121A24] p-2 rounded-lg border border-[#1E2631]">
        <span className="text-[10px] text-[#8FA3B0]">Server Order ID</span>
        <code className="text-[#6C8CA1] font-bold">{orderId}</code>
      </div>

      {clientId ? (
        <div className="pt-1">
          <PayPalScriptProvider
            key={intentId}
            options={{ clientId, currency: result.currency || 'USD', intent: 'capture' }}
          >
            <PayPalButtons
              style={{ layout: 'vertical', shape: 'rect', label: 'paypal', height: 42 }}
              disabled={capturing}
              createOrder={() => Promise.resolve(orderId)}
              onApprove={async () => onCapture(intentId)}
              onError={(error) => onError(error)}
            />
          </PayPalScriptProvider>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-xs text-[#F59E0B]">
          PayPal client ID not detected. Add PAYPAL_CLIENT_ID to .env for interactive Sandbox buttons.
        </div>
      )}

      {result.approve_url && (
        <a
          href={result.approve_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#6C8CA1] hover:text-[#EBE8E0] flex items-center justify-center gap-1.5 pt-1 transition-colors"
        >
          <span>Open Sandbox Buyer Approval Page</span>
          <ExternalLink size={12} />
        </a>
      )}

      {capturing && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#10B981] font-semibold bg-[#10B981]/10 rounded-lg border border-[#10B981]/30">
          <LoaderCircle className="spin" size={14} />
          <span>Verifying cryptographic capture with WARDEN backend…</span>
        </div>
      )}
    </div>
  );
}
