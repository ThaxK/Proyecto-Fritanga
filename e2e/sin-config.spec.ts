import { expect, test } from '@playwright/test'

/**
 * El caso que reportó el usuario: sin `.env.local` la app se quedaba con la
 * ruedita girando para siempre.
 *
 * El servidor de este proyecto arranca con las variables de Supabase en blanco
 * (ver playwright.config.ts), sin tocar tu `.env.local`.
 *
 * Desde que la app no fuerza la apertura de turno, sin turno abierto entra a
 * Reportes. Lo que importa acá es que no haya spinner y que el aviso se vea.
 */
test('sin configuración no queda girando y explica qué falta', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/Sin conexión a Supabase/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /Reportes/ })).toBeVisible()
  await expect(page.locator('.animate-spin')).toHaveCount(0)
})
