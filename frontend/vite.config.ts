import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/demo': 'http://localhost:8000',
      '/webhook': 'http://localhost:8000',
      '/incidents': 'http://localhost:8000',
      '/health-score': 'http://localhost:8000',
      '/proactive-prs': 'http://localhost:8000',
      '/logs': 'http://localhost:8000',
      '/api/repos': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    }
  }
})
