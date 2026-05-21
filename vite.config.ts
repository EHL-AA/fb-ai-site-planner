import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Project lives on the Windows filesystem (/mnt/c) under WSL2, where
        // native file events don't cross the boundary reliably. Poll so HMR
        // actually picks up edits instead of silently going stale.
        watch: { usePolling: true, interval: 300 },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Google Maps Platform key (Places New, Maps JS, Geocoding, 3D tiles).
        // Set MAPS_API_KEY in .env to use your own billed key.
        'process.env.MAPS_API_KEY': JSON.stringify(env.MAPS_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
