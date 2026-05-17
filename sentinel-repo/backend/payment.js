import { PaymentClient } from './fakePaymentSdk.js'

// BUG: reads err.code but SDK v3 changed to err.error_code
// This is the intentional bug RuntimeGuard should detect
const client = new PaymentClient(process.env.PAYMENT_PROVIDER_KEY)

export async function createOrder(req, res) {
  const { amount = 9999, currency = 'USD', card } = req.body

  try {
    const result = await client.createOrder(amount, currency, card)
    res.json({ success: true, order_id: result.order_id })
  } catch (err) {
    // BUG ON NEXT LINE: err.code is undefined in SDK v3 (should be err.error_code)
    const errorCode = err.code  // undefined! SDK v3 uses err.error_code

    // This crashes with "Cannot read properties of undefined" because
    // errorCode is undefined and we try to use it
    if (errorCode === undefined) {
      // This path hits and sends a confusing 500
      return res.status(500).json({
        error: 'payment_failed',
        code: errorCode,  // undefined
        message: err.message
      })
    }

    res.status(400).json({
      error: 'payment_declined',
      code: errorCode,
      message: err.message
    })
  }
}
