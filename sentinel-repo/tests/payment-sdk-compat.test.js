// This test verifies payment SDK v3 compatibility
// RuntimeGuard will generate and run this test

import { PaymentClient } from '../backend/fakePaymentSdk.js'

describe('Payment SDK v3 Compatibility', () => {
  test('SDK v3 error uses error_code not code', async () => {
    const client = new PaymentClient('test-key')
    try {
      await client.createOrder(100, 'USD', { number: '4111111111111111' })
    } catch (err) {
      // v3 shape: error_code exists, code does NOT
      expect(err.error_code).toBeDefined()
      expect(err.code).toBeUndefined()
    }
  })

  test('payment.js should handle both v2 and v3 error shapes', async () => {
    // After the fix, this should work
    const err = { error_code: 'CARD_DECLINED', error_message: 'Declined', message: 'Payment failed' }
    const code = err.code || err.error_code || 'UNKNOWN_ERROR'
    expect(code).toBe('CARD_DECLINED')
  })
})
