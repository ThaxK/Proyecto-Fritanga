import { useState, useEffect } from 'react'
import AperturaTurno from './paginas/AperturaTurno'
import CierreCaja from './paginas/CierreCaja'
import CuentasAbiertas from './paginas/CuentasAbiertas'
import Inventario from './paginas/Inventario'
import Reportes from './paginas/Reportes'
import VentaRapida from './paginas/VentaRapida'
import { avisoSinConexion, supabaseConfigurado, supabase } from './servicios/supabase'

type Pantalla =
  | 'apertura'
  | 'venta'
  | 'cuentas'
  | 'inventario'
  | 'cierre'
  | 'reportes'

const PANTALLAS: { id: Pantalla; etiqueta: string }[] = [
  { id: 'venta', etiqueta: '🛒 Venta' },
  { id: 'cuentas', etiqueta: '🧾 Cuentas' },
  { id: 'inventario', etiqueta: '📦 Inventario' },
  { id: 'apertura', etiqueta: '📅 Turno' },
  { id: 'cierre', etiqueta: '💵 Cierre' },
  { id: 'reportes', etiqueta: '📊 Reportes' },
]

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('apertura')
  const [turnoAbierto, setTurnoAbierto] = useState(false)
  const [verificandoTurno, setVerificandoTurno] = useState(true)
  const [cuentaId, setCuentaId] = useState<number | null>(null)
  const [cuentaEtiqueta, setCuentaEtiqueta] = useState<string | null>(null)

  // Verificar si hay turno abierto en BD al cargar
  useEffect(() => {
    async function checkTurno() {
      if (!supabaseConfigurado) {
        setVerificandoTurno(false)
        return
      }
      try {
        const { data, error } = await supabase!
          .from('turno')
          .select('id')
          .eq('estado', 'abierto')
          .order('id', { ascending: false })
          .limit(1)
        if (!error && data && data.length > 0) {
          setTurnoAbierto(true)
          if (!cuentaId) setPantalla('venta')
        } else {
          setTurnoAbierto(false)
          setPantalla('apertura')
        }
      } catch {
        setTurnoAbierto(false)
        setPantalla('apertura')
      } finally {
        setVerificandoTurno(false)
      }
    }
    checkTurno()
  }, [])

  // Manejar hash para navegación a cuenta específica
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.startsWith('#venta/')) {
        const parts = hash.slice(7).split('/')
        const id = parseInt(parts[0], 10)
        const etiqueta = parts[1] ? decodeURIComponent(parts[1]) : ''
        if (!isNaN(id)) {
          setCuentaId(id)
          setCuentaEtiqueta(etiqueta)
          setPantalla('venta')
        }
      } else {
        setCuentaId(null)
        setCuentaEtiqueta(null)
      }
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (verificandoTurno) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    )
  }

  if (pantalla === 'apertura' && !turnoAbierto) {
    return (
      <AperturaTurno
        onTurnoAbierto={() => {
          setTurnoAbierto(true)
          setPantalla('venta')
        }}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {!supabaseConfigurado && (
        <p className="bg-yellow-100 p-2 text-center text-sm text-yellow-800">
          {avisoSinConexion}
        </p>
      )}

      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm sticky top-0 z-20">
        <span className="font-bold">🍟 Fritanga</span>
        <span className="text-sm text-neutral-500">
          {new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </header>

      <nav className="sticky top-14 z-15 bg-white border-b border-neutral-200 px-2 py-1 shadow-sm">
        <div className="overflow-x-auto flex gap-1 pb-1 -mx-2 px-2">
          {PANTALLAS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPantalla(p.id)
                window.location.hash = ''
                setCuentaId(null)
                setCuentaEtiqueta(null)
              }}
              className={`flex-shrink-0 min-w-[80px] max-w-[120px] rounded-xl text-xs font-semibold py-2 px-3 whitespace-nowrap ${
                pantalla === p.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-neutral-600 active:bg-neutral-100'
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 pb-20">
        {pantalla === 'venta' && <VentaRapida 
          onAbrirCuenta={() => { setPantalla('cuentas'); window.location.hash = ''; setCuentaId(null); setCuentaEtiqueta(null); }}
          cuentaId={cuentaId ?? undefined}
          cuentaEtiqueta={cuentaEtiqueta ?? undefined}
        />}
        {pantalla === 'cuentas' && <CuentasAbiertas onVolver={() => { setPantalla('venta'); window.location.hash = ''; setCuentaId(null); setCuentaEtiqueta(null); }} />}
        {pantalla === 'inventario' && <Inventario />}
        {pantalla === 'cierre' && <CierreCaja onVolver={() => { setPantalla('apertura'); setTurnoAbierto(false); }} />}
        {pantalla === 'reportes' && <Reportes />}
        {pantalla === 'apertura' && turnoAbierto && (
          <div className="p-6 text-center">
            <p className="text-green-600 font-medium">✅ Turno ya abierto</p>
            <p className="text-sm text-neutral-500 mt-1">Usa la barra superior para navegar</p>
          </div>
        )}
      </main>
    </div>
  )
}
