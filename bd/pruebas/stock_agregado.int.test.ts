import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

/**
 * stock_agregado: los reabastecimientos ya no acumulan sobre conteo_inicial,
 * sino que se registran en su propia tabla. Esto permite reconstruir
 * cuánto había realmente al abrir el turno.
 */
describe('stock agregado (reabastecimiento)', () => {
  let bd: BaseDeDatosDePrueba

  const sql = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) => bd.cliente.query<T>(text, params)

  const crearProducto = async (nombre: string, precioCop: number) =>
    (
      await sql(`insert into producto (nombre, precio_cop, orden) values ($1, $2, 900) returning id`, [
        nombre,
        precioCop,
      ])
    ).rows[0].id

  const abrirTurno = async () =>
    (await sql(`insert into turno (base_inicial_cop) values (70000) returning id`)).rows[0].id

  const abrirTurnoConConteo = async (productoId: number, cantidad: number) => {
    const turno = await abrirTurno()
    await sql(
      `insert into conteo_inicial (turno_id, producto_id, cantidad) values ($1, $2, $3)`,
      [turno, productoId, cantidad],
    )
    return turno
  }

  beforeAll(async () => {
    bd = await levantarBaseDeDatos()
  }, 180_000)

  afterAll(async () => {
    await bd?.detener()
  })

  beforeEach(async () => {
    await sql(`
      truncate table detalle_venta, venta, cuenta, conteo_inicial,
                     reconciliacion, movimiento_caja, turno, stock_agregado
      restart identity cascade
    `)
    await sql(`delete from producto where nombre like 'TEST %'`)
  })

  it('agregar stock registra en stock_agregado y no toca conteo_inicial', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    const turnoId = await abrirTurnoConConteo(productoId, 10)

    await sql(
      `select fn_agregar_stock($1, 5, 'operador1')`,
      [productoId],
    )

    // conteo_inicial sigue en 10
    const conteo = await sql(
      'select cantidad from conteo_inicial where turno_id = $1 and producto_id = $2',
      [turnoId, productoId],
    )
    expect(conteo.rows[0].cantidad).toBe(10)

    // stock_agregado tiene los 5 agregados
    const agregado = await sql(
      'select cantidad from stock_agregado where turno_id = $1 and producto_id = $2',
      [turnoId, productoId],
    )
    expect(agregado.rows[0].cantidad).toBe(5)
  })

  it('nuevo_total = conteo_inicial + agregado', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    await abrirTurnoConConteo(productoId, 10)

    const { rows } = await sql<{ nuevo_total: number }>(
      `select (fn_agregar_stock($1, 5, 'op')->>'nuevo_total')::int as nuevo_total`,
      [productoId],
    )
    expect(rows[0].nuevo_total).toBe(15)

    // segundo agregado
    const { rows: rows2 } = await sql<{ nuevo_total: number }>(
      `select (fn_agregar_stock($1, 3, 'op')->>'nuevo_total')::int as nuevo_total`,
      [productoId],
    )
    expect(rows2[0].nuevo_total).toBe(18) // 10 + 5 + 3
  })

  it('no permite agregar stock sin turno abierto', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    // no hay turno abierto
    await expect(
      sql(`select fn_agregar_stock($1, 5)` as any, [productoId]),
    ).rejects.toThrow(/TURNO_CERRADO/)
  })

  it('no permite agregar stock a producto inexistente', async () => {
    await abrirTurno()
    await expect(
      sql(`select fn_agregar_stock($1, 5)` as any, [999999]),
    ).rejects.toThrow(/PRODUCTO_NO_EXISTE/)
  })

  it('no permite cantidad <= 0', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    await abrirTurno()
    await expect(
      sql(`select fn_agregar_stock($1, 0)` as any, [productoId]),
    ).rejects.toThrow(/CANTIDAD_INVALIDA/)
    await expect(
      sql(`select fn_agregar_stock($1, -5)` as any, [productoId]),
    ).rejects.toThrow(/CANTIDAD_INVALIDA/)
  })

  it('fn_cerrar_turno calcula teorico contando el stock agregado', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    const turnoId = await abrirTurnoConConteo(productoId, 10)

    // agregar 5 de stock
    await sql(`select fn_agregar_stock($1, 5)`, [productoId])

    // vender 3 (total 6000)
    await sql(
      `select fn_registrar_venta($1::jsonb, 6000, gen_random_uuid(), null)`,
      [JSON.stringify([{ producto_id: productoId, cantidad: 3 }])],
    )

    // conteo físico: inicial 10 + agregado 5 - vendidos 3 = 12 teorico, fisico 12 => merma 0
    await sql(
      `select fn_cerrar_turno($1::jsonb, 12000, '')`,
      [JSON.stringify([{ producto_id: productoId, cantidad: 12 }])],
    )

    // verificar directamente en reconciliacion
    const recon = await sql(
      'select teorico, fisico, diferencia from reconciliacion where turno_id = $1',
      [turnoId],
    )
    expect(recon.rows.length).toBe(1)
    expect(recon.rows[0].teorico).toBe(12) // 10 + 5 - 3
    expect(recon.rows[0].fisico).toBe(12)
    expect(recon.rows[0].diferencia).toBe(0)
  })

  it('teorico es correcto sin reabastecimiento', async () => {
    const productoId = await crearProducto('TEST Empanada', 2000)
    const turnoId = await abrirTurnoConConteo(productoId, 10)

    await sql(
      `select fn_registrar_venta($1::jsonb, 6000, gen_random_uuid(), null)`,
      [JSON.stringify([{ producto_id: productoId, cantidad: 3 }])],
    )

    await sql(
      `select fn_cerrar_turno($1::jsonb, 7000, '')`,
      [JSON.stringify([{ producto_id: productoId, cantidad: 7 }])],
    )

    const recon = await sql(
      'select teorico, fisico, diferencia from reconciliacion where turno_id = $1',
      [turnoId],
    )
    expect(recon.rows.length).toBe(1)
    expect(recon.rows[0].teorico).toBe(7) // 10 - 3
    expect(recon.rows[0].fisico).toBe(7)
    expect(recon.rows[0].diferencia).toBe(0)
  })
})
