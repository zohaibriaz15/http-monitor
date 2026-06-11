/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Slate-based dark theme with semantic accents.
        ok: '#3fb950',
        fail: '#f85149',
        accent: '#4f9cf9',
      },
      keyframes: {
        // Brief highlight on a row when a new result streams in.
        flash: {
          '0%': { backgroundColor: 'rgba(79,156,249,0.30)' },
          '100%': { backgroundColor: 'transparent' },
        },
        pulse: {
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        flash: 'flash 1.6s ease-out',
        'pulse-slow': 'pulse 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
