# SentinelStore Checkout — Demo App

This is a demo React + Node.js checkout application used to showcase **RuntimeGuard AI** bug detection and auto-fix capabilities.

## Intentional Bugs

### Bug 1 — SDK Version Mismatch (payment.js)

`backend/payment.js` reads `err.code` to identify payment failure reasons.
`backend/fakePaymentSdk.js` (v3) throws errors using `err.error_code` (not `err.code`).

**Result:** Every call to `POST /api/payment/create-order` returns HTTP 500 with a confusing `payment_failed` error instead of a meaningful `payment_declined` (400) response. The `code` field in the response is always `undefined`.

**Fix:** Change `err.code` to `err.error_code` (or use `err.code || err.error_code`) in `backend/payment.js`.

### Bug 2 — Missing Runtime Config

`PAYMENT_PROVIDER_KEY` is not set in `.env` (intentional config drift). The SDK detects this and throws `MISSING_API_KEY`, compounding Bug 1.

## Project Structure

```
sentinel-repo/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── src/
│   ├── main.jsx
│   ├── App.jsx          # Checkout UI — Pay Now button triggers the bug
│   └── index.css
├── backend/
│   ├── server.js        # Express API server (port 3001)
│   ├── payment.js       # BUG: reads err.code instead of err.error_code
│   └── fakePaymentSdk.js # SDK v3 — uses err.error_code
└── tests/
    └── payment-sdk-compat.test.js
```

## Running the App

```bash
# Install dependencies
npm install

# Start the backend API (terminal 1)
npm run api

# Start the frontend dev server (terminal 2)
npm run dev
```

Then open http://localhost:5173, fill in any card details, and click **Pay Now**. You will see a 500 error — this is the bug RuntimeGuard will detect and fix.

## Running Tests

```bash
npm test
```

The first test (`SDK v3 error uses error_code not code`) will pass, confirming the SDK uses the new shape. After RuntimeGuard applies its fix, the integration behavior will also be corrected.
