import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'

interface StockItem {
  producto_id: number
  nombre: string
  orden: number
  inicial: number
  vendidos: number
  teorico: number
}

export default function Inventario() {
  const [stock, setStock] = useState<StockItem[]>([])
  // Sin conexión no hay nada que traer: si arrancara en "cargando", la ruedita
  // giraría para siempre (el early return de abajo nunca apaga el flag).
  const [cargando, setCargando] = useState(supabaseConfigurado)
  const [error, setError] = useState<string | null>(null)
  const [agregandoA, setAgregandoA] = useState<number | null>(null)
  const [cantidadAgregar, setCantidadAgregar] = useState('')
  const [agregando, setAgregando] = useState(false)

  const refrescar = useCallback(async () => {
    if (!supabaseConfigurado) return
    try {
      const { data, error } = await supabase!
        .from('v_stock_teorico')
        .select('producto_id, nombre, orden, inicial, vendidos, teorico')
        .order('orden')
      if (error) throw error
      setStock(data ?? [])
    } catch (e) {
      setError('Error cargando inventario: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { refrescar() }, [refrescar])

  // Realtime: actualizar stock en vivo
  useEffect(() => {
    if (!supabaseConfigurado) return
    const canal = supabase!
      .channel('inventario-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venta' }, () => refrescar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_venta' }, () => refrescar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conteo_inicial' }, () => refrescar())
      .subscribe()
    return () => { supabase!.removeChannel(canal) }
  }, [refrescar])

  const handleAgregarStock = async (productoId: number) => {
    const cantidad = parseInt(cantidadAgregar, 10)
    if (isNaN(cantidad) || cantidad <= 0) {
      setError('Ingresa una cantidad válida mayor que 0')
      return
    }
    setAgregando(true)
    setError(null)
    try {
      const { error } = await supabase!.rpc('fn_agregar_stock', {
        p_producto_id: productoId,
        p_cantidad: cantidad
      })
      if (error) throw error
      setAgregandoA(null)
      setCantidadAgregar('')
    } catch (e) {
      setError('Error agregando stock: ' + (e as Error).message)
    } finally {
      setAgregando(false)
    }
  }

  const cancelarAgregar = () => {
    setAgregandoA(null)
    setCantidadAgregar('')
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
        <h1 className="font-bold text-lg">📦 Inventario</h1>
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" aria-label="Conectado"></span>
          En vivo
        </span>
      </header>

      <main className="flex-1 p-3 space-y-4 overflow-y-auto">
        {error && (
          <div className="bg-red-50 p-3 rounded-xl text-red-700 text-sm" role="alert">{error}</div>
        )}

        <ul className="space-y-2">
          {stock.map(item => {
            const disponible = item.teorico
            const agotado = disponible <= 0
            const bajo = disponible > 0 && disponible <= 5
            const esAgregando = agregandoA === item.producto_id
            return (
              <li key={item.producto_id} className={`bg-white rounded-xl p-3 shadow-sm ${agotado ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base truncate">{item.nombre}</span>
                      {agotado && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">AGOTADO</span>
                      )}
                      {bajo && !agotado && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">STOCK BAJO</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 flex gap-4">
                      <span>Inicial: <span className="font-mono font-medium">{item.inicial}</span></span>
                      <span>Vendidos: <span className="font-mono font-medium text-red-600">{item.vendidos}</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500">Disponible</div>
                    <div className={`text-2xl font-bold font-mono ${agotado ? 'text-red-600' : bajo ? 'text-yellow-600' : 'text-green-700'}`}>
                      {disponible}
                    </div>
                  </div>
                </div>

                {/* Botón agregar stock */}
                {!esAgregando ? (
                  <button
                    onClick={() => { setAgregandoA(item.producto_id); setCantidadAgregar('') }}
                    className="mt-2 w-full rounded-xl bg-blue-50 border border-blue-200 py-2 text-sm font-semibold text-blue-700 active:bg-blue-100"
                  >
                    + Agregar stock
                  </button>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={cantidadAgregar}
                      onChange={e => setCantidadAgregar(e.target.value)}
                      placeholder="Cantidad"
                      className="flex-1 rounded-xl border-2 border-blue-300 bg-white px-3 py-2 text-base text-center focus:border-blue-500 focus:outline-none"
                      inputMode="numeric"
                      autoFocus
                    />
                    <button
                      onClick={() => handleAgregarStock(item.producto_id)}
                      disabled={agregando}
                      className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white active:bg-blue-600 disabled:opacity-40"
                    >
                      {agregando ? '…' : 'Agregar'}
                    </button>
                    <button
                      onClick={cancelarAgregar}
                      className="rounded-xl bg-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-300"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            )
          })}
          {stock.length === 0 && (
            <li className="bg-white rounded-xl p-8 text-center text-neutral-500">
              No hay productos en el catálogo
            </li>
          )}
        </ul>

        <div className="bg-white rounded-xl p-3 shadow-sm text-center text-xs text-neutral-500">
          Stock teórico = Inicial − Vendidos · Actualizado en tiempo real
        </div>
      </main>
    </div>
  )
}
