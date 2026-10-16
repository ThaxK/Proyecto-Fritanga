import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { fingirSupabase } from './apoyo/supabase-falso.ts'

const CUENTAS = [
  { id: 7, etiqueta: 'Cuenta 1', creada_el: '2026-10-16T15:00:00Z' },
  { id: 8, etiqueta: 'Cuenta 2', creada_el: '2026-10-16T15:05:00Z' },
]

async function irACuentas(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '🧾 Cuentas' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Cuentas abiertas/ })).toBeVisible()
}

/** Archivos que definen el esquema, en el orden en que los aplica la base. */
const ARCHIVOS_SQL = [
  'schema.sql',
  'migracion_imagenes.sql',
  'migracion_cuenta_vacia.sql',
  'migracion_cuentas.sql',
  'migracion_precio_positivo.sql',
]

function leerSqlDeLaBase(): string {
  return ARCHIVOS_SQL.map((archivo) => readFileSync(join(process.cwd(), 'bd', archivo), 'utf8')).join(
    '\n',
  )
}

/**
 * Parámetros de la ÚLTIMA definición de la función: las migraciones usan
 * `create or replace`, así que la que gana es la que aparece más abajo.
 */
function parametrosDeLaFuncion(sql: string, nombre: string): string[] {
  const definiciones = [
    ...sql.matchAll(new RegExp(`function\\s+${nombre}\\s*\\(([^)]*)\\)`, 'gi')),
  ]
  if (definiciones.length === 0) throw new Error(`No encontré la función ${nombre} en bd/`)
  const ultima = definiciones[definiciones.length - 1][1]
  return [...ultima.matchAll(/\b(p_[a-z_]+)\b/g)].map((coincidencia) => coincidencia[1])
}

test('la cuenta con ítems se cobra y la vacía se elimina', async ({ page }) => {
  await fingirSupabase(page, {
    turnoAbierto: true,
    cuentas: CUENTAS,
    // Una fila de venta por cada número: la 7 tiene dos ítems, la 8 ninguno.
    totalesPorCuenta: { 7: [2000, 2500], 8: [] },
  })

  await irACuentas(page)

  await expect(page.getByText('Cuentas abiertas (2)')).toBeVisible()

  const conItems = page.locator('li', { hasText: 'Cuenta 1' })
  const vacia = page.locator('li', { hasText: 'Cuenta 2' })

  await expect(conItems.getByText('$4.500', { exact: true })).toBeVisible()
  await expect(conItems.getByRole('button', { name: 'Cobrar ($4.500)' })).toBeVisible()
  // El caso que trababa el cierre: una cuenta sin ítems no se puede cobrar.
  await expect(conItems.getByRole('button', { name: /Eliminar/ })).toHaveCount(0)

  await expect(vacia.getByText('$0', { exact: true })).toBeVisible()
  await expect(vacia.getByRole('button', { name: '✕ Eliminar' })).toBeVisible()
  await expect(vacia.getByRole('button', { name: /Cobrar/ })).toHaveCount(0)
})

test('nueva cuenta le manda a la base el uuid de idempotencia y el operador', async ({ page }) => {
  const { rpcRecibidas } = await fingirSupabase(page, {
    turnoAbierto: true,
    cuentas: [],
    rpc: { fn_crear_cuenta_automatica: { id: 9 } },
  })

  await irACuentas(page)
  await page.getByRole('button', { name: '+ Nueva cuenta' }).click()

  await expect.poll(() => rpcRecibidas.length).toBe(1)
  const [peticion] = rpcRecibidas
  expect(peticion.nombre).toBe('fn_crear_cuenta_automatica')
  expect(peticion.cuerpo.p_client_tx_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(peticion.cuerpo.p_operador).toBe('')

  // Los nombres que manda el front tienen que existir en la firma SQL. Si
  // alguien renombra un parámetro de un solo lado, esto se cae.
  const parametros = parametrosDeLaFuncion(leerSqlDeLaBase(), peticion.nombre)
  expect(parametros).toEqual(expect.arrayContaining(Object.keys(peticion.cuerpo)))
})
