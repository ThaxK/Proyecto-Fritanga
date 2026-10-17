import type { Page } from '@playwright/test'

export interface ProductoFalso {
  id: number
  nombre: string
  precio_cop: number
  orden: number
  activo: boolean
  imagen_url?: string
}

export interface CuentaFalsa {
  id: number
  etiqueta: string
  creada_el: string
}

export interface EstadoDeSupabaseFalso {
  /** Con turno abierto, App entra a "Venta"; sin turno, a "Apertura de turno". */
  turnoAbierto?: boolean
  productos?: ProductoFalso[]
  cuentas?: CuentaFalsa[]
  /** Una fila de venta por cada número: el largo da los ítems y la suma el total. */
  totalesPorCuenta?: Record<number, number[]>
  /** Respuesta de cada función RPC, por nombre. */
  rpc?: Record<string, unknown | ((cuerpo: Record<string, unknown>) => unknown)>
}

export interface PeticionRpc {
  nombre: string
  cuerpo: Record<string, unknown>
}

/** Valor de un filtro PostgREST: `?estado=eq.abierta` -> `abierta`. */
function filtro(params: URLSearchParams, columna: string): string | null {
  const valor = params.get(columna)
  if (valor === null) return null
  return valor.startsWith('eq.') ? valor.slice(3) : valor
}

/** Devuelve `undefined` si la tabla no está contemplada, para poder fallar fuerte. */
function filasDeLaTabla(
  tabla: string,
  params: URLSearchParams,
  estado: EstadoDeSupabaseFalso,
): unknown[] | undefined {
  const id = filtro(params, 'id')
  const porId = <T extends { id: number }>(filas: T[]) =>
    id === null ? filas : filas.filter((fila) => String(fila.id) === id)

  switch (tabla) {
    case 'turno':
      return estado.turnoAbierto ? [{ id: 1 }] : []

    case 'producto': {
      const activo = filtro(params, 'activo')
      return porId(estado.productos ?? []).filter(
        (p) => activo === null || String(p.activo) === activo,
      )
    }

    case 'cuenta':
      return porId(estado.cuentas ?? [])

    case 'venta': {
      const cuentaId = filtro(params, 'cuenta_id')
      if (cuentaId === null) return []
      const totales = estado.totalesPorCuenta?.[Number(cuentaId)] ?? []
      return totales.map((total) => ({
        total_cop: total,
        cuenta_id: Number(cuentaId),
        tipo: 'cuenta',
      }))
    }

    // El stock se deriva de conteo_inicial, que empieza en cero para cada
    // producto activo del turno abierto.
    case 'v_stock_teorico': {
      return (estado.productos ?? []).map((p) => ({
        producto_id: p.id,
        nombre: p.nombre,
        orden: p.orden,
        precio_cop: p.precio_cop,
        inicial: 0,
        vendidos: 0,
        teorico: 0,
        turno_id: 1,
        imagen_url: p.imagen_url,
      }))
    }

    default:
      return undefined
  }
}

/**
 * Hace que la app hable con un Supabase simulado, sin salir a la red.
 *
 * La app se levanta apuntando a un dominio `.invalid` (ver playwright.config.ts),
 * así que ninguna petición puede llegar a un Supabase real ni por accidente.
 *
 * Si el mock no contempla una consulta responde 500 con el motivo, en lugar de
 * inventar datos: es preferible que un test falle con "esto no está simulado" a
 * que pase de casualidad por una respuesta vacía.
 */
export async function fingirSupabase(page: Page, estado: EstadoDeSupabaseFalso = {}) {
  const rpcRecibidas: PeticionRpc[] = []

  // El realtime va por WebSocket, así que page.route no lo ve. Aceptamos la
  // conexión y no emitimos nada: la app funciona igual sin updates en vivo.
  await page.routeWebSocket('**/realtime/**', () => {})

  await page.route('**/rest/v1/**', async (route) => {
    const pedido = route.request()
    const url = new URL(pedido.url())

    const nombreRpc = url.pathname.match(/\/rest\/v1\/rpc\/(.+)$/)?.[1]
    if (nombreRpc) {
      let cuerpo: Record<string, unknown> = {}
      try {
        cuerpo = (pedido.postDataJSON() ?? {}) as Record<string, unknown>
      } catch {
        // Sin cuerpo JSON válido no hay nada que registrar.
      }
      rpcRecibidas.push({ nombre: nombreRpc, cuerpo })

      const respuesta = estado.rpc?.[nombreRpc]
      if (respuesta === undefined) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: `el mock no contempla la RPC ${nombreRpc}` }),
        })
        return
      }

      let datos
      try {
        datos = typeof respuesta === 'function' ? respuesta(cuerpo) : respuesta
      } catch (e) {
        // La base lanza excepciones (ej. NOMBRE_VACIO, PRODUCTO_YA_EXISTE).
        // Supabase las devuelve como HTTP 400 con el mensaje; simulamos eso
        // para que la app muestre el error en pantalla.
        const mensaje = e instanceof Error ? e.message : String(e)
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: mensaje }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(datos),
      })
      return
    }

    const tabla = url.pathname.split('/rest/v1/')[1] ?? ''
    const filas = filasDeLaTabla(tabla, url.searchParams, estado)
    if (filas === undefined) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: `el mock no contempla la tabla "${tabla}" (${pedido.method()} ${url.pathname}?${url.searchParams})`,
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filas),
    })
  })

  return { rpcRecibidas }
}
