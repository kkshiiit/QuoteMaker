import { expect, type Page } from '@playwright/test';

export async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('quotemaker');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
  await bottom.getByRole('link', { name: 'Más' }).click();
  await page.getByRole('main').getByRole('link', { name: label, exact: true }).click();
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'scroll horizontal accidental').toBeLessThanOrEqual(1);
}
