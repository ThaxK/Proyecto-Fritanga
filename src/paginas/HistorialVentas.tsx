import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'
import {
  fechaHoyZona,
  horaEnZona,
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

export default function HistorialVentas() {
  const [ventas, setVentas] = useState<VentaHistorico[]>([])
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => fechaHoyZona())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
                  const hora = horaEnZona(v.creada_el)
                  return (
                    <tr key={v.id} className="hover:bg-neutral-50">
                      <td className="pb-3 pl-4 font-medium text-neutral-900">{fecha}</td>
                      <td className="pb-3 pl-4 font-mono text-neutral-700">{hora}:00</td>
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
    </div>
  )
}
