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
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
