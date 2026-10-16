import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'

// Item en el carrito actual
interface CarritoItem {
  productoId: number
  nombre: string
  precio: number
  cantidad: number
  stockDisponible: number
}

// Producto con stock calculado
interface ProductoConStock {
  id: number
  nombre: string
  precioCop: number
  orden: number
  imagenUrl: string
  activo: boolean
  stock: number
}

// Item ya registrado en una cuenta existente (solo lectura en esta vista)
interface ItemCuentaExistente {
  producto_id: number
  nombre: string
  cantidad: number
  subtotal: number
}

interface VentaRapidaProps {
  cuentaId?: number
  cuentaEtiqueta?: string
}

export default function VentaRapida({ cuentaId, cuentaEtiqueta }: VentaRapidaProps) {
  const [productos, setProductos] = useState<ProductoConStock[]>([])
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [recibido, setRecibido] = useState(0)
  // Sin conexión no hay nada que traer: si arrancara en "cargando", la ruedita
  // giraría para siempre (el early return de abajo nunca apaga el flag).
  const [cargando, setCargando] = useState(supabaseConfigurado)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Idempotencia: uuid estable por operación de venta; se renueva SOLO tras éxito
  // para que un reintento tras corte de internet no duplique la venta
  const [txVenta, setTxVenta] = useState(() => crypto.randomUUID())
  // Operación "crear cuenta con carrito": se conserva entre reintentos
  // (etiqueta e id evitan crear cuentas huérfanas si falla el paso 2)
  const [operacionCuenta, setOperacionCuenta] = useState<
    { txCuenta: string; cuentaId: number | null; txItems: string } | null
  >(null)
  // Items que la cuenta YA tiene en la BD (solo lectura; nunca se meten en
  // el carrito porque "Agregar a la cuenta" reenviaría y los duplicaría)
  const [itemsCuenta, setItemsCuenta] = useState<ItemCuentaExistente[]>([])
  const [totalCuenta, setTotalCuenta] = useState(0)

  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const vuelto = recibido - total
  const esCuenta = cuentaId != null

  // Denominaciones de billetes
  const DENOMS = [2000, 5000, 10000, 20000, 50000]

  // Emoji por producto (nombre en minúsculas)
  const EMOJIS: Record<string, string> = {
    'empanadas': '🥟',
    'papas rellenas': '🥔',
    'marranitas': '🍌',
    'café': '☕',
    'cafe': '☕',
    'café con leche': '☕',
    'cafe con leche': '☕',
    'gaseosa': '🥤',
  }
  const emojiDe = (nombre: string) => EMOJIS[nombre.toLowerCase()] || '🍽️'

  // ----- Cargar productos + stock inicial -----
  const refrescarStock = useCallback(async () => {
    if (!supabaseConfigurado) return
    try {
      const { data, error } = await supabase!
        .from('v_stock_teorico')
        .select('producto_id, nombre, precio_cop, orden, imagen_url, inicial, vendidos, teorico')
        .order('orden')
      if (error) throw error
      const conStock = (data ?? []).map(d => ({
        id: d.producto_id,
        nombre: d.nombre,
        precioCop: d.precio_cop,
        orden: d.orden,
        imagenUrl: d.imagen_url ?? '',
        stock: d.teorico,
        activo: true
      }))
      setProductos(conStock)
    } catch (e) {
      console.error('Error cargando stock:', e)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { refrescarStock() }, [refrescarStock])

  // ----- Cargar items que la cuenta ya tiene (solo lectura) -----
  const cargarItemsCuenta = useCallback(async () => {
    if (!cuentaId) {
      setItemsCuenta([])
      setTotalCuenta(0)
      return
    }
    if (!supabaseConfigurado) return
    try {
      const { data, error } = await supabase!
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
      if (error) throw error

      // Aplanar y agrupar por producto (mismo criterio que el modal de cobro)
      const mapa = new Map<number, ItemCuentaExistente>()
      ;(data ?? []).forEach(v => {
        ;((v as any).detalle_venta ?? []).forEach((d: any) => {
          const prev = mapa.get(d.producto_id)
          if (prev) {
            mapa.set(d.producto_id, {
              ...prev,
              cantidad: prev.cantidad + d.cantidad,
              subtotal: prev.subtotal + d.subtotal_cop
            })
          } else {
            mapa.set(d.producto_id, {
              producto_id: d.producto_id,
              nombre: d.producto?.nombre || 'Producto',
              cantidad: d.cantidad,
              subtotal: d.subtotal_cop
            })
          }
        })
      })
      const items = Array.from(mapa.values())
      setItemsCuenta(items)
      setTotalCuenta(items.reduce((s, i) => s + i.subtotal, 0))
    } catch (e) {
      console.error('Error cargando items de la cuenta:', e)
    }
  }, [cuentaId])

  useEffect(() => { cargarItemsCuenta() }, [cargarItemsCuenta])

  // ----- Suscripción Realtime a ventas para actualizar stock -----
  useEffect(() => {
    if (!supabaseConfigurado) return

    const canal = supabase!
      .channel('ventas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'venta' },
        () => { refrescarStock(); cargarItemsCuenta() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'detalle_venta' },
        () => { refrescarStock(); cargarItemsCuenta() }
      )
      .subscribe()

    return () => { supabase!.removeChannel(canal) }
  }, [refrescarStock, cargarItemsCuenta])

  // ----- Handlers del carrito -----
  const agregarAlCarrito = (prod: ProductoConStock) => {
    if (prod.stock <= 0) return
    setCarrito(prev => {
      const existe = prev.find(i => i.productoId === prod.id)
      if (existe) {
        if (existe.cantidad >= prod.stock) return prev
        return prev.map(i =>
          i.productoId === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      }
      return [...prev, { productoId: prod.id, nombre: prod.nombre, precio: prod.precioCop, cantidad: 1, stockDisponible: prod.stock }]
    })
  }

  const cambiarCantidad = (id: number, delta: number) => {
    setCarrito(prev =>
      prev.map(i => {
        if (i.productoId !== id) return i
        const nueva = i.cantidad + delta
        if (nueva <= 0) return null
        const prod = productos.find(p => p.id === id)
        if (prod && nueva > prod.stock) return i
        return { ...i, cantidad: nueva }
      }).filter(Boolean) as CarritoItem[]
    )
  }

  const eliminarDelCarrito = (id: number) => {
    setCarrito(prev => prev.filter(i => i.productoId !== id))
  }

  // ----- Enviar a RPC -----
  const handleCobrar = async () => {
    if (total === 0 || enviando) return
    // recibido es opcional: si es 0 o < total, asumimos pago exacto (vuelto = 0)
    const recibidoFinal = recibido >= total ? recibido : total

    setEnviando(true)
    setError(null)

    const items = carrito.map(i => ({ producto_id: i.productoId, cantidad: i.cantidad }))

    // Si estamos en modo cuenta existente, solo registrar la venta
    if (esCuenta && cuentaId) {
      const { error } = await supabase!.rpc('fn_registrar_venta', {
        p_items: items,
        p_recibido_cop: recibidoFinal,
        p_client_tx_id: txVenta,
        p_cuenta_id: cuentaId,
        p_operador: localStorage.getItem('operador') || ''
      })
      if (error) setError('Error: ' + error.message)
      else {
        setCarrito([])
        setRecibido(0)
        setTxVenta(crypto.randomUUID())
        window.location.hash = ''
      }
      setEnviando(false)
      return
    }

    // Modo mostrador: registrar venta directa (sin cuenta)
    const { error } = await supabase!.rpc('fn_registrar_venta', {
      p_items: items,
      p_recibido_cop: recibidoFinal,
      p_client_tx_id: txVenta,
      p_cuenta_id: null,
      p_operador: localStorage.getItem('operador') || ''
    })
    if (error) setError('Error: ' + error.message)
    else {
      setCarrito([])
      setRecibido(0)
      setTxVenta(crypto.randomUUID())
    }
    setEnviando(false)
  }

  // ----- Crear cuenta con los productos del carrito -----
  const handleCrearCuenta = async () => {
    if (carrito.length === 0 || enviando) return
    setEnviando(true)
    setError(null)

    try {
      // 1. Operación idempotente: los uuid se calculan UNA vez y se reutilizan
      //    en cada reintento. El número de la cuenta lo asigna la base.
      let op = operacionCuenta
      if (!op) {
        op = {
          txCuenta: crypto.randomUUID(),
          cuentaId: null,
          txItems: crypto.randomUUID()
        }
        setOperacionCuenta(op)
      }

      // 2. Crear la cuenta (se saltea si el paso anterior ya dio el id)
      let cuentaId = op.cuentaId
      if (!cuentaId) {
        const { data: cuentaIdNueva, error: errorCuenta } = await supabase!.rpc('fn_crear_cuenta_automatica', {
          p_client_tx_id: op.txCuenta,
          p_operador: localStorage.getItem('operador') || ''
        })
        if (errorCuenta) throw errorCuenta
        cuentaId = cuentaIdNueva
        op = { ...op, cuentaId }
        setOperacionCuenta(op)
      }

      // 3. Registrar los items del carrito como venta tipo 'cuenta'
      const items = carrito.map(i => ({ producto_id: i.productoId, cantidad: i.cantidad }))
      const { error: errorVenta } = await supabase!.rpc('fn_registrar_venta', {
        p_items: items,
        p_recibido_cop: 0,
        p_client_tx_id: op.txItems,
        p_cuenta_id: cuentaId,
        p_operador: localStorage.getItem('operador') || ''
      })
      if (errorVenta) throw errorVenta

      // 4. Operación completa: la próxima empieza con valores nuevos
      setOperacionCuenta(null)
      setCarrito([])
      setRecibido(0)
      window.location.hash = ''
    } catch (e) {
      setError('Error: ' + (e as Error).message)
    }
    setEnviando(false)
  }

  if (cargando) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header compacto */}
      <header className="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          {esCuenta ? (
            <button onClick={() => window.history.back()} className="text-orange-600 font-medium text-sm">← Cuentas</button>
          ) : (
            <span></span>
          )}
          <h1 className="font-bold text-lg flex-1 text-center">
            {esCuenta ? `🧾 ${cuentaEtiqueta}` : '🛒 Venta rápida'}
          </h1>
          <div className="text-xs text-neutral-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" aria-label="Conectado"></span>
            En vivo
          </div>
        </div>
      </header>

      <main className={`flex-1 p-3 space-y-4 overflow-y-auto ${esCuenta ? 'pb-[320px]' : 'pb-[200px]'}`}>
        {/* Grid de productos */}
        <section aria-label="Productos">
          <div className="grid grid-cols-2 gap-2">
            {productos
              .filter(p => p.activo)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => agregarAlCarrito(p)}
                  disabled={p.stock <= 0}
                  className={`relative aspect-square rounded-xl border-2 font-medium transition-all ${
                    p.stock <= 0
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-400'
                      : 'bg-white border-orange-200 text-neutral-900 active:bg-orange-50'
                  }`}
                  style={{ minHeight: '88px' }}
                >
                  <div className="p-2 text-center">
                    {p.imagenUrl ? (
                      <img
                        src={p.imagenUrl}
                        alt={p.nombre}
                        loading="lazy"
                        className="w-12 h-12 mx-auto mb-1 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="text-3xl mb-1">{emojiDe(p.nombre)}</div>
                    )}
                    <div className="font-semibold text-sm">{p.nombre}</div>
                    <div className="text-sm text-orange-600 font-bold">${p.precioCop.toLocaleString()}</div>
                  </div>
                  {p.stock <= 0 && (
                    <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                      <span className="text-white font-bold text-lg">AGOTADO</span>
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 bg-neutral-900/80 text-white text-xs px-1.5 py-0.5 rounded">
                    {p.stock}
                  </div>
                </button>
              ))}
          </div>
        </section>
      </main>

      {/* Contenedor fijo inferior: Carrito + Panel de pago */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-neutral-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        {/* Items que la cuenta ya tiene (solo lectura) */}
        {esCuenta && itemsCuenta.length > 0 && (
          <section aria-label="Items ya en la cuenta" className="px-3 pt-2 space-y-1 border-b border-neutral-100">
            <h2 className="font-semibold flex justify-between text-xs text-neutral-500">
              <span>✓ Ya en {cuentaEtiqueta} ({itemsCuenta.reduce((s, i) => s + i.cantidad, 0)})</span>
              <span>${totalCuenta.toLocaleString()}</span>
            </h2>
            <ul className="space-y-1 max-h-[80px] overflow-y-auto overscroll-contain">
              {itemsCuenta.map(item => (
                <li key={item.producto_id} className="flex items-center gap-1.5 text-sm bg-neutral-50 border border-neutral-100 rounded-lg p-1.5">
                  <span className="flex-1 text-xs truncate text-neutral-500">{item.nombre} × {item.cantidad}</span>
                  <span className="w-14 shrink-0 text-right text-xs font-medium text-neutral-500">${item.subtotal.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Carrito - máximo 35dvh, scrollea si hay más */}
        {carrito.length > 0 && (
          <section aria-label="Carrito actual" className="px-3 pt-2 space-y-1 border-b border-neutral-100">
            <h2 className="font-semibold flex justify-between text-xs">
              <span>Carrito ({carrito.reduce((s, i) => s + i.cantidad, 0)})</span>
              <span className="text-orange-600 font-bold">${total.toLocaleString()}</span>
            </h2>
            <ul className="space-y-1 max-h-[120px] overflow-y-auto overscroll-contain">
              {carrito.map(item => (
                <li key={item.productoId} className="flex items-center gap-1.5 text-sm bg-neutral-50 rounded-lg p-1.5">
                  <button
                    onClick={() => cambiarCantidad(item.productoId, -1)}
                    className="w-6 h-6 shrink-0 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center active:bg-orange-200 text-sm font-bold"
                    aria-label="Quitar uno"
                  >−</button>
                  <span className="flex-1 text-center font-medium text-xs truncate">{item.nombre} × {item.cantidad}</span>
                  <span className="font-bold w-14 shrink-0 text-right text-xs">${(item.precio * item.cantidad).toLocaleString()}</span>
                  <button
                    onClick={() => cambiarCantidad(item.productoId, 1)}
                    disabled={item.cantidad >= item.stockDisponible}
                    className="w-6 h-6 shrink-0 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center active:bg-orange-200 disabled:opacity-40 text-sm font-bold"
                    aria-label="Agregar uno"
                  >+</button>
                  <button
                    onClick={() => eliminarDelCarrito(item.productoId)}
                    className="w-6 h-6 shrink-0 rounded-full bg-red-50 text-red-600 flex items-center justify-center active:bg-red-100 text-xs"
                    aria-label="Eliminar"
                  >🗑</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Panel de pago */}
        <section aria-label="Pago" className="px-3 pb-safe pt-2 space-y-2">
          {/* Fila única: TOTAL | RECIBIDO | VUELTO */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-orange-50 rounded-lg py-1.5 px-1">
              <div className="text-[10px] text-neutral-500 leading-tight">TOTAL</div>
              <div className="text-lg font-bold text-orange-600 leading-tight">${total.toLocaleString()}</div>
            </div>
            <div className="bg-neutral-50 rounded-lg py-1.5 px-1">
              <div className="text-[10px] text-neutral-500 leading-tight">RECIBIDO</div>
              <div className="text-lg font-bold text-neutral-900 leading-tight">${recibido.toLocaleString()}</div>
            </div>
            <div className={`rounded-lg py-1.5 px-1 ${vuelto >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-[10px] text-neutral-500 leading-tight">VUELTO</div>
              <div className={`text-lg font-bold leading-tight ${vuelto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ${Math.abs(vuelto).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Denominaciones */}
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Billetes rápidos">
            {DENOMS.map(d => (
              <button
                key={d}
                onClick={() => setRecibido(r => r + d)}
                className="rounded-lg bg-orange-50 border border-orange-200 py-1.5 text-sm font-semibold text-orange-700 active:bg-orange-100"
              >
                ${(d/1000).toFixed(0)}K
              </button>
            ))}
            <button
              onClick={() => setRecibido(total)}
              className="rounded-lg bg-green-50 border border-green-200 py-1.5 text-sm font-semibold text-green-700 active:bg-green-100 col-span-3"
            >
              EXACTO (${total.toLocaleString()})
            </button>
          </div>

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-1.5">
            {esCuenta ? (
              <button
                onClick={() => window.history.back()}
                className="rounded-lg bg-blue-50 border border-blue-200 py-2.5 text-sm font-semibold text-blue-700 active:bg-blue-100"
              >
                ← Cuentas
              </button>
            ) : (
              <button
                onClick={handleCrearCuenta}
                disabled={carrito.length === 0 || enviando}
                className="rounded-lg bg-blue-50 border border-blue-200 py-2.5 text-sm font-semibold text-blue-700 active:bg-blue-100 disabled:opacity-40"
              >
                {enviando ? 'Creando…' : '→ Cuenta'}
              </button>
            )}
            <button
              onClick={handleCobrar}
              disabled={total === 0 || enviando}
              className={`rounded-lg py-2.5 text-sm font-semibold ${
                total > 0
                  ? 'bg-orange-500 text-white active:bg-orange-600'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {enviando
                ? 'Procesando…'
                : esCuenta
                  ? `Agregar a la cuenta${recibido > 0 ? ` (vuelto $${(recibido - total).toLocaleString()})` : ''}`
                  : `Cobrar${recibido > 0 ? ` (vuelto $${(recibido - total).toLocaleString()})` : ''}`}
            </button>
          </div>

          {error && (
            <p className="text-center text-red-600 text-sm" role="alert">{error}</p>
          )}
        </section>
      </div>
    </div>
  )
}