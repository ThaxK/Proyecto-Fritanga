import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

describe('cuentas abiertas', () => {
  let bd: BaseDeDatosDePrueba

  const sql = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) => bd.cliente.query<T>(text, params)

  /** Deja la base como recién creada y con un turno abierto. */
  const prepararTurno = async () => {
    await sql(`
      truncate table cuenta, venta, detalle_venta, movimiento_caja,
                     reconciliacion, conteo_inicial, turno
      restart identity cascade
    `)
    await sql(`
      select fn_abrir_turno(
        70000,
        (select jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad', 100))
         from producto where activo),
        'prueba')
    `)
  }

  const crearAutomatica = async (clientTxId?: string) =>
    (
      await sql('select fn_crear_cuenta_automatica($1) as id', [clientTxId ?? null])
    ).rows[0].id as number

  const etiquetasAbiertas = async () =>
    (await sql(`select etiqueta from cuenta where estado = 'abierta' order by numero`))
      .rows.map((f) => f.etiqueta as string)

  const etiquetaDe = async (id: number) =>
    (await sql('select etiqueta from cuenta where id = $1', [id])).rows[0].etiqueta as string

  const primerProducto = async () =>
    (await sql('select id from producto where activo order by orden limit 1')).rows[0]
      .id as number

  /** Carga un ítem en la cuenta, como hace el POS al cobrar. */
  const agregarItem = async (cuentaId: number) => {
    await sql(
      `select fn_registrar_venta(
         jsonb_build_array(jsonb_build_object('producto_id', $1::bigint, 'cantidad', 1)),
         0, gen_random_uuid(), $2::bigint, 'prueba')`,
      [await primerProducto(), cuentaId],
    )
  }

  const cerrarTurno = () =>
    sql(`
      select fn_cerrar_turno(
        (select jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad', 100))
         from producto where activo),
        70000, '')
    `)

  beforeAll(async () => {
    bd = await levantarBaseDeDatos()
  }, 180_000)

  afterAll(async () => {
    await bd?.detener()
  })

  beforeEach(prepararTurno)

  it('numera las cuentas automáticas en orden dentro del turno', async () => {
    await crearAutomatica()
    await crearAutomatica()
    await crearAutomatica()

    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 2', 'Cuenta 3'])
  })

  // Este es el bug: la app derivaba "Cuenta N" de cuentas.length + 1. Al
  // eliminar una cuenta vacía el conteo bajaba y el nombre propuesto volvía a
  // chocar con una cuenta abierta, así que los ítems del cliente nuevo caían
  // en la cuenta de otro cliente.
  it('al eliminar una cuenta vacía NO reutiliza el nombre de otra cuenta abierta', async () => {
    const primera = await crearAutomatica()
    const segunda = await crearAutomatica()
    const tercera = await crearAutomatica()

    // La "Cuenta 2" recibe un ítem y después se vacía: fn_restar_item_cuenta
    // la elimina porque deja de tener ventas.
    await agregarItem(segunda)
    const restar = await sql('select fn_restar_item_cuenta($1, $2, 1) as r', [
      segunda,
      await primerProducto(),
    ])
    expect(restar.rows[0].r.cuenta_eliminada).toBe(true)
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 3'])

    // Antes del arreglo acá aparecía "Cuenta 3" apuntando a `tercera`.
    const cuarta = await crearAutomatica()
    expect(cuarta).not.toBe(tercera)
    expect(await etiquetaDe(cuarta)).toBe('Cuenta 4')
    expect(tercera).not.toBe(primera)
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 3', 'Cuenta 4'])
  })

  it('reutiliza el número sólo cuando esa cuenta ya no existe', async () => {
    await crearAutomatica()
    await crearAutomatica()
    const tercera = await crearAutomatica()

    // Se vacía la última: su número 3 queda libre y se puede volver a usar.
    await agregarItem(tercera)
    await sql('select fn_restar_item_cuenta($1, $2, 1)', [tercera, await primerProducto()])
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 2'])

    const nueva = await crearAutomatica()
    expect(await etiquetaDe(nueva)).toBe('Cuenta 3')
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 2', 'Cuenta 3'])
  })

  it('es idempotente: el mismo client_tx_id devuelve la misma cuenta', async () => {
    const clave = randomUUID()

    const primera = await crearAutomatica(clave)
    const reintento = await crearAutomatica(clave)

    expect(reintento).toBe(primera)
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1'])
  })

  it('serializa dos creaciones simultáneas con el bloqueo del turno', async () => {
    const conexionA = await bd.nuevoCliente()
    const conexionB = await bd.nuevoCliente()

    // A toma el bloqueo del turno y crea una cuenta sin confirmar.
    await conexionA.query('begin')
    await conexionA.query("select id from turno where estado = 'abierto' for update")
    const idA = (await conexionA.query('select fn_crear_cuenta_automatica() as id')).rows[0]
      .id

    // B intenta crear mientras tanto: queda esperando el bloqueo.
    let resolvioB = false
    const promesaB = conexionB.query('select fn_crear_cuenta_automatica() as id').then(
      (r) => {
        resolvioB = true
        return { ok: true as const, r }
      },
      (e: unknown) => {
        resolvioB = true
        return { ok: false as const, e }
      },
    )

    await new Promise((listo) => setTimeout(listo, 300))
    expect(resolvioB, 'B debería estar bloqueada por el turno de A').toBe(false)

    await conexionA.query('commit')
    const resultadoB = await promesaB
    if (!resultadoB.ok) throw resultadoB.e

    expect(resultadoB.r.rows[0].id).not.toBe(idA)
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1', 'Cuenta 2'])
  })

  it('fn_crear_cuenta con etiqueta manual sigue reutilizando la cuenta abierta', async () => {
    const primera = (await sql(`select fn_crear_cuenta($1) as id`, ['Mesa 1'])).rows[0].id
    const conOtraCaja = (await sql(`select fn_crear_cuenta($1) as id`, ['mesa 1'])).rows[0].id

    expect(conOtraCaja).toBe(primera)
    expect(await etiquetasAbiertas()).toEqual(['Mesa 1'])
  })

  it('una etiqueta manual que ocupa el patrón "Cuenta N" no bloquea la creación automática', async () => {
    await sql(`select fn_crear_cuenta($1)`, ['Cuenta 2'])

    const automatica = await crearAutomatica()

    expect(await etiquetaDe(automatica)).toBe('Cuenta 3')
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 2', 'Cuenta 3'])
  })

  // Este era el bug que hacía imposible cerrar el turno: una cuenta creada por
  // error y nunca usada no se podía sacar (fn_restar_item_cuenta sólo elimina
  // una cuenta cuando le queda algún ítem que restar) y fn_cerrar_turno la
  // rechaza con CUENTAS_ABIERTAS.
  it('una cuenta creada y nunca usada se puede eliminar y ya no traba el cierre', async () => {
    const huerfana = await crearAutomatica()

    await expect(cerrarTurno()).rejects.toThrow(/CUENTAS_ABIERTAS/)

    await sql('select fn_eliminar_cuenta_vacia($1)', [huerfana])

    expect(await etiquetasAbiertas()).toEqual([])
    await expect(cerrarTurno()).resolves.toBeDefined()
  })

  it('no deja eliminar una cuenta que tiene ítems', async () => {
    const cuenta = await crearAutomatica()
    await agregarItem(cuenta)

    await expect(sql('select fn_eliminar_cuenta_vacia($1)', [cuenta])).rejects.toThrow(
      /CUENTA_CON_ITEMS/,
    )
    expect(await etiquetasAbiertas()).toEqual(['Cuenta 1'])
  })
})
