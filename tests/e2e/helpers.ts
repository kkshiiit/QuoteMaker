import { expect, type Page } from '@playwright/test';

/**
 * Playwright crea un contexto nuevo (almacenamiento vacío, sin service worker) para cada prueba,
 * así que no hace falta borrar IndexedDB: borrarlo con la app abierta queda «bloqueado» y se
 * ejecuta más tarde, en medio de la prueba (fuente de fallos intermitentes según el navegador).
 */
export async function fresh(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await skipWelcome(page);
}

/** Primera apertura: pasa la presentación de bienvenida («Comenzar»). */
export async function skipWelcome(page: Page) {
  const start = page.getByRole('button', { name: 'Comenzar' });
  await expect(start).toBeVisible();
  await start.click();
  await expect(start).toHaveCount(0);
}

export async function loadDemo(page: Page) {
  await fresh(page);
  await page.getByRole('button', { name: 'Probar con datos de ejemplo' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Taller Aurora' })).toBeVisible({ timeout: 20_000 });
  // La carga termina cuando se crea el último presupuesto: ahí desaparece «Primeros pasos».
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toHaveCount(0, { timeout: 20_000 });
}

/** Navega usando la UI real: sidebar en escritorio, barra inferior / "Más" en móvil. */
export async function nav(page: Page, label: string) {
  const sidebar = page.locator('nav.sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('link', { name: label, exact: true }).click();
    return;
  }
  const bottom = page.locator('nav.bottom-nav');
  const direct = bottom.getByRole('link', { name: label, exact: true });
  if (await direct.count()) {
    await direct.click();
    return;
  }
  await bottom.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('dialog', { name: 'Menú' }).getByRole('link', { name: label, exact: true }).click();
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'scroll horizontal accidental').toBeLessThanOrEqual(1);
}
