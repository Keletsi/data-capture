import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.SALON_CARDS_API || 'http://localhost:5194';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5195,
    proxy: {
      '/api': API,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
