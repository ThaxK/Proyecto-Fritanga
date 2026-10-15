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
  
  // Estado para el modal de cobro
  const [cuentaCobrando, setCuentaCobrando] = useState<{ id: number; etiqueta: string; items: CuentaItem[]; total: number } | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState<string | null>(null)
  const [recibidoCobro, setRecibidoCobro] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  // Idempotencia: uuid estable por sesión de cobro; se renueva al abrir el
  // modal y tras cada éxito, para que un reintento no duplique la venta
  const [txCobro, setTxCobro] = useState(() => crypto.randomUUID())
  // Etiqueta de la cuenta en creación: estable entre reintentos
  const [etiquetaPendiente, setEtiquetaPendiente] = useState<string | null>(null)

  // Item de cuenta (para el desglose)
  interface CuentaItem {
    producto_id: number
    nombre: string
    cantidad: number
    precio_unit_cop: number
    subtotal: number
  }

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

  useEffect(() => {
    if (!supabaseConfigurado) return
    let canal: any = null
    let mounted = true

    canal = supabase!
      .channel('cuentas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuenta' }, () => {
        if (mounted) refrescar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venta' }, () => {
        if (mounted) refrescar()
      })
      .subscribe()

    return () => {
      mounted = false
      canal?.unsubscribe?.()
    }
  }, [refrescar])

  const handleCrearCuenta = async () => {
    setCreando(true)
    setError(null)

    try {
      // Generar nombre secuencial: "Cuenta 1", "Cuenta 2", ...
      // La etiqueta se conserva entre reintentos para que fn_crear_cuenta
      // deduplique por etiqueta si el intento anterior sí llegó al servidor
      const etiqueta = etiquetaPendiente ?? `Cuenta ${cuentas.length + 1}`
      if (!etiquetaPendiente) setEtiquetaPendiente(etiqueta)

      const { error } = await supabase!.rpc('fn_crear_cuenta', {
        p_etiqueta: etiqueta,
        p_operador: localStorage.getItem('operador') || ''
      })
      if (error) throw error
      setEtiquetaPendiente(null)
      refrescar()
    } catch (e) {
      setError('Error: ' + (e as Error).message)
    }
    setCreando(false)
  }

  // Navegar a VentaRapida con cuenta preseleccionada
  const handleAbrirDetalle = (cuentaId: number, etiqueta: string) => {
    window.location.hash = `#venta/${cuentaId}/${encodeURIComponent(etiqueta)}`
  }

  // Abrir modal para cobrar cuenta
  const handleAbrirCobro = async (cuentaId: number, etiqueta: string, total: number) => {
    if (!supabaseConfigurado) return
    setErrorCobro(null)
    setRecibidoCobro(total)
    // Nueva sesión de cobro → nueva clave de idempotencia
    setTxCobro(crypto.randomUUID())

    // Obtener items de la cuenta
    const { data: ventas, error } = await supabase!
      .from('venta')
      .select(`
        total_cop,
        detalle_venta (
          producto_id,
          cantidad,
          precio_unit_cop,
          subtotal_cop,
          producto:producto_id (nombre)
        )
      `)
      .eq('cuenta_id', cuentaId)
      .eq('tipo', 'cuenta')

    if (error) {
      setErrorCobro('Error cargando detalles: ' + error.message)
      return
    }

    // Aplanar items Y AGRUPAR POR PRODUCTO
    const itemsMap = new Map<number, CuentaItem>()
    ;(ventas ?? []).forEach(v => {
      ;(v.detalle_venta ?? []).forEach(d => {
        const key = d.producto_id
        const nombre = (d as any).producto?.nombre || 'Producto'
        const precio = d.precio_unit_cop
        const cantidad = d.cantidad
        const subtotal = d.subtotal_cop

        if (itemsMap.has(key)) {
          const existing = itemsMap.get(key)!
          itemsMap.set(key, {
            ...existing,
            cantidad: existing.cantidad + cantidad,
            subtotal: existing.subtotal + subtotal
          })
        } else {
          itemsMap.set(key, {
            producto_id: d.producto_id,
            nombre,
            cantidad,
            precio_unit_cop: precio,
            subtotal: d.subtotal_cop
          })
        }
      })
    })

    const items: CuentaItem[] = Array.from(itemsMap.values())
    const totalCalculado = items.reduce((s, i) => s + i.subtotal, 0)

    setCuentaCobrando({
      id: cuentaId,
      etiqueta,
      items,
      total: totalCalculado
    })
  }

  const cerrarModalCobro = () => {
    setCuentaCobrando(null)
    setRecibidoCobro(0)
    setErrorCobro(null)
  }

  // Restar un item de la cuenta antes de cobrar
  const [restando, setRestando] = useState(false)
  const handleRestarItem = async (productoId: number) => {
    if (!cuentaCobrando || restando) return
    setRestando(true)
    setErrorCobro(null)

    try {
      // Verificar cuántas hay de este producto
      const item = cuentaCobrando.items.find(i => i.producto_id === productoId)
      if (!item) return

      const { data, error } = await supabase!.rpc('fn_restar_item_cuenta', {
        p_cuenta_id: cuentaCobrando.id,
        p_producto_id: productoId,
        p_cantidad: 1
      })
      if (error) throw error

      // La cuenta quedó sin items: el RPC la eliminó en la BD
      if (data?.cuenta_eliminada) {
        const etiqueta = cuentaCobrando.etiqueta
        cerrarModalCobro()
        refrescar()
        setAviso(`"${etiqueta}" quedó vacía y fue eliminada`)
        setTimeout(() => setAviso(null), 4000)
        return
      }

      // Recalcular items locales
      const nuevosItems = cuentaCobrando.items
        .map(i => i.producto_id === productoId
          ? { ...i, cantidad: i.cantidad - 1, subtotal: (i.cantidad - 1) * i.precio_unit_cop }
          : i)
        .filter(i => i.cantidad > 0)

      const nuevoTotal = nuevosItems.reduce((s, i) => s + i.subtotal, 0)

      setCuentaCobrando({
        ...cuentaCobrando,
        items: nuevosItems,
        total: nuevoTotal
      })
      setRecibidoCobro(nuevoTotal)
    } catch (e) {
      setErrorCobro('Error: ' + (e as Error).message)
    } finally {
      setRestando(false)
    }
  }

  const handleCobrarFinal = async () => {
    if (!cuentaCobrando || cobrando) return
    const total = cuentaCobrando.total
    const recibido = recibidoCobro
    
    if (recibido < total) {
      setErrorCobro('El monto recibido no cubre el total')
      return
    }

    setCobrando(true)
    setErrorCobro(null)

    const { error } = await supabase!.rpc('fn_cobrar_cuenta', {
      p_cuenta_id: cuentaCobrando.id,
      p_recibido_cop: recibidoCobro,
      p_client_tx_id: txCobro,
      p_operador: localStorage.getItem('operador') || ''
    })

    if (error) {
      // Mantener txCobro: si el intento anterior sí llegó al servidor,
      // el reintento con el mismo uuid devuelve la venta ya registrada
      setErrorCobro('Error: ' + error.message)
    } else {
      setTxCobro(crypto.randomUUID())
      cerrarModalCobro()
      refrescar()
    }
    setCobrando(false)
  }

  // Fallback visual si hay error de render (hooks al inicio)
  const [renderError, setRenderError] = useState<Error | null>(null)

  if (cargando) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  if (renderError) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-w-md text-center">
          <h2 className="font-semibold text-red-700 mb-2">Error en Cuentas</h2>
          <pre className="text-left text-xs bg-red-100 p-2 rounded overflow-auto">{renderError.message}</pre>
          <button onClick={() => setRenderError(null)} className="mt-3 text-sm text-orange-600 underline">Reintentar</button>
        </div>
      </div>
    )
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
        {/* Aviso temporal (cuenta eliminada) */}
        {aviso && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-3 py-2 text-sm font-medium">
            ✓ {aviso}
          </div>
        )}

        {/* Crear nueva cuenta */}
        <section className="bg-white rounded-xl p-3 shadow-sm space-y-2">
          <button
            onClick={handleCrearCuenta}
            disabled={creando}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white active:bg-orange-600 disabled:opacity-40"
          >
            {creando ? 'Creando…' : `+ Nueva cuenta (Cuenta ${cuentas.length + 1})`}
          </button>
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
              {cuentas.map(c => {
                const total = typeof c.total === 'number' ? c.total : 0
                const items = typeof c.items === 'number' ? c.items : 0
                const etiqueta = c.etiqueta ?? 'Sin nombre'
                const fecha = c.creada_el ? new Date(c.creada_el).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'
                return (
                  <li key={c.id} className="bg-white rounded-xl p-3 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-lg">{etiqueta}</span>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {items} ítem{items !== 1 ? 's' : ''} • Abierta {fecha}
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-orange-600">${total.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAbrirDetalle(c.id, etiqueta)}
                        className="rounded-xl bg-orange-50 border border-orange-200 py-3 text-base font-semibold text-orange-700 active:bg-orange-100"
                      >
                        Agregar items
                      </button>
                      <button
                        onClick={() => handleAbrirCobro(c.id, etiqueta, total)}
                        disabled={total <= 0}
                        className={`rounded-xl py-3 font-semibold ${
                          total > 0
                            ? 'bg-green-50 border border-green-200 text-green-700 active:bg-green-100'
                            : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                        }`}
                      >
                        Cobrar (${total.toLocaleString()})
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {/* Modal de cobro */}
      {cuentaCobrando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header del modal */}
            <div className="flex items-center justify-between p-4 border-b bg-orange-50 rounded-t-2xl">
              <h2 className="font-bold text-lg">💳 Cobrar: {cuentaCobrando.etiqueta}</h2>
              <button onClick={cerrarModalCobro} className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none">×</button>
            </div>

            {/* Detalle de items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
              {cuentaCobrando.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 py-2 border-b last:border-0">
                  <button
                    onClick={() => handleRestarItem(item.producto_id)}
                    disabled={restando}
                    className="w-7 h-7 shrink-0 rounded-full bg-red-50 text-red-600 flex items-center justify-center active:bg-red-100 disabled:opacity-40 font-bold"
                    aria-label={`Restar ${item.nombre}`}
                  >−</button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.nombre}</div>
                    <div className="text-xs text-neutral-500">{item.cantidad} × ${item.precio_unit_cop.toLocaleString()}</div>
                  </div>
                  <span className="font-semibold text-orange-600">${item.subtotal.toLocaleString()}</span>
                </div>
              ))}
              {cuentaCobrando.items.length === 0 && (
                <p className="text-center text-neutral-500 text-sm py-4">No hay items en esta cuenta</p>
              )}
              <div className="pt-2 border-t font-bold text-right text-lg">
                Total: ${cuentaCobrando.total.toLocaleString()}
              </div>
            </div>

            {/* Pago */}
            <div className="p-4 border-t bg-orange-50 rounded-b-2xl space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-neutral-50 rounded-xl p-3">
                  <div className="text-xs text-neutral-500">TOTAL</div>
                  <div className="text-2xl font-bold text-orange-600">${cuentaCobrando.total.toLocaleString()}</div>
                </div>
                <div className="bg-neutral-50 rounded-xl p-3">
                  <div className="text-xs text-neutral-500">RECIBIDO</div>
                  <input
                    type="number"
                    min="0"
                    value={recibidoCobro}
                    onChange={e => setRecibidoCobro(e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                    className="w-full text-right text-2xl font-bold text-neutral-900 bg-transparent focus:outline-none"
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className={`rounded-xl p-3 text-center ${recibidoCobro >= cuentaCobrando?.total ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-xs text-neutral-500">CAMBIO</div>
                <div className={`text-2xl font-bold ${recibidoCobro >= cuentaCobrando?.total ? 'text-green-700' : 'text-red-700'}`}>
                  ${(recibidoCobro - cuentaCobrando?.total).toLocaleString()}
                  {recibidoCobro >= cuentaCobrando?.total ? ' 👍' : ' ❌'}
                </div>
              </div>

              {errorCobro && <p className="text-center text-red-600 text-sm">{errorCobro}</p>}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={cerrarModalCobro}
                  disabled={cobrando}
                  className="rounded-xl bg-neutral-200 py-3 text-base font-semibold text-neutral-700 active:bg-neutral-300 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCobrarFinal}
                  disabled={cobrando || recibidoCobro < cuentaCobrando?.total}
                  className={`rounded-xl py-3 text-base font-semibold ${
                    recibidoCobro >= cuentaCobrando?.total
                      ? 'bg-green-500 text-white active:bg-green-600'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  Cobrar ${recibidoCobro > 0 ? ` (cambio $${(recibidoCobro - cuentaCobrando?.total).toLocaleString()})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}