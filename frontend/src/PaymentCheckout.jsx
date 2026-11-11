import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { ExternalLink, LoaderCircle } from 'lucide-react';

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
    <div className="checkout-box">
      <div className="checkout-head">
        <div className="step-number">04</div>
        <div>
          <strong>PayPal buyer approval</strong>
          <p>Policy approval is not payment consent. The buyer must approve in PayPal.</p>
        </div>
      </div>
      <div className="checkout-order">
        <span>Server-created order</span>
        <code>{orderId}</code>
      </div>
      {clientId ? (
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
      ) : (
        <div className="inline-notice warning-notice">
          PayPal checkout is unavailable because the public Sandbox client ID is not configured.
          No payment has been attempted.
        </div>
      )}
      {result.approve_url && (
        <a
          className="text-link buyer-link"
          href={result.approve_url}
          target="_blank"
          rel="noreferrer"
        >
          Open the Sandbox buyer-approval page <ExternalLink size={13} />
        </a>
      )}
      {capturing && (
        <div className="capture-progress">
          <LoaderCircle className="spin" size={15} /> Verifying capture with WARDEN…
        </div>
      )}
    </div>
  );
}
