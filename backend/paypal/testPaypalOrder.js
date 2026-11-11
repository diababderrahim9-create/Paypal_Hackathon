// testPayPalOrder.js
// Run from the project root:  node backend/paypal/testPayPalOrder.js
const {
  createOrder,
  captureOrder,
  getOrderDetails,
  createRequestId,
} = require('./paypalExecutor'); // loads .env from the project root

const money = (v) => Number(v).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const approvedAmount = '1.00';
  const approvedCurrency = 'USD';

  // 1. Create the order
  const o = await createOrder({
    amount: approvedAmount,
    currency: approvedCurrency,
    description: 'Warden $1 test order',
    returnUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  });
  console.log('created:', o);
  console.log(
    '\nOpen this URL and approve with the SANDBOX Personal buyer:\n',
    o.approveUrl,
    '\n'
  );

  // 2. Poll up to 3 minutes for the buyer to approve
  let approved = false;
  for (let i = 0; i < 90; i++) {
    const d = await getOrderDetails(o.id);
    if (d.status === 'APPROVED' || d.status === 'COMPLETED') {
      console.log('details:', d);
      approved = true;
      break;
    }
    await sleep(2000);
  }
  if (!approved) {
    throw new Error('Timed out after 3 minutes waiting for buyer approval');
  }

  // 3. Capture safely
  const details = await getOrderDetails(o.id);

  if (details.status === 'COMPLETED') {
    console.log('already captured, nothing to do');
    return;
  }
  if (details.status !== 'APPROVED') {
    throw new Error(`order not approved: ${details.status}`);
  }
  if (
    money(details.amount) !== money(approvedAmount) ||
    details.currency !== approvedCurrency
  ) {
    throw new Error(
      `amount mismatch on file: ${details.amount} ${details.currency}`
    );
  }

  const result = await captureOrder(o.id, {
    requestId: createRequestId('capture', o.id),
  });
  console.log('captured:', result);

  if (!result.purchaseUnits.length) {
    throw new Error(
      'capture response had no purchase_units (check the Prefer header)'
    );
  }
  if (
    result.status !== 'COMPLETED' ||
    result.purchaseUnits[0].captureStatus !== 'COMPLETED'
  ) {
    throw new Error(`capture not completed: ${result.status}`);
  }
  if (money(result.purchaseUnits[0].amount) !== money(approvedAmount)) {
    throw new Error(
      `captured amount ${result.purchaseUnits[0].amount} != approved ${approvedAmount}`
    );
  }
  console.log('OK: money moved, amounts match.');
})().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});