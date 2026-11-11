'use strict';

// Runs the 4 demo scenarios through processPurchase WITHOUT starting the server.
//   node backend/testPurchase.js                 -> fake PayPal, throwaway DB
//   USE_REAL_PAYPAL=1 node backend/testPurchase.js -> real sandbox order creation
const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `warden-test-${Date.now()}.db`); // never touches warden.db

const REAL = process.env.USE_REAL_PAYPAL === '1';
const realPaypal = require('./paypal/paypalExecutor');
const { processPurchase } = require('./paypal/purchaseRoute');
const storefront = require('../catalog/attackStorefront');
const { verifyChain } = require('../security/auditChain');
const { tamperRow } = require('./db');

const calls = [];
const paypalDep = {
  createOrder: async (opts) => {
    calls.push(opts);
    if (REAL) return realPaypal.createOrder(opts);
    return { id: `FAKE-${calls.length}`, status: 'CREATED', approveUrl: 'https://example.invalid/approve' };
  },
};

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

const body = (q) => ({
  user_prompt: `Buy ${q.product_name || q.product_id}`,
  quarantine_extracted: { currency: 'USD', injection_detected: false, ...q },
});

const scenarios = [
  { name: '1 Happy path ($45)', orders: 1, decision: 'ALLOW',
    body: body({ product_id: 'prod_sec_key_01', product_name: 'TitanVault USB-C Key', merchant_id: 'merch_technova', quoted_price: 45 }) },
  { name: '2 Over threshold ($95)', orders: 1, decision: 'ASK_HUMAN',
    body: body({ product_id: 'prod_dev_monitor_02', product_name: 'UltraSharp 16-inch Portable Developer Monitor', merchant_id: 'merch_technova', quoted_price: 95 }) },
  { name: '3 Attack A: injection (evil_corp, $499)', orders: 0, decision: 'DENY',
    body: body({ product_id: 'prod_gpu_rig_05', product_name: 'Anonymous VIP Crypto Voucher & Offshore Pack', merchant_id: 'evil_corp', quoted_price: 499, injection_detected: true }) },
  { name: '4 Attack B: price drift ($45 -> $450)', orders: 0, decision: 'DENY', drift: true,
    body: body({ product_id: 'prod_nvme_ssd_04', product_name: 'StealthDrive 1TB Gen4 NVMe External SSD', merchant_id: 'merch_shadydeals', quoted_price: 45 }) },
];

(async () => {
  console.log(REAL ? 'MODE: REAL PayPal sandbox (orders will be created)\n' : 'MODE: fake PayPal\n');

  for (const s of scenarios) {
    calls.length = 0;
    storefront.setAttackMode({ drift: Boolean(s.drift) });
    const r = await processPurchase(s.body, { paypal: paypalDep });
    check(`${s.name}: decision ${s.decision}`, r.body.decision === s.decision, `-> ${r.body.decision}: ${r.body.reason}`);
    check(`${s.name}: PayPal orders created = ${s.orders}`, calls.length === s.orders);
    if (s.orders === 1) {
      check(`${s.name}: amount sent = live price`, Number(calls[0].amount) === r.body.live_checkout_price,
        `(${calls[0].amount})`);
    }
  }
  storefront.setAttackMode({ drift: false });

  check('Hash chain verifies', verifyChain().ok === true);
  tamperRow(1, 1);
  const v = verifyChain();
  check('Tamper detected', v.ok === false && v.brokenAt === 1, `-> ${v.reason}`);

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASHED:', e); process.exit(1); });