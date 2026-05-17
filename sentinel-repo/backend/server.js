import express from 'express'
import cors from 'cors'
import { createOrder } from './payment.js'

const app = express()
app.use(cors())
app.use(express.json())

// Routes
app.post('/api/payment/create-order', createOrder)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'sentinel-demo-backend', version: '3.0.0' })
})

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Sentinel demo backend running on port ${PORT}`)
  console.log(`Payment API: POST http://localhost:${PORT}/api/payment/create-order`)
})
