import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

/**
 * Alta de productos. fn_crear_producto es el único camino de escritura al
 * catálogo: producto tiene RLS con política de sólo lectura y anon sólo tiene
 * SELECT sobre las tablas.
 *
 * Lo que fijan estas pruebas, además de las validaciones:
 * - El corte de diseño: dar de alta un producto NO exige turno abierto.
 *   Darle stock sí lo exige (fn_agregar_stock lanza TURNO_CERRADO).
 * - Que el producto nace sin stock, o sea que aparece AGOTADO hasta que se le
 *   cargue un conteo. Es el paso siguiente del flujo, no un olvido.
 * - Que el error crudo de Postgres no se filtra al usuario.
 */
describe('alta de productos', () => {
  let bd: BaseDeDatosDePrueba

  const sql = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) => bd.cliente.query<T>(text, params)

  /** Llama al RPC como lo hace la app: con el rol anon. */
  const comoAnon = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    await bd.cliente.query('set role anon')
    try {
      const { rows } = await bd.cliente.query<T>(text, params)
      return rows
    } finally {
      await bd.cliente.query('reset role')
    }
  }

  const crear = async (nombre: string, precioCop: number, imagenUrl = ''): Promise<number> => {
    const [fila] = await comoAnon<{ id: string }>(
      'select fn_crear_producto($1, $2, $3) as id',
      [nombre, precioCop, imagenUrl],
    )
    return Number(fila.id)
  }

  const productoDe = async (id: number) =>
    (
      await sql<{
        nombre: string
        precio_cop: number
        orden: number
        imagen_url: string
        activo: boolean
      }>('select nombre, precio_cop, orden, imagen_url, activo from producto where id = $1', [id])
    ).rows[0]

  /** Abre el turno contando 100 de cada producto activo, como exige fn_abrir_turno. */
  const abrirTurno = () =>
    sql(`
      select fn_abrir_turno(
        70000,
        (select jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad', 100))
         from producto where activo),
        'prueba')
    `)

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
  })

  it('crea el producto, lo deja activo y devuelve el id', async () => {
    const id = await crear('TEST Arepa de huevo', 3500)

    expect(id).toBeGreaterThan(0)
    expect(await productoDe(id)).toEqual({
      nombre: 'TEST Arepa de huevo',
      precio_cop: 3500,
      orden: expect.any(Number),
      imagen_url: '',
      activo: true,
    })
  })

  it('deja el producto nuevo al final del orden del catálogo', async () => {
    const maxPrevio = (await sql<{ m: number }>('select coalesce(max(orden), 0) as m from producto'))
      .rows[0].m

    const primero = await crear('TEST Primero', 1000)
    const segundo = await crear('TEST Segundo', 2000)

    // Arranca después de todo lo que ya había (el catálogo del seed ocupa 1..6).
    expect((await productoDe(primero)).orden).toBe(maxPrevio + 1)
    // Y no colisiona con el anterior: cada alta se va al final.
    expect((await productoDe(segundo)).orden).toBe(maxPrevio + 2)
  })

  it('guarda la url de la imagen cuando se la pasan', async () => {
    const id = await crear('TEST Con imagen', 1500, 'https://ejemplo.test/foto.png')

    expect((await productoDe(id)).imagen_url).toBe('https://ejemplo.test/foto.png')
  })

  it('deja la imagen vacía, tanto si la mandan vacía como si no la mandan', async () => {
    const vacia = await crear('TEST Imagen vacia', 1500, '')

    // Sin el tercer argumento: se usa el default de la firma.
    const [fila] = await comoAnon<{ id: string }>(
      `select fn_crear_producto('TEST Sin argumento', 1500) as id`,
    )

    expect((await productoDe(vacia)).imagen_url).toBe('')
    expect((await productoDe(Number(fila.id))).imagen_url).toBe('')
  })

  it('recorta los espacios del nombre', async () => {
    const id = await crear('   TEST Empanada   ', 2000)

    expect((await productoDe(id)).nombre).toBe('TEST Empanada')
  })

  it('rechaza el nombre vacío y el de sólo espacios', async () => {
    await expect(crear('', 1000)).rejects.toThrow(/NOMBRE_VACIO/)
    await expect(crear('     ', 1000)).rejects.toThrow(/NOMBRE_VACIO/)
  })

  it('rechaza el precio cero y el negativo', async () => {
    await expect(crear('TEST Gratis', 0)).rejects.toThrow(/PRECIO_INVALIDO/)
    await expect(crear('TEST Negativo', -500)).rejects.toThrow(/PRECIO_INVALIDO/)
  })

  it('rechaza un nombre repetido aunque cambie la capitalización, sin filtrar el error crudo', async () => {
    await crear('TEST Arepa de huevo', 3500)

    // El índice ux_producto_nombre_activo es sobre lower(nombre).
    const error = await crear('TEST AREPA DE HUEVO', 4000).catch((e: Error) => e.message)

    expect(error).toMatch(/PRODUCTO_YA_EXISTE/)
    // Un nombre repetido es un error de negocio, no un choque de índices.
    expect(error).not.toMatch(/unique/i)
  })

  it('deja reusar el nombre de un producto desactivado', async () => {
    const viejo = await crear('TEST Marranita', 2500)
    await sql(`update producto set activo = false where id = $1`, [viejo])

    // El índice es parcial (where activo), así que el nombre se libera.
    const nuevo = await crear('TEST Marranita', 3000)

    expect(nuevo).not.toBe(viejo)
    expect((await productoDe(nuevo)).activo).toBe(true)
  })

  it('crea sin turno abierto', async () => {
    const turnos = await sql<{ n: number }>('select count(*)::int as n from turno')
    expect(turnos.rows[0].n).toBe(0)

    // Es el corte de diseño: el catálogo se prepara antes de abrir el turno.
    await expect(crear('TEST Arepa de huevo', 3500)).resolves.toBeGreaterThan(0)
  })

  it('no le carga stock: el producto nace sin conteo inicial', async () => {
    await abrirTurno()
    const id = await crear('TEST Arepa de huevo', 3500)

    const { rows } = await sql<{ n: number }>(
      'select count(*)::int as n from conteo_inicial where producto_id = $1',
      [id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('aparece en v_stock_teorico con el teórico en cero apenas se crea', async () => {
    await abrirTurno()

    const id = await crear('TEST Arepa de huevo', 3500)

    const { rows } = await sql<{ inicial: number; vendidos: number; teorico: number }>(
      // ::int porque sum() devuelve bigint y el driver de pg serializa int8 como
      // string. La app no pasa por acá (va por PostgREST, que lo manda como
      // número): es una diferencia del harness, no del esquema.
      `select inicial::int, vendidos::int, teorico::int
       from v_stock_teorico where producto_id = $1`,
      [id],
    )

    // Una fila: el producto nuevo ya es parte del turno abierto.
    expect(rows).toHaveLength(1)
    // Pero sin stock, así que la app lo muestra AGOTADO hasta cargarle conteo.
    expect(rows[0]).toEqual({ inicial: 0, vendidos: 0, teorico: 0 })
  })

  it('la app no puede escribir la tabla: la escritura pasa sólo por la función', async () => {
    await bd.cliente.query('set role anon')
    try {
      // Ni siquiera un INSERT bien formado: anon no tiene grant de escritura.
      await expect(
        bd.cliente.query(`insert into producto (nombre, precio_cop) values ('TEST Directo', 1000)`),
      ).rejects.toThrow(/permission denied/)

      // En cambio por la función SECURITY DEFINER sí puede.
      const { rows } = await bd.cliente.query<{ id: string }>(
        `select fn_crear_producto('TEST Por la funcion', 1000) as id`,
      )
      expect(Number(rows[0].id)).toBeGreaterThan(0)
    } finally {
      await bd.cliente.query('reset role')
    }
  })
})
