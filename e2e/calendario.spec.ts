import { expect, test } from '@playwright/test'
import { fingirSupabase } from './apoyo/supabase-falso.ts'

/**
 * El calendario de Reportes e Historial marca los días con ventas y muestra
 * el monto abreviado, para no tener que recorrer día por día.
 */
const VENTAS = [
  {
    id: 1,
    creada_el: '2026-10-25T15:00:00.000Z',
    total_cop: 45000,
    tipo: 'mostrador',
    cuenta_id: null,
  },
  {
    id: 2,
    creada_el: '2026-10-26T15:00:00.000Z',
    total_cop: 12000,
    tipo: 'mostrador',
    cuenta_id: null,
  },
]

test('Reportes: el calendario muestra el monto de los días con ventas', async ({ page }) => {
  await fingirSupabase(page, { turnoAbierto: true, ventas: VENTAS })

  await page.goto('/')
  await page.getByRole('button', { name: /Reportes/ }).click()
  await page.getByRole('button', { name: 'Elegir fecha' }).click()

  // Día 25 con $45.000 y día 26 con $12.000
  await expect(page.getByText('$45k')).toBeVisible()
  await expect(page.getByText('$12k')).toBeVisible()

  // Al hacer clic en el día 25, el reporte se actualiza a esa fecha
  await page.locator('button', { hasText: '$45k' }).click()
  await expect(
    page.getByRole('heading', { name: /Resumen del día.*25 de octubre/ }),
  ).toBeVisible()
})

test('Historial: el calendario muestra el monto de los días con ventas', async ({ page }) => {
  await fingirSupabase(page, { turnoAbierto: true, ventas: VENTAS })

  await page.goto('/')
  await page.getByRole('button', { name: /Historial/ }).click()
  await page.getByRole('button', { name: 'Elegir fecha' }).click()

  await expect(page.getByText('$45k')).toBeVisible()
})
