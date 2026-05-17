/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070a0f',
        surface: '#0d1117',
        surface2: '#161b22',
        border: '#21262d',
        border2: '#30363d',
        text: '#e6edf3',
        muted: '#8b949e',
        dim: '#484f58',
        accent: '#00ff88',
        accent2: '#0ea5e9',
        accent3: '#f59e0b',
        red: '#f85149',
        purple: '#a78bfa',
      },
      fontFamily: {
        mono: ['Space Mono', 'monospace'],
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
