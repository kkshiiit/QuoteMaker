import { defineConfig, devices } from '@playwright/test';

// Pruebas e2e sobre el build de producción (npm run build) servido con `vite preview`.
// Sólo Chromium está disponible en este entorno; Firefox/WebKit se documentan como pendientes.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', acceptDownloads: true },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
