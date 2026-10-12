import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'

// Cuenta con total calculado
interface CuentaConTotal {
  id: number
  etiqueta: string
  creada_el: string
  total: number
  items: number
}

export default function CuentasAbiertas({ onVolver }: { onVolver: () => void }) {
  const [cuentas, setCuentas] = useState<CuentaConTotal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')

  const refrescar = useCallback(async () => {
    if (!supabaseConfigurado) return
    try {
      const { data: cuentasData, error } = await supabase!
        .from('cuenta')
        .select('id, etiqueta, creada_el')
        .eq('estado', 'abierta')
        .order('creada_el', { ascending: false })
      if (error) throw error

      // Calcular totales para cada cuenta (suma de ventas tipo 'cuenta')
      const conTotales = await Promise.all((cuentasData ?? []).map(async c => {
        const { data: ventas } = await supabase!
          .from('venta')
          .select('total_cop')
          .eq('cuenta_id', c.id)
          .eq('tipo', 'cuenta')
        const total = (ventas ?? []).reduce((sum, v) => sum + v.total_cop, 0)
        const items = (ventas ?? []).length
        return { ...c, total, items }
      }))
      setCuentas(conTotales)
    } catch (e) {
      setError('Error cargando cuentas: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { refrescar() }, [refrescar])

  // Realtime: actualizar cuando se abran/cierren cuentas o se agreguen items
  useEffect(() => {
    if (!supabaseConfigurado) return
    let canal: any = null
    canal = supabase!
      .channel('cuentas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuenta' }, () => refrescar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venta' }, () => refrescar())
      .subscribe()
    return () => { canal?.remove() }
  }, [refrescar])

  const handleCrearCuenta = async () => {
    const etiqueta = nuevaEtiqueta.trim()
    if (!etiqueta) return
    setCreando(true)
    setError(null)

    const { error } = await supabase!.rpc('fn_crear_cuenta', {
      p_etiqueta: etiqueta,
      p_operador: localStorage.getItem('operador') || ''
    })

    if (error) setError('Error: ' + error.message)
    else {
      setNuevaEtiqueta('')
      refrescar()
    }
    setCreando(false)
  }

  const handleAbrirDetalle = (cuentaId: number) => {
    // Navegar a detalle de cuenta
    // TODO: navegar a CuentaDetalle con cuentaId
    alert('TODO: navegar a detalle de cuenta ' + cuentaId)
  }

  const handleCobrar = async (cuentaId: number, total: number) => {
    if (!supabaseConfigurado) return
    const recibido = prompt(`Total a cobrar: $${total.toLocaleString()}\n¿Con cuánto paga el cliente?`, total.toString())
    if (recibido === null) return
    const recibidoNum = parseInt(recibido.replace(/\D/g, ''), 10)
    if (isNaN(recibidoNum) || recibidoNum < total) {
      alert('El monto recibido no cubre el total')
      return
    }

    const { error } = await supabase!.rpc('fn_cobrar_cuenta', {
      p_cuenta_id: cuentaId,
      p_recibido_cop: recibidoNum,
      p_client_tx_id: crypto.randomUUID(),
      p_operador: localStorage.getItem('operador') || ''
    })
    if (error) alert('Error: ' + error.message)
    else refrescar()
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
        <h1 className="font-bold text-lg">🧾 Cuentas abiertas</h1>
        <button onClick={onVolver} className="text-sm text-orange-600 font-medium">← Venta</button>
      </header>

      <main className="flex-1 p-3 space-y-4 overflow-y-auto">
        {/* Crear nueva cuenta */}
        <section className="bg-white rounded-xl p-3 shadow-sm space-y-2">
          <h2 className="font-semibold">Nueva cuenta</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevaEtiqueta}
              onChange={e => setNuevaEtiqueta(e.target.value)}
              placeholder="Ej: Mesa 1, Cliente chaqueta roja..."
              className="flex-1 rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-base focus:border-orange-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCrearCuenta}
              disabled={creando || nuevaEtiqueta.trim() === ''}
              className="rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white active:bg-orange-600 disabled:opacity-40"
            >
              {creando ? 'Creando…' : 'Crear'}
            </button>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </section>

        {/* Lista de cuentas abiertas */}
        <section>
          <h2 className="font-semibold mb-2">Cuentas abiertas ({cuentas.length})</h2>
          {cuentas.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-neutral-500">
              No hay cuentas abiertas. Crea una arriba 👆
            </div>
          ) : (
            <ul className="space-y-2">
              {cuentas.map(c => (
                <li key={c.id} className="bg-white rounded-xl p-3 shadow-sm flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-lg">{c.etiqueta}</span>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {c.items} ítem{c.items !== 1 ? 's' : ''} • Abierta {new Date(c.creada_el).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-orange-600">${c.total.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAbrirDetalle(c.id)}
                      className="rounded-xl bg-orange-50 border border-orange-200 py-3 text-base font-semibold text-orange-700 active:bg-orange-100"
                    >
                      Agregar items
                    </button>
                    <button
                      onClick={() => handleCobrar(c.id, c.total)}
                      disabled={c.total <= 0}
                      className={`rounded-xl py-3 font-semibold ${
                        c.total > 0
                          ? 'bg-green-50 border border-green-200 text-green-700 active:bg-green-100'
                          : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      Cobrar (${c.total.toLocaleString()})
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}