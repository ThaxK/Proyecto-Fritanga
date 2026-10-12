import { useState, useEffect } from 'react'
import { supabase, supabaseConfigurado, avisoSinConexion } from '../servicios/supabase'

// Item de conteo: nombre, precio, cantidad inicial (editable)
interface ProductoConteo {
  id: number
  nombre: string
  precio_cop: number
  cantidad: number
}

export default function AperturaTurno({ onTurnoAbierto }: { onTurnoAbierto: () => void }) {
  const [productos, setProductos] = useState<ProductoConteo[]>([])
  const [baseInicial, setBaseInicial] = useState<number>(70000)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Cargar catálogo al montar
  useEffect(() => {
    async function cargarCatalogo() {
      if (!supabaseConfigurado) return
      const { data, error } = await supabase!
        .from('producto')
        .select('id, nombre, precio_cop, orden')
        .eq('activo', true)
        .order('orden')
      if (error) setError('Error cargando catálogo: ' + error.message)
      else if (data) {
        const inicial = data.map(p => ({
          id: p.id,
          nombre: p.nombre,
          precio_cop: p.precio_cop,
          cantidad: 0
        }))
        setProductos(inicial)
      }
      setCargando(false)
    }
    cargarCatalogo()
  }, [])

  const handleCantidadChange = (id: number, value: string) => {
    const n = value === '' ? 0 : parseInt(value, 10)
    if (isNaN(n) || n < 0) return
    setProductos(p => p.map(pr => pr.id === id ? { ...pr, cantidad: n } : pr))
  }

  const totalUnidades = productos.reduce((s, p) => s + p.cantidad, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseConfigurado) { setError(avisoSinConexion); return }
    if (totalUnidades === 0) { setError('Debes ingresar al menos 1 unidad en algún producto'); return }
    setEnviando(true)
    setError(null)

    const conteos = productos
      .filter(p => p.cantidad > 0)
      .map(p => ({ producto_id: p.id, cantidad: p.cantidad }))

    const { error } = await supabase!.rpc('fn_abrir_turno', {
      p_base_inicial_cop: baseInicial,
      p_conteos: conteos,
      p_operador: localStorage.getItem('operador') || ''
    })

    if (error) setError('No se pudo abrir el turno: ' + error.message)
    else { onTurnoAbierto() }
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
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">📅 Apertura de turno</h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm text-center" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Base de caja */}
        <div>
          <label className="block text-sm font-medium mb-1">Base de caja (cambio inicial)</label>
          <input
            type="number"
            min="0"
            step="1000"
            value={baseInicial}
            onChange={e => setBaseInicial(parseInt(e.target.value) || 0)}
            className="w-full rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-xl text-right focus:border-orange-500 focus:outline-none"
            inputMode="numeric"
          />
        </div>

        {/* Conteo por producto */}
        <fieldset>
          <legend className="block text-sm font-medium mb-2">Conteo inicial por producto (unidades)</legend>
          <div className="space-y-2">
            {productos.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                <div className="flex-1">
                  <div className="font-medium">{p.nombre}</div>
                  <div className="text-sm text-neutral-500">${p.precio_cop.toLocaleString()}</div>
                </div>
                <input
                  type="number"
                  min="0"
                  value={p.cantidad}
                  onChange={e => handleCantidadChange(p.id, e.target.value)}
                  className="w-24 rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-xl text-center focus:border-orange-500 focus:outline-none"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </fieldset>

        {/* Resumen */}
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <div className="text-sm text-orange-700">Total de unidades a contar</div>
          <div className="text-2xl font-bold text-orange-600">{totalUnidades}</div>
        </div>

        {/* Botón */}
        <button
          type="submit"
          disabled={enviando || totalUnidades === 0}
          className="w-full rounded-xl bg-orange-500 py-3 text-xl font-bold text-white active:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enviando ? 'Abriendo turno…' : 'Abrir turno'}
        </button>
      </form>
    </div>
  )
}