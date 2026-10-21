import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': r('./shared'), '@': r('./src') } },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      '/media': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
  // bundlerTimings: rolldown's "[PLUGIN_TIMINGS]" note on cold builds (vite:css's share of a 3 s build); informational, not a defect
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500, rolldownOptions: { checks: { bundlerTimings: false } } },
});
