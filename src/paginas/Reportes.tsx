import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'
import {
  desplazarFecha,
  fechaHoyZona,
  formatearFechaLarga,
  horaEnZona,
  rangoDiaZona,
} from '../servicios/fechas'

interface ResumenDia {
  fecha: string
  total_ventas: number
  total_efectivo: number
  total_productos: number
  num_ventas: number
  num_cuentas: number
}

interface VentaPorProducto {
  producto_id: number
  nombre: string
  unidades: number
  total_cop: number
  porcentaje: number
}

interface VentaPorHora {
  hora: number
  num_ventas: number
  total_cop: number
}

export default function Reportes() {
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => fechaHoyZona())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenDia | null>(null)
  const [ventasProducto, setVentasProducto] = useState<VentaPorProducto[]>([])
  const [ventasHora, setVentasHora] = useState<VentaPorHora[]>([])

  const cargarReportes = useCallback(async () => {
    if (!supabaseConfigurado) return
    setCargando(true)
    setError(null)
    try {
      const fecha = fechaSeleccionada
      // Fronteras del día del negocio, ya convertidas a instantes UTC.
      const { desde, hasta } = rangoDiaZona(fecha)

      // 1. Ventas del día
      const { data: ventasDia, error: errVentas } = await supabase!
        .from('venta')
        .select('id, total_cop, tipo, cuenta_id, creada_el')
        .gte('creada_el', desde)
        .lt('creada_el', hasta)
        .in('tipo', ['mostrador', 'cobro_cuenta'])
      if (errVentas) throw errVentas
      const ventasDiaData = ventasDia ?? []
      const totalVentas = ventasDiaData.reduce((s, v) => s + v.total_cop, 0)
      const totalEfectivo = ventasDiaData.filter(v => v.tipo === 'mostrador').reduce((s, v) => s + v.total_cop, 0)
      const numVentas = ventasDiaData.length
      const numCuentas = new Set(ventasDiaData.filter(v => v.cuenta_id).map(v => v.cuenta_id)).size

      // 2. Items vendidos
      const ventaIds = ventasDiaData.map(v => v.id)
      let totalProductos = 0
      if (ventaIds.length > 0) {
        const { data: items } = await supabase!.from('detalle_venta').select('cantidad').in('venta_id', ventaIds)
        totalProductos = (items ?? []).reduce((s, i) => s + i.cantidad, 0)
      }

      // 3. Ventas por producto
      const { data: itemsVendidos } = await supabase!
        .from('detalle_venta')
        .select('cantidad, precio_unit_cop, subtotal_cop, producto:producto_id (nombre)')
        .in('venta_id', ventaIds.length > 0 ? ventaIds : [0])

      const productosMap = new Map<number, { nombre: string; unidades: number; total: number }>()
      ;(itemsVendidos ?? []).forEach(item => {
        const pid = (item as any).producto_id
        const nombre = (item as any).producto?.nombre || 'Sin nombre'
        const existing = productosMap.get(pid) || { nombre, unidades: 0, total: 0 }
        existing.unidades += item.cantidad
        existing.total += item.subtotal_cop
        productosMap.set(pid, existing)
      })

      const ventasProducto = Array.from(productosMap.entries())
        .map(([id, data]) => ({ producto_id: id, nombre: data.nombre, unidades: data.unidades, total_cop: data.total, porcentaje: totalVentas > 0 ? (data.total / totalVentas) * 100 : 0 }))
        .sort((a, b) => b.total_cop - a.total_cop)

      // 4. Ventas por hora - usando objeto simple en lugar de Map
      const ventasHoraMap: Record<number, VentaPorHora> = {}
      ventasDiaData.forEach(v => {
        const hora = horaEnZona(v.creada_el)
        if (!ventasHoraMap[hora]) {
          ventasHoraMap[hora] = { hora, num_ventas: 0, total_cop: 0 }
        }
        ventasHoraMap[hora].num_ventas += 1
        ventasHoraMap[hora].total_cop += v.total_cop
      })
      const ventasHora = Object.values(ventasHoraMap).sort((a, b) => a.hora - b.hora)

      setResumen({ fecha: fechaSeleccionada, total_ventas: totalVentas, total_efectivo: totalEfectivo, total_productos: totalProductos, num_ventas: numVentas, num_cuentas: numCuentas })
      setVentasProducto(ventasProducto)
      setVentasHora(ventasHora)
    } catch (e) {
      setError('Error cargando reportes: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [fechaSeleccionada])

  useEffect(() => { cargarReportes() }, [cargarReportes])

  const hoy = fechaHoyZona()

  if (cargando) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      <header className="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm flex items-center justify-between">
        <h1 className="font-bold text-lg">📊 Reportes</h1>
        <input type="date" value={fechaSeleccionada} onChange={e => setFechaSeleccionada(e.target.value)} className="rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-base focus:border-orange-500 focus:outline-none" />
      </header>

      <main className="flex-1 p-3 space-y-4 overflow-y-auto pb-24">
        {error && <div className="bg-red-50 p-3 rounded-xl text-red-700 text-sm" role="alert">{error}</div>}

        <div className="flex gap-2 p-3 bg-white rounded-xl shadow-sm">
          <button onClick={() => setFechaSeleccionada(hoy)} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${fechaSeleccionada === hoy ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>Hoy</button>
          <button onClick={() => setFechaSeleccionada(desplazarFecha(hoy, -1))} className="flex-1 rounded-xl py-2 text-sm font-semibold bg-neutral-100 text-neutral-700 active:bg-neutral-200">Ayer</button>
        </div>

        {resumen && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-3">
            <h2 className="font-semibold">📈 Resumen del día ({formatearFechaLarga(fechaSeleccionada)})</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-orange-50 rounded-xl p-3 text-center"><div className="text-xs text-orange-700">Ventas totales</div><div className="text-2xl font-bold text-orange-600">${resumen.total_ventas.toLocaleString()}</div></div>
              <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-xs text-green-700">Efectivo (mostrador)</div><div className="text-2xl font-bold text-green-700">${resumen.total_efectivo.toLocaleString()}</div></div>
              <div className="bg-blue-50 rounded-xl p-3 text-center"><div className="text-xs text-blue-700">Cuentas cobradas</div><div className="text-2xl font-bold text-blue-700">${resumen.num_cuentas}</div></div>
              <div className="bg-purple-50 rounded-xl p-3 text-center"><div className="text-xs text-purple-700">Productos vendidos</div><div className="text-2xl font-bold text-purple-700">{resumen.total_productos}</div></div>
              <div className="bg-orange-50 rounded-xl p-3 text-center col-span-2"><div className="text-xs text-orange-700">N° de ventas / Cuentas</div><div className="text-2xl font-bold text-orange-600">{resumen.num_ventas} ventas / {resumen.num_cuentas} cuentas</div></div>
            </div>
          </section>
        )}

        {ventasProducto.length > 0 && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-3">
            <h2 className="font-semibold">🏆 Ventas por producto</h2>
            <div className="space-y-2">
              {ventasProducto.map((p, i) => (
                <div key={p.producto_id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="bg-orange-100 text-orange-600 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">{i + 1}</span>
                    <div><div className="font-medium truncate max-w-[200px]">{p.nombre}</div><div className="text-xs text-neutral-500">{p.unidades} unds • {p.porcentaje.toFixed(1)}% del total</div></div>
                  </div>
                  <div className="text-right"><div className="font-bold text-orange-600">${p.total_cop.toLocaleString()}</div><div className="text-xs text-neutral-500">{p.unidades} unds</div></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {ventasHora.length > 0 && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-3">
            <h2 className="font-semibold">⏰ Ventas por hora</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500 border-b"><th className="pb-1">Hora</th><th className="pb-1 text-right">Ventas</th><th className="pb-1 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {ventasHora.map(v => (
                    <tr key={v.hora} className="border-b border-neutral-100">
                      <td className="py-1 font-medium">{v.hora}:00 - {v.hora + 1}:00</td>
                      <td className="py-1 text-right font-medium">{v.num_ventas}</td>
                      <td className="py-1 text-right font-bold text-orange-600">${v.total_cop.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl p-3 shadow-sm space-y-3">
          <h2 className="font-semibold">📉 Mermas</h2>
          <div className="bg-neutral-50 rounded-xl p-6 text-center text-neutral-500">Selecciona un día con cierre de turno para ver las mermas</div>
        </section>
      </main>
    </div>
  )
}
