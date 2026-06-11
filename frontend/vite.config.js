import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `host: true` exposes the dev server on the LAN so the dashboard can be opened
// from a phone to verify responsiveness on a real device.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the charting library into its own chunk so it's cached
        // separately and doesn't bloat the main app bundle.
        manualChunks: { recharts: ['recharts'] },
      },
    },
  },
});
