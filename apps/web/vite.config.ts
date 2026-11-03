import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5180),
    strictPort: true,
    // Same-origin API: the session cookie stays SameSite=Strict and no CORS is needed in dev.
    proxy: { '/api': { target: process.env.API_TARGET ?? 'http://localhost:5001', changeOrigin: false } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
