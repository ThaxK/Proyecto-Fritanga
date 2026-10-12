import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigurado } from '../servicios/supabase'

// Item de conteo físico
interface ConteoFisicoItem {
  productoId: number
  nombre: string
  teorico: number
  fisico: number
  diferencia: number
}

// Datos del cierre
interface CierreData {
  turnoId: number
  baseInicial: number
  ventasEfectivo: number
  retiros: number
  entradas: number
  dineroEsperado: number
  efectivoFisico: number
  diferencia: number
  mermas: ConteoFisicoItem[]
  abierto_el: string
}

export default function CierreCaja({ onVolver }: { onVolver: () => void }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [cierre, setCierre] = useState<CierreData | null>(null)
  const [conteosFisicos, setConteosFisicos] = useState<Record<number, number>>({})
  const [efectivoFisico, setEfectivoFisico] = useState(0)
  const [paso, setPaso] = useState<'conteo' | 'efectivo' | 'resumen'>('conteo')

  // ----- Handlers (definidos una sola vez al inicio) -----
  const handleFisicoChange = (productoId: number, value: string) => {
    const n = value === '' ? 0 : parseInt(value, 10)
    if (isNaN(n) || n < 0) return
    setConteosFisicos(prev => ({ ...prev, [productoId]: n }))
  }

  const handleEfectivoChange = (value: string) => {
    const n = value === '' ? 0 : parseInt(value, 10)
    if (isNaN(n) || n < 0) return
    setEfectivoFisico(n)
  }

  const siguiente = () => {
    if (paso === 'conteo') setPaso('efectivo')
    else if (paso === 'efectivo') setPaso('resumen')
  }

  const anterior = () => {
    if (paso === 'efectivo') setPaso('conteo')
    else if (paso === 'resumen') setPaso('efectivo')
  }

const handleCerrar = async () => {
    if (!supabaseConfigurado || !cierre) return
    setEnviando(true)
    setError(null)

const conteos = cierre.mermas.map(m => ({
      producto_id: m.productoId,
      cantidad: conteosFisicos[m.productoId] ?? 0
    }));

    const { error } = await supabase!.rpc('fn_cerrar_turno', {
      p_conteos_fisicos: conteos,
      p_efectivo_fisico_cop: efectivoFisico,
      p_notas: ''
    })

    if (error) setError('Error cerrando turno: ' + error.message)
    else onVolver()
    setEnviando(false)
  };

  // ----- Lógica de datos -----
const refrescar = useCallback(async () => {
    if (!supabaseConfigurado) return
    try {
      const { data: turnos, error: tErr } = await supabase!
        .from('turno')
        .select('id, base_inicial_cop, abierto_el')
        .eq('estado', 'abierto')
        .order('id', { ascending: false })
        .limit(1)
      if (tErr) {
        console.error('Error consultando turno:', JSON.stringify(tErr, null, 2))
        throw tErr
      }
      if (!turnos || turnos.length === 0) {
        console.log('No hay turno abierto')
        setCierre(null)
        return
      }
      const t = turnos[0]
      const { data: mermasData, error: mErr } = await supabase!
        .from('v_stock_teorico')
        .select('producto_id, nombre, inicial, vendidos, teorico')
        .order('orden')
      if (mErr) throw mErr

      const [{ data: ventasEf, error: vErr }, { data: movs, error: mErr2 }] = await Promise.all([
        supabase!.from('venta')
          .select('total_cop, tipo')
          .eq('turno_id', t.id)
          .in('tipo', ['mostrador', 'cobro_cuenta']),
        supabase!.from('movimiento_caja')
          .select('tipo, monto_cop')
          .eq('turno_id', t.id)
      ])
      if (vErr) throw vErr
      if (mErr2) throw mErr2

      const ventasEfectivo = (ventasEf ?? []).reduce((s, v) => s + v.total_cop, 0)
      const retiros = (movs ?? []).filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto_cop, 0)
      const entradas = (movs ?? []).filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto_cop, 0)

      const dineroEsperado = t.base_inicial_cop + ventasEfectivo - retiros + entradas

      const mermas = (mermasData ?? []).map(m => ({
        productoId: m.producto_id,
        nombre: m.nombre,
        teorico: m.teorico,
        fisico: 0,
        diferencia: 0
      }))

      setCierre({
        turnoId: t.id,
        baseInicial: t.base_inicial_cop,
        ventasEfectivo,
        retiros,
        entradas,
        dineroEsperado,
        efectivoFisico: 0,
diferencia: 0,
        mermas,
        abierto_el: t.abierto_el
      })
    } catch (e) {
      setError('Error cargando datos de cierre: ' + (e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { refrescar() }, [refrescar])

  useEffect(() => {
    if (!supabaseConfigurado || !cierre) return
    let mounted = true
    let canal: any = null

    // IMPORTANTE: agregar callbacks ANTES de subscribe()
    canal = supabase!
      .channel('cierre-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venta' }, () => {
        if (mounted) refrescar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimiento_caja' }, () => {
        if (mounted) refrescar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_venta' }, () => {
        if (mounted) refrescar()
      })
      .subscribe()

    return () => {
      mounted = false
      if (canal && typeof canal.unsubscribe === 'function') {
        canal.unsubscribe()
      }
    }
  }, [refrescar, cierre])

  // Early returns
  if (cargando) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  if (!cierre) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-neutral-500">No hay turno abierto para cerrar</p>
          <button onClick={onVolver} className="mt-4 text-orange-600 font-medium">← Volver</button>
        </div>
      </div>
    )
  }

  // Valores computados para render
  const mermasActualizadas = cierre.mermas.map(m => {
    const fisico = conteosFisicos[m.productoId] ?? 0
    return { ...m, fisico, diferencia: fisico - m.teorico }
  })
  const diferenciaCaja = efectivoFisico - cierre.dineroEsperado

  // ----- Render -----
  return (
    <div className="flex flex-col min-h-full pb-24">
      <header className="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm flex items-center justify-between">
        <h1 className="font-bold text-lg">💵 Cierre de caja</h1>
        <div className="text-xs text-neutral-500">
          Paso {paso === 'conteo' ? 1 : paso === 'efectivo' ? 2 : 3} de 3
        </div>
      </header>

      <main className="flex-1 p-3 space-y-4 overflow-y-auto">
        {error && (
          <div className="bg-red-50 p-3 rounded-xl text-red-700 text-sm" role="alert">{error}</div>
        )}

        {/* Paso 1: Conteo físico de productos */}
        {paso === 'conteo' && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">1️⃣ Conteo físico de productos</h2>
              <span className="text-xs text-neutral-500">Teórico → Físico = Diferencia</span>
            </div>
            <p className="text-xs text-neutral-500">Ingresa lo que contaste físicamente. 0 es válido.</p>

            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {cierre.mermas.map(m => {
                const fisico = conteosFisicos[m.productoId] ?? 0
                const diff = fisico - m.teorico
                return (
                  <li key={m.productoId} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{m.nombre}</div>
                      <div className="text-xs text-neutral-500 flex gap-4">
                        <span>Teórico: <span className="font-mono font-medium">{m.teorico}</span></span>
                        <span className={diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : ''}>
                          Diff: <span className="font-mono font-medium">{diff >= 0 ? '+' : ''}{diff}</span>
                        </span>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={conteosFisicos[m.productoId] ?? ''}
                      onChange={e => handleFisicoChange(m.productoId, e.target.value)}
                      className="w-24 rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-xl text-center focus:border-orange-500 focus:outline-none"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </li>
                )
              })}
            </ul>

            <div className="bg-neutral-50 rounded-xl p-3 text-center">
              <div className="text-xs text-neutral-500">Productos con merma</div>
              <div className="text-2xl font-bold text-red-600">{mermasActualizadas.filter(m => m.diferencia < 0).length}</div>
            </div>

            <button onClick={siguiente} className="w-full rounded-xl bg-orange-500 py-3 text-xl font-bold text-white active:bg-orange-600">
              Siguiente: Efectivo →
            </button>
          </section>
        )}

        {/* Paso 2: Conteo de efectivo */}
        {paso === 'efectivo' && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">2️⃣ Conteo de efectivo en caja</h2>
              <button onClick={anterior} className="text-sm text-orange-600">← Volver</button>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-3 border border-orange-200">
              <h3 className="font-semibold text-center">Dinero esperado</h3>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-neutral-50 rounded-xl p-2"><div className="text-xs text-neutral-500">Base inicial</div><div className="font-bold">${cierre.baseInicial.toLocaleString()}</div></div>
                <div className="bg-neutral-50 rounded-xl p-2"><div className="text-xs text-neutral-500">Ventas efectivo</div><div className="font-bold text-green-700">${cierre.ventasEfectivo.toLocaleString()}</div></div>
                <div className="bg-neutral-50 rounded-xl p-2"><div className="text-xs text-neutral-500">Retiros</div><div className="font-bold text-red-700">${cierre.retiros.toLocaleString()}</div></div>
                <div className="bg-neutral-50 rounded-xl p-2"><div className="text-xs text-neutral-500">Entradas</div><div className="font-bold text-green-700">${cierre.entradas.toLocaleString()}</div></div>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <div className="text-xs text-orange-700">ESPERADO EN CAJA</div>
                <div className="text-3xl font-bold text-orange-600">${cierre.dineroEsperado.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-sm space-y-3">
              <h3 className="font-semibold text-center">Conteo físico del efectivo</h3>
              <input
                type="number"
                min="0"
                value={efectivoFisico === 0 ? '' : efectivoFisico}
                onChange={e => handleEfectivoChange(e.target.value)}
                className="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-4 text-3xl text-center font-bold focus:border-orange-500 focus:outline-none"
                inputMode="numeric"
                placeholder="0"
              />
              <div className={`rounded-xl p-3 text-center ${diferenciaCaja >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-xs text-neutral-500">DIFERENCIA (Físico − Esperado)</div>
                <div className={`text-3xl font-bold ${diferenciaCaja >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${Math.abs(diferenciaCaja).toLocaleString()} {diferenciaCaja >= 0 ? '⬆ Sobrante' : '⬇ Faltante'}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={anterior} className="flex-1 rounded-xl bg-neutral-200 py-3 text-base font-semibold text-neutral-700 active:bg-neutral-300">
                ← Atrás
              </button>
              <button onClick={siguiente} className="flex-1 rounded-xl bg-orange-500 py-3 text-xl font-bold text-white active:bg-orange-600">
                Ver resumen →
              </button>
            </div>
          </section>
        )}

        {/* Paso 3: Resumen final */}
        {paso === 'resumen' && (
          <section className="bg-white rounded-xl p-3 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">3️⃣ Resumen de cierre</h2>
              <button onClick={anterior} className="text-sm text-orange-600">← Atrás</button>
            </div>

            {/* Cuadre de caja */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-orange-200 space-y-2">
              <h3 className="font-semibold text-center border-b pb-2">CUADRE DE CAJA</h3>
              <div className="grid grid-cols-2 gap-1 text-sm">
                <span>Base inicial</span><span className="text-right font-medium">${cierre.baseInicial.toLocaleString()}</span>
                <span>+ Ventas efectivo</span><span className="text-right font-medium text-green-700">+${cierre.ventasEfectivo.toLocaleString()}</span>
                <span>− Retiros</span><span className="text-right font-medium text-red-700">−${cierre.retiros.toLocaleString()}</span>
                <span>+ Entradas</span><span className="text-right font-medium text-green-700">+${cierre.entradas.toLocaleString()}</span>
                <hr className="col-span-2" />
                <span className="font-semibold">= ESPERADO</span><span className="text-right font-bold text-orange-600">${cierre.dineroEsperado.toLocaleString()}</span>
                <span className="font-semibold">Físico contado</span><span className="text-right font-bold">${efectivoFisico.toLocaleString()}</span>
                <hr className="col-span-2" />
                <span className="font-semibold">= DIFERENCIA</span>
                <span className={`text-right font-bold ${diferenciaCaja >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${Math.abs(diferenciaCaja).toLocaleString()} {diferenciaCaja >= 0 ? 'Sobrante' : 'Faltante'}
                </span>
              </div>
            </div>

            {/* Mermas */}
            <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
              <h3 className="font-semibold">Mermas por producto</h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500 border-b">
                      <th className="pb-1">Producto</th>
                      <th className="pb-1 text-right">Teórico</th>
                      <th className="pb-1 text-right">Físico</th>
                      <th className="pb-1 text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mermasActualizadas
                      .filter(m => m.diferencia !== 0)
                      .map(m => (
                        <tr key={m.productoId} className="border-b border-neutral-100">
                          <td className="py-1">{m.nombre}</td>
                          <td className="py-1 text-right font-mono">{m.teorico}</td>
                          <td className="py-1 text-right font-mono">{m.fisico}</td>
                          <td className={`py-1 text-right font-mono font-bold ${m.diferencia < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {m.diferencia >= 0 ? '+' : ''}{m.diferencia}
                          </td>
                        </tr>
                      ))}
                    {mermasActualizadas.filter(m => m.diferencia === 0).length === mermasActualizadas.length && (
                      <tr><td colSpan={4} className="py-4 text-center text-neutral-500">Sin mermas 🎉</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="text-center text-red-600 text-sm" role="alert">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={anterior} className="flex-1 rounded-xl bg-neutral-200 py-3 text-base font-semibold text-neutral-700 active:bg-neutral-300">
                ← Atrás
              </button>
              <button
                onClick={handleCerrar}
                disabled={enviando}
                className="flex-1 rounded-xl bg-green-500 py-3 text-xl font-bold text-white active:bg-green-600 disabled:opacity-40"
              >
                {enviando ? 'Cerrando turno…' : '✅ CERRAR TURNO'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}