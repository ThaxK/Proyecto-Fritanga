import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * "Nunca existe un producto de $0" dejó de ser una suposición y pasó a ser una
 * regla del esquema. Estas pruebas fijan esa regla, la migración que la aplica
 * sobre una base ya existente, y su consecuencia: una cuenta con ítems y total
 * $0 (que no se puede cobrar ni eliminar) queda fuera de alcance.
 */
describe('precio de producto estrictamente positivo', () => {
  let bd: BaseDeDatosDePrueba

  const sql = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) => bd.cliente.query<T>(text, params)

  const aplicarMigracion = () =>
    sql(readFileSync(join(RAIZ, 'bd', 'migracion_precio_positivo.sql'), 'utf8'))

  /** Devuelve el check al estado viejo (permitía $0), tal como está en producción. */
  const volverAlCheckViejo = () =>
    sql(`
      alter table producto drop constraint if exists producto_precio_cop_check;
      alter table producto add constraint producto_precio_cop_check check (precio_cop >= 0);
    `)

  const checksDeProducto = async () =>
    (
      await sql<{ conname: string; def: string }>(`
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'producto'::regclass and contype = 'c'
      `)
    ).rows

  const abrirTurno = async () =>
    (await sql(`insert into turno (base_inicial_cop) values (70000) returning id`)).rows[0].id

  /**
   * El stock es derivado (conteo_inicial - vendidos), así que sin conteo
   * inicial no se puede vender nada: fn_registrar_venta responde
   * STOCK_INSUFICIENTE.
   */
  const abrirTurnoConStock = async (items: { productoId: string; cantidad: number }[]) => {
    const turno = await abrirTurno()
    for (const item of items) {
      await sql(
        `insert into conteo_inicial (turno_id, producto_id, cantidad) values ($1, $2, $3)`,
        [turno, item.productoId, item.cantidad],
      )
    }
    return turno
  }

  /** Producto de prueba con el precio que se pida (para poder crear uno de $0 antes de migrar). */
  const crearProducto = async (nombre: string, precioCop: number) =>
    (
      await sql(`insert into producto (nombre, precio_cop, orden) values ($1, $2, 900) returning id`, [
        nombre,
        precioCop,
      ])
    ).rows[0].id

  beforeAll(async () => {
    bd = await levantarBaseDeDatos()
  }, 180_000)

  afterAll(async () => {
    await bd?.detener()
  })

  beforeEach(async () => {
    await sql(`
      truncate table detalle_venta, venta, cuenta, conteo_inicial,
                     reconciliacion, movimiento_caja, turno
      restart identity cascade
    `)
    await sql(`delete from producto where nombre like 'TEST %'`)
    // Estado de partida conocido, venga de donde venga la prueba anterior.
    await aplicarMigracion()
  })

  it('deja una sola restricción de precio, y exige que sea mayor a cero', async () => {
    const checks = await checksDeProducto()

    // Una sola: si el nombre del check inline del esquema se separara del que
    // usa la migración, quedarían dos constraints en vez de una.
    expect(checks.map((c) => c.conname)).toEqual(['producto_precio_cop_check'])
    expect(checks[0].def).toBe('CHECK ((precio_cop > 0))')
  })

  it('rechaza un producto de $0', async () => {
    await expect(crearProducto('TEST Gratis', 0)).rejects.toThrow(/producto_precio_cop_check/)
  })

  it('rechaza un precio negativo', async () => {
    await expect(crearProducto('TEST Negativo', -500)).rejects.toThrow(/producto_precio_cop_check/)
  })

  it('acepta el precio más chico posible', async () => {
    const id = await crearProducto('TEST UnPeso', 1)
    expect(Number(id)).toBeGreaterThan(0)
  })

  it('la migración se puede re-ejecutar sin dañar los datos', async () => {
    const id = await crearProducto('TEST Empanada', 2000)

    await aplicarMigracion()
    await aplicarMigracion()

    const { rows } = await sql(`select nombre, precio_cop from producto where id = $1`, [id])
    expect(rows).toEqual([{ nombre: 'TEST Empanada', precio_cop: 2000 }])
    expect((await checksDeProducto())[0].def).toBe('CHECK ((precio_cop > 0))')
  })

  it('sobre una base con un producto en $0, corta y dice CUÁL producto hay que corregir', async () => {
    await volverAlCheckViejo()
    await crearProducto('TEST Gratis', 0)

    // Sin el chequeo previo, el ALTER fallaría con un mensaje que no nombra
    // al producto culpable.
    await expect(aplicarMigracion()).rejects.toThrow(/PRODUCTO_CON_PRECIO_INVALIDO/)
    await expect(aplicarMigracion()).rejects.toThrow(/TEST Gratis/)

    // Y no deja la base a medio migrar.
    expect((await checksDeProducto())[0].def).toBe('CHECK ((precio_cop >= 0))')
  })

  it('avisa de las cuentas que ya nacieron trabadas, aunque ya no quede ningún producto en $0', async () => {
    await volverAlCheckViejo()
    const gratis = await crearProducto('TEST Gratis', 0)
    await abrirTurnoConStock([{ productoId: gratis, cantidad: 5 }])
    const cuenta = (await sql('select fn_crear_cuenta_automatica() as id')).rows[0].id
    await sql(`select fn_registrar_venta($1::jsonb, 0, gen_random_uuid(), $2)`, [
      JSON.stringify([{ producto_id: gratis, cantidad: 1 }]),
      cuenta,
    ])
    // El producto se corrige después: la cuenta queda con su ítem en $0.
    await sql(`update producto set precio_cop = 2000 where id = $1`, [gratis])

    const totalTrabado = (
      await sql(
        `select coalesce(sum(total_cop), 0)::int as total from venta
         where cuenta_id = $1 and tipo = 'cuenta'`,
        [cuenta],
      )
    ).rows[0].total
    expect(totalTrabado).toBe(0)

    const avisos: string[] = []
    const escuchar = (aviso: { message?: string }) => {
      avisos.push(aviso.message ?? '')
    }
    bd.cliente.on('notice', escuchar)
    try {
      await aplicarMigracion()
    } finally {
      bd.cliente.off('notice', escuchar)
    }

    expect(avisos.join('\n')).toMatch(/total \$0/)
    expect(avisos.join('\n')).toContain(String(cuenta))
  })

  it('con el precio en > 0 ya no se puede armar una cuenta de total $0', async () => {
    const empanada = (
      await sql(`select id from producto where nombre = 'Empanadas'`)
    ).rows[0].id
    await abrirTurnoConStock([{ productoId: empanada, cantidad: 5 }])
    const cuenta = (await sql('select fn_crear_cuenta_automatica() as id')).rows[0].id

    // Puerta 1: el catálogo. Ya cubierta arriba (no hay producto de $0).
    // Puerta 2: la cantidad. Nadie puede agregar "0 unidades" para dejar la
    // cuenta con ítems y total $0.
    await expect(
      sql(`select fn_registrar_venta($1::jsonb, 0, gen_random_uuid(), $2)`, [
        JSON.stringify([{ producto_id: empanada, cantidad: 0 }]),
        cuenta,
      ]),
    ).rejects.toThrow(/CANTIDAD_INVALIDA/)

    // Y agregando 1 unidad de verdad, el total es positivo.
    await sql(`select fn_registrar_venta($1::jsonb, 0, gen_random_uuid(), $2)`, [
      JSON.stringify([{ producto_id: empanada, cantidad: 1 }]),
      cuenta,
    ])
    const { rows } = await sql(
      `select coalesce(sum(total_cop), 0) as total from venta
       where cuenta_id = $1 and tipo = 'cuenta'`,
      [cuenta],
    )
    expect(Number(rows[0].total)).toBeGreaterThan(0)
  })
})
