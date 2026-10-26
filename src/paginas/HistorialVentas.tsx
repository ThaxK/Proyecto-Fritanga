import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'
import {
  fechaHoyZona,
  horaMinutoEnZona,
  rangoDiaZona,
  desplazarFecha,
  formatearFechaLarga,
} from '../servicios/fechas'

interface VentaHistorico {
  id: number
  total_cop: number
  tipo: string
  cuenta_id: number | null
  creada_el: string
  recibido_cop: number
  vuelto_cop: number
  cuenta?: { etiqueta: string; numero: number } | null
}

interface ItemDetalle {
  producto_id: number
  nombre: string
  cantidad: number
  precio_unit_cop: number
  subtotal_cop: number
}

export default function HistorialVentas() {
  const [ventas, setVentas] = useState<VentaHistorico[]>([])
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => fechaHoyZona())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detalle de una venta específica (modal)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [itemsDetalle, setItemsDetalle] = useState<ItemDetalle[]>([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const cargarVentas = useCallback(async () => {
    if (!supabaseConfigurado) return
    setCargando(true)
    setError(null)
    try {
      const { desde, hasta } = rangoDiaZona(fechaSeleccionada)
      const { data, error: err } = await supabase!
        .from('venta')
        .select(
          `id, total_cop, tipo, cuenta_id, creada_el, recibido_cop, vuelto_cop,
           cuenta (etiqueta, numero)`
        )
        .in('tipo', ['mostrador', 'cobro_cuenta'])
        .gte('creada_el', desde)
        .lt('creada_el', hasta)
        .order('creada_el', { ascending: false })
      if (err) throw err
      setVentas((data ?? []) as unknown as VentaHistorico[])
    } catch (e) {
      setError('Error cargando historial: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [fechaSeleccionada])

  const cargarDetalleVenta = useCallback(async (ventaId: number) => {
    if (!supabaseConfigurado) return
    setCargandoDetalle(true)
    setError(null)
    try {
      // Buscar la venta para saber su tipo y cuenta_id
      const { data: ventaData, error: errVenta } = await supabase!
        .from('venta')
        .select('tipo, cuenta_id')
        .eq('id', ventaId)
        .single()
      if (errVenta) throw errVenta
      const venta = ventaData as { tipo: string; cuenta_id: number | null }

      let items: ItemDetalle[] = []

      if (venta.tipo === 'mostrador') {
        // Venta directa: los ítems están en detalle_venta de esta venta
        const { data, error: err } = await supabase!
          .from('detalle_venta')
          .select(
            'producto_id, cantidad, precio_unit_cop, subtotal_cop, producto:producto_id (nombre)'
          )
          .eq('venta_id', ventaId)
          .order('producto_id')
        if (err) throw err
        items = (data ?? []).map(d => ({
          producto_id: d.producto_id,
          nombre: (d as any).producto?.nombre || 'Producto',
          cantidad: d.cantidad,
          precio_unit_cop: d.precio_unit_cop,
          subtotal_cop: d.subtotal_cop,
        }))
      } else if (venta.tipo === 'cobro_cuenta' && venta.cuenta_id) {
        // Cobro de cuenta: los ítems están en las ventas tipo 'cuenta' de esa cuenta
        const { data: ventasCuenta, error: errVentas } = await supabase!
          .from('venta')
          .select('id')
          .eq('cuenta_id', venta.cuenta_id)
          .eq('tipo', 'cuenta')
        if (errVentas) throw errVentas
        const ventaIds = (ventasCuenta ?? []).map(v => v.id)
        if (ventaIds.length > 0) {
          const { data, error: err } = await supabase!
            .from('detalle_venta')
            .select(
              'producto_id, cantidad, precio_unit_cop, subtotal_cop, producto:producto_id (nombre)'
            )
            .in('venta_id', ventaIds)
            .order('producto_id')
          if (err) throw err
          items = (data ?? []).map(d => ({
            producto_id: d.producto_id,
            nombre: (d as any).producto?.nombre || 'Producto',
            cantidad: d.cantidad,
            precio_unit_cop: d.precio_unit_cop,
            subtotal_cop: d.subtotal_cop,
          }))
        }
      }
      // tipo 'cuenta' (abierta, no cobrada): no debería aparecer en el historial,
      // pero si lo hace, no tiene detalle propio

      setItemsDetalle(items)
      setDetalleId(ventaId)
    } catch (e) {
      setError('Error cargando detalle: ' + (e as Error).message)
    } finally {
      setCargandoDetalle(false)
    }
  }, [])

  const cerrarDetalle = () => {
    setDetalleId(null)
    setItemsDetalle([])
    setError(null)
  }

  useEffect(() => {
    cargarVentas()
  }, [cargarVentas])

  const hoy = fechaHoyZona()
  const ayer = desplazarFecha(hoy, -1)

  const tipoLabel = (tipo: string) => {
    if (tipo === 'mostrador') return 'Mostrador'
    if (tipo === 'cobro_cuenta') return 'Cuenta cobrada'
    if (tipo === 'cuenta') return 'Cuenta abierta'
    return tipo
  }

  const cuentaLabel = (v: VentaHistorico) => {
    if (v.cuenta?.etiqueta) return `${v.cuenta.etiqueta} (#${v.cuenta.numero})`
    if (v.cuenta_id) return `Cuenta #${v.cuenta_id}`
    return 'Mostrador'
  }

  const estaSeleccionada = (id: number) => id === detalleId

  // Agrupar ítems por producto: sumar cantidades y subtotales
  const itemsAgrupadosMap = new Map<number, ItemDetalle>()
  itemsDetalle.forEach(item => {
    const existente = itemsAgrupadosMap.get(item.producto_id)
    if (existente) {
      existente.cantidad += item.cantidad
      existente.subtotal_cop += item.subtotal_cop
    } else {
      itemsAgrupadosMap.set(item.producto_id, { ...item })
    }
  })
  const itemsAgrupados = Array.from(itemsAgrupadosMap.values())

  if (cargando && detalleId === null) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      <header className="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm flex items-center justify-between">
        <h1 className="font-bold text-lg">🧾 Historial de ventas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFechaSeleccionada(hoy)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              fechaSeleccionada === hoy ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setFechaSeleccionada(ayer)}
            className="flex-1 rounded-xl py-2 text-sm font-semibold bg-neutral-100 text-neutral-700 active:bg-neutral-200"
          >
            Ayer
          </button>
          <input
            type="date"
            value={fechaSeleccionada}
            onChange={e => setFechaSeleccionada(e.target.value)}
            className="ml-2 rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-base focus:border-orange-500 focus:outline-none"
          />
        </div>
      </header>

      <main className="flex-1 p-3 space-y-4 overflow-y-auto">
        {error && (
          <div className="bg-red-50 p-3 rounded-xl text-red-700 text-sm" role="alert">{error}</div>
        )}

        <div className="flex gap-2 p-3 bg-white rounded-xl shadow-sm">
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <div className="text-xs text-orange-700">Ventas del día</div>
            <div className="text-2xl font-bold text-orange-600">{ventas.length}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-xs text-green-700">Total facturado</div>
            <div className="text-2xl font-bold text-green-700">
              ${ventas.reduce((s, v) => s + v.total_cop, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {ventas.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-neutral-500">
            No hay ventas registradas para {formatearFechaLarga(fechaSeleccionada)}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm border-b border-neutral-200">
              <thead>
                <tr className="bg-neutral-50 text-left text-xs text-neutral-500 border-b">
                  <th className="pb-3 pl-4 font-medium">Fecha</th>
                  <th className="pb-3 pl-4 font-medium">Hora</th>
                  <th className="pb-3 pl-4 font-medium">Tipo</th>
                  <th className="pb-3 pl-4 font-medium text-right">Total</th>
                  <th className="pb-3 pl-4 font-medium">Cuenta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ventas.map(v => {
                  const fecha = fechaHoyZona(new Date(v.creada_el))
                  const hm = horaMinutoEnZona(v.creada_el)
                  const seleccionada = estaSeleccionada(v.id)
                  return (
                    <tr
                      key={v.id}
                      onClick={() => cargarDetalleVenta(v.id)}
                      className={`hover:bg-neutral-50 cursor-pointer ${
                        seleccionada ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="pb-3 pl-4 font-medium text-neutral-900">{fecha}</td>
                      <td className="pb-3 pl-4 font-mono text-neutral-700">{hm}</td>
                      <td className="pb-3 pl-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            v.tipo === 'mostrador'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {tipoLabel(v.tipo)}
                        </span>
                      </td>
                      <td className="pb-3 pl-4 text-right font-mono font-bold text-neutral-900">
                        ${v.total_cop.toLocaleString()}
                      </td>
                      <td className="pb-3 pl-4 text-sm text-neutral-600">{cuentaLabel(v)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal de detalle de venta */}
      {detalleId !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b bg-orange-50 rounded-t-2xl">
              <h2 className="font-bold text-lg">Detalle de venta #{detalleId}</h2>
              <button
                onClick={cerrarDetalle}
                className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {cargandoDetalle && (
              <div className="flex min-h-[200px] items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-orange-500 border-t-transparent"></div>
              </div>
            )}

            {!cargandoDetalle && itemsDetalle.length > 0 && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
                <div className="flex justify-between text-sm text-neutral-500 border-b pb-2 mb-2">
                  <span className="font-medium">Producto</span>
                  <span className="text-right font-mono">Cant.</span>
                  <span className="text-right font-mono">Precio</span>
                  <span className="text-right font-mono">Subtotal</span>
                </div>
                {Array.from(itemsAgrupados.values()).map(item => (
                  <div key={item.producto_id} className="flex justify-between items-center py-2 border-b border-neutral-100 last:border-0">
                    <span className="text-sm truncate max-w-[120px]">{item.nombre}</span>
                    <div className="text-right font-mono text-sm w-16">
                      {item.cantidad}
                    </div>
                    <div className="text-right font-mono text-sm w-20">
                      ${item.precio_unit_cop.toLocaleString()}
                    </div>
                    <div className="text-right font-mono text-sm font-bold w-24">
                      ${item.subtotal_cop.toLocaleString()}
                    </div>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                  <span className="text-neutral-500">Total detalle</span>
                  <span className="font-bold font-mono text-neutral-900 text-right w-24">
                    ${itemsDetalle.reduce((s, i) => s + i.subtotal_cop, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {!cargandoDetalle && itemsDetalle.length === 0 && (
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-neutral-500 text-sm">Sin ítems registrados</p>
              </div>
            )}

            <div className="p-4 border-t bg-neutral-50 rounded-b-2xl">
              <button
                onClick={cerrarDetalle}
                className="w-full rounded-xl bg-neutral-200 py-3 text-base font-semibold text-neutral-700 active:bg-neutral-300"
              >
                Cerrar detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
