/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Content-Security-Policy sólo en el build de producción (el servidor de desarrollo inyecta
 * scripts inline de HMR). Los scripts inline propios se permiten por hash, no con 'unsafe-inline'.
 * connect-src limita la red a la propia app y a Supabase: un script inyectado no podría enviar
 * datos a otro servidor.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'qm-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`,
        );
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    contentSecurityPolicy(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'QuoteMaker',
        short_name: 'QuoteMaker',
        description: 'Costos reales, precios y presupuestos privados para emprendedores.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f5f1',
        theme_color: '#14532d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Dependencias opcionales de jsPDF que QuoteMaker no usa (html(), SVG, sanitizado HTML)
        globIgnores: ['**/html2canvas*.js', '**/purify*.js', '**/index.es-*.js'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['dexie', 'big.js'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts', 'tests/live/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/privacy/**', 'src/sync/**', 'src/data/**'] },
  },
});
