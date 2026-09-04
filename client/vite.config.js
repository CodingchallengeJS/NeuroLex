import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react';
import path from "path";

// Backend to proxy /api to during `npm run dev`.
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000';

// Extra hostnames Vite will accept in dev (Tailscale, LAN name, ngrok, ...).
// Set VITE_ALLOWED_HOSTS=host1,host2 in client/.env instead of hard-coding.
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts,
    // The client calls a relative /api, matching how it is served in production.
    // In dev, Vite forwards those calls to the backend.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
    },
  },
});
