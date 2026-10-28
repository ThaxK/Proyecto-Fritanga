import { supabase } from './supabase'
import { fechaHoyZona, rangoMesZona } from './fechas'

export interface DiaConVentas {
  total: number
  numVentas: number
}

/**
 * Días del mes con ventas, agrupados por fecha del negocio (`aaaa-mm-dd`).
 * Se usa en el calendario para marcar los días que tuvieron movimiento.
 *
 * Trae solo `creada_el` y `total_cop` del mes y agrupa en el cliente: para el
 * volumen de una fritanga es más simple que una vista SQL y evita una migración.
 */
export async function cargarDiasConVentas(
  anio: number,
  mes: number,
): Promise<Map<string, DiaConVentas>> {
  if (!supabase) return new Map()

  const { desde, hasta } = rangoMesZona(anio, mes)
  const { data, error } = await supabase
    .from('venta')
    .select('creada_el, total_cop')
    .in('tipo', ['mostrador', 'cobro_cuenta'])
    .gte('creada_el', desde)
    .lt('creada_el', hasta)

  if (error) throw error

  const mapa = new Map<string, DiaConVentas>()
  for (const venta of data ?? []) {
    const dia = fechaHoyZona(new Date(venta.creada_el))
    const previo = mapa.get(dia) ?? { total: 0, numVentas: 0 }
    mapa.set(dia, {
      total: previo.total + venta.total_cop,
      numVentas: previo.numVentas + 1,
    })
  }
  return mapa
}
