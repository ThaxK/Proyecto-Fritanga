import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * La migración corre una sola vez, sobre datos que ya existen. Ninguna otra
 * prueba ejercita ese camino, así que acá se simula el estado previo (sin la
 * columna numero), se aplica el archivo de migración y se verifica el resultado.
 */
describe('migracion_cuentas.sql sobre una base ya existente', () => {
  let bd: BaseDeDatosDePrueba

  const sql = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) => bd.cliente.query<T>(text, params)

  const aplicarMigracion = () =>
    sql(readFileSync(join(RAIZ, 'bd', 'migracion_cuentas.sql'), 'utf8'))

  /** Deshace lo que la migración agrega, para volver al estado de producción actual. */
  const volverAlEstadoPrevio = () =>
    sql(`
      drop index if exists ux_cuenta_turno_numero;
      drop index if exists ux_cuenta_client_tx;
      alter table cuenta drop column if exists numero;
      alter table cuenta drop column if exists client_tx_id;
    `)

  const abrirTurno = async () =>
    (await sql(`insert into turno (base_inicial_cop) values (70000) returning id`)).rows[0].id

  beforeAll(async () => {
    bd = await levantarBaseDeDatos()
    await volverAlEstadoPrevio()
  }, 180_000)

  afterAll(async () => {
    await bd?.detener()
  })

  beforeEach(async () => {
    await sql(`
      truncate table cuenta, venta, detalle_venta, movimiento_caja,
                     reconciliacion, conteo_inicial, turno
      restart identity cascade
    `)
    await volverAlEstadoPrevio()
  })

  it('numera por turno y en orden de creación, no por etiqueta', async () => {
    const turnoViejo = (
      await sql(`
        insert into turno (estado, abierto_el, cerrado_el, base_inicial_cop)
        values ('cerrado', now() - interval '2 days', now() - interval '1 day', 70000)
        returning id`)
    ).rows[0].id
    const turnoActual = await abrirTurno()

    await sql(
      `insert into cuenta (turno_id, etiqueta, creada_el) values
         ($1, 'Mesa A', now() - interval '3 hours'),
         ($1, 'Mesa B', now() - interval '2 hours')`,
      [turnoViejo],
    )
    // Creadas en un orden distinto al de la etiqueta a propósito
    await sql(
      `insert into cuenta (turno_id, etiqueta, creada_el) values
         ($1, 'Cuenta 1', now() - interval '90 minutes'),
         ($1, 'Cuenta 3', now() - interval '60 minutes'),
         ($1, 'Cuenta 2', now() - interval '30 minutes')`,
      [turnoActual],
    )

    await aplicarMigracion()

    const { rows } = await sql(
      'select turno_id, etiqueta, numero from cuenta order by turno_id, numero',
    )

    expect(rows).toEqual([
      { turno_id: turnoViejo, etiqueta: 'Mesa A', numero: 1 },
      { turno_id: turnoViejo, etiqueta: 'Mesa B', numero: 2 },
      { turno_id: turnoActual, etiqueta: 'Cuenta 1', numero: 1 },
      { turno_id: turnoActual, etiqueta: 'Cuenta 3', numero: 2 },
      { turno_id: turnoActual, etiqueta: 'Cuenta 2', numero: 3 },
    ])
  })

  // El caso real: la base ya quedó colisionada (la "Cuenta 2" se eliminó y
  // quedaron abiertas "Cuenta 1" y "Cuenta 3"). El backfill numera 1 y 2, así
  // que el próximo número libre es el 3, pero esa etiqueta está tomada.
  it('sobre una base ya colisionada, la próxima cuenta automática no reusa un nombre abierto', async () => {
    const turno = await abrirTurno()
    await sql(
      `insert into cuenta (turno_id, etiqueta, creada_el) values
         ($1, 'Cuenta 1', now() - interval '2 hours'),
         ($1, 'Cuenta 3', now() - interval '1 hour')`,
      [turno],
    )

    await aplicarMigracion()

    const nueva = (await sql('select fn_crear_cuenta_automatica() as id')).rows[0].id
    const { rows } = await sql('select id, etiqueta, numero from cuenta order by numero')

    expect(rows.map((f) => f.etiqueta)).toEqual(['Cuenta 1', 'Cuenta 3', 'Cuenta 4'])
    // El número también salta al 4: el 3 estaba libre como número, pero se
    // avanza igual para no repetir la etiqueta "Cuenta 3" que ya está abierta.
    expect(rows.find((f) => f.id === nueva)).toMatchObject({ etiqueta: 'Cuenta 4', numero: 4 })
  })

  it('crea los índices de unicidad', async () => {
    await aplicarMigracion()

    const { rows } = await sql(`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('ux_cuenta_turno_numero', 'ux_cuenta_client_tx')
      order by indexname
    `)

    expect(rows.map((f) => f.indexname)).toEqual([
      'ux_cuenta_client_tx',
      'ux_cuenta_turno_numero',
    ])
  })

  it('se puede re-ejecutar sin dañar los datos', async () => {
    const turno = await abrirTurno()
    await sql(
      `insert into cuenta (turno_id, etiqueta, creada_el) values
         ($1, 'Cuenta 1', now() - interval '2 hours'),
         ($1, 'Cuenta 3', now() - interval '1 hour')`,
      [turno],
    )

    await aplicarMigracion()
    await aplicarMigracion()

    const { rows } = await sql('select etiqueta, numero from cuenta order by numero')
    expect(rows).toEqual([
      { etiqueta: 'Cuenta 1', numero: 1 },
      { etiqueta: 'Cuenta 3', numero: 2 },
    ])
  })
})
