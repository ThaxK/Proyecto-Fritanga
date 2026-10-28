import { expect, test } from '@playwright/test'
import { fingirSupabase } from './apoyo/supabase-falso.ts'

/**
 * Verifica que la pantalla de apertura consuma de verdad lo que devuelve la
 * base: si el nombre de la tabla o de las columnas cambiara, esto se cae.
 *
 * Sin turno abierto la app entra a Reportes; para ver la apertura hay que
 * navegar al botón "Turno" de la barra superior.
 */
test('la apertura de turno lista el catálogo que devuelve la base', async ({ page }) => {
  await fingirSupabase(page, {
    productos: [
      { id: 1, nombre: 'Empanadas', precio_cop: 2000, orden: 1, activo: true },
      { id: 2, nombre: 'Gaseosa', precio_cop: 3000, orden: 2, activo: true },
    ],
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Turno/ }).click()

  await expect(page.getByText('Empanadas')).toBeVisible()
  await expect(page.getByText('$2.000')).toBeVisible()
  await expect(page.getByText('Gaseosa')).toBeVisible()
  await expect(page.getByText('$3.000')).toBeVisible()
})

test('con el catálogo vacío la pantalla igual resuelve, no queda girando', async ({ page }) => {
  await fingirSupabase(page, { productos: [] })

  await page.goto('/')
  await page.getByRole('button', { name: /Turno/ }).click()

  await expect(page.getByRole('heading', { name: /Apertura de turno/ })).toBeVisible()
  await expect(page.getByText('Empanadas')).toHaveCount(0)
})
