import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      }
    }
  },
  optimizeDeps: {
    include: ['three', 'gif.js']
  },
  // This ensures files in the public directory are served as-is
  publicDir: 'public'
});