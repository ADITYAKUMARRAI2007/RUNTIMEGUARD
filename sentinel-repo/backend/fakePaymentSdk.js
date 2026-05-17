// Fake Payment SDK v3 - INTENTIONALLY CHANGED error shape from v2
// v2 used: { code: 'CARD_DECLINED', message: '...' }
// v3 now uses: { error_code: 'CARD_DECLINED', error_message: '...', version: 3 }

export class PaymentClient {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.version = 3
  }

  async createOrder(amount, currency, cardDetails) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200))

    // Validate API key
    if (!this.apiKey) {
      const err = new Error('Payment provider API key missing')
      err.error_code = 'MISSING_API_KEY'    // v3 shape
      err.error_message = 'API key not configured'
      err.version = 3
      throw err
    }

    // Simulate card processing - for demo always return an error
    // to demonstrate the bug
    const err = new Error('Payment processing failed')
    err.error_code = 'INSUFFICIENT_FUNDS'   // v3 shape (was err.code in v2)
    err.error_message = 'Card has insufficient funds'
    err.version = 3
    throw err
  }
}
