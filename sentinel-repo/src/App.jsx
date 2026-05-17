import React, { useState } from 'react'

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  logo: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#00ff88',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: '0.25rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#f0f4f8',
  },
  card: {
    background: '#1e2130',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #2a2f45',
  },
  productRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  productBadge: {
    fontSize: '0.7rem',
    background: '#00ff8820',
    color: '#00ff88',
    border: '1px solid #00ff8840',
    borderRadius: '4px',
    padding: '2px 8px',
    marginTop: '4px',
    display: 'inline-block',
  },
  price: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#00ff88',
  },
  divider: {
    height: '1px',
    background: '#2a2f45',
    margin: '1rem 0',
  },
  orderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    color: '#8892a4',
    marginBottom: '0.4rem',
  },
  orderTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 700,
    fontSize: '1rem',
    color: '#e2e8f0',
    marginTop: '0.5rem',
  },
  sectionLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#8892a4',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0.75rem',
  },
  formGroup: {
    marginBottom: '0.875rem',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#8892a4',
    marginBottom: '0.3rem',
  },
  input: {
    width: '100%',
    background: '#0f1117',
    border: '1px solid #2a2f45',
    borderRadius: '8px',
    padding: '0.65rem 0.875rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  button: {
    width: '100%',
    background: '#00ff88',
    color: '#0f1117',
    border: 'none',
    borderRadius: '8px',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s, transform 0.1s',
    letterSpacing: '0.02em',
  },
  buttonLoading: {
    width: '100%',
    background: '#00ff8866',
    color: '#0f1117',
    border: 'none',
    borderRadius: '8px',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'not-allowed',
    letterSpacing: '0.02em',
  },
  alertSuccess: {
    background: '#00ff8815',
    border: '1px solid #00ff8840',
    borderRadius: '8px',
    padding: '0.875rem 1rem',
    color: '#00ff88',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  alertError: {
    background: '#ff445515',
    border: '1px solid #ff445540',
    borderRadius: '8px',
    padding: '0.875rem 1rem',
    color: '#ff4455',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  alertIcon: {
    fontSize: '1rem',
    flexShrink: 0,
    marginTop: '1px',
  },
  alertText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  alertTitle: {
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  alertDetail: {
    fontSize: '0.82rem',
    opacity: 0.85,
  },
  secureNote: {
    textAlign: 'center',
    fontSize: '0.75rem',
    color: '#4a5568',
    marginTop: '0.25rem',
  },
}

export default function App() {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { type: 'success' | 'error', message: string, detail?: string }

  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
    return digits
  }

  const handlePay = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 9999,
          currency: 'USD',
          card: {
            number: cardNumber.replace(/\s/g, ''),
            expiry,
            cvv,
          },
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          type: 'success',
          message: 'Payment successful!',
          detail: `Order ID: ${data.order_id}`,
        })
      } else {
        // This is the bug surface: the API returns a 500 with no useful code
        // because payment.js reads err.code (undefined) instead of err.error_code
        setResult({
          type: 'error',
          message: data.error || 'Payment failed',
          detail: data.message || `HTTP ${response.status}`,
        })
      }
    } catch (networkErr) {
      setResult({
        type: 'error',
        message: 'Network error',
        detail: networkErr.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>SentinelStore</div>
        <div style={styles.title}>Secure Checkout</div>
      </div>

      {/* Order Summary */}
      <div style={styles.card}>
        <div style={styles.sectionLabel}>Order Summary</div>
        <div style={styles.productRow}>
          <div>
            <div style={styles.productName}>Premium Widget</div>
            <span style={styles.productBadge}>In Stock</span>
          </div>
          <div style={styles.price}>$99.99</div>
        </div>
        <div style={styles.divider} />
        <div style={styles.orderRow}>
          <span>Subtotal</span>
          <span>$99.99</span>
        </div>
        <div style={styles.orderRow}>
          <span>Shipping</span>
          <span style={{ color: '#00ff88' }}>Free</span>
        </div>
        <div style={styles.orderRow}>
          <span>Tax</span>
          <span>$0.00</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.orderTotal}>
          <span>Total</span>
          <span>$99.99</span>
        </div>
      </div>

      {/* Payment Form */}
      <div style={styles.card}>
        <div style={styles.sectionLabel}>Payment Details</div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Card Number</label>
          <input
            style={styles.input}
            type="text"
            placeholder="4111 1111 1111 1111"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            maxLength={19}
            autoComplete="cc-number"
          />
        </div>

        <div style={styles.inputRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Expiry Date</label>
            <input
              style={styles.input}
              type="text"
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              maxLength={5}
              autoComplete="cc-exp"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>CVV</label>
            <input
              style={styles.input}
              type="text"
              placeholder="123"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              autoComplete="cc-csc"
            />
          </div>
        </div>

        {/* Status alerts */}
        {result && result.type === 'success' && (
          <div style={{ ...styles.alertSuccess, marginBottom: '1rem' }}>
            <span style={styles.alertIcon}>&#10003;</span>
            <div style={styles.alertText}>
              <span style={styles.alertTitle}>{result.message}</span>
              {result.detail && <span style={styles.alertDetail}>{result.detail}</span>}
            </div>
          </div>
        )}
        {result && result.type === 'error' && (
          <div style={{ ...styles.alertError, marginBottom: '1rem' }}>
            <span style={styles.alertIcon}>&#9888;</span>
            <div style={styles.alertText}>
              <span style={styles.alertTitle}>{result.message}</span>
              {result.detail && <span style={styles.alertDetail}>{result.detail}</span>}
            </div>
          </div>
        )}

        <button
          id="pay-now-btn"
          style={loading ? styles.buttonLoading : styles.button}
          onClick={handlePay}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Pay Now'}
        </button>

        <div style={styles.secureNote}>
          Secured by 256-bit TLS encryption
        </div>
      </div>
    </div>
  )
}
