import { expect, test } from '@playwright/test'

/**
 * El caso que reportó el usuario: sin `.env.local` la app se quedaba con la
 * ruedita girando para siempre.
 *
 * El servidor de este proyecto arranca con las variables de Supabase en blanco
 * (ver playwright.config.ts), sin tocar tu `.env.local`.
 */
test('sin configuración no queda girando y explica qué falta', async ({ page }) => {
  await page.goto('/')

  // Antes del arreglo esta pantalla no aparecía nunca: `cargando` arrancaba en
  // true y el early return de AperturaTurno no llegaba a apagarlo.
  await expect(page.getByRole('heading', { name: /Apertura de turno/ })).toBeVisible()
  await expect(page.getByText(/Sin conexión a Supabase/)).toBeVisible()
  await expect(page.locator('.animate-spin')).toHaveCount(0)
})
