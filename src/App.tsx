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
  const [pantalla, setPantalla] = useState<Pantalla>('reportes')
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
          setPantalla('venta')
        } else {
          setTurnoAbierto(false)
          setPantalla('reportes')
        }
      } catch {
        setTurnoAbierto(false)
        setPantalla('reportes')
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


  return (
    <div className="flex min-h-full flex-col">
      {!supabaseConfigurado && (
        <p className="bg-yellow-100 p-2 text-center text-sm text-yellow-800">
          {avisoSinConexion}
        </p>
      )}

      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm sticky top-0 z-20">
        <span className="font-bold">🍟 Fritanga</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">
            {new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-bold ${
              turnoAbierto
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {turnoAbierto ? '🟢 Turno abierto' : '🔴 Turno cerrado'}
          </span>
        </div>
      </header>

      <nav className="sticky top-14 z-15 bg-white border-b border-neutral-200 px-2 py-1 shadow-sm">
        <div className="overflow-x-auto flex gap-1 pb-1 -mx-2 px-2">
          {PANTALLAS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if ((p.id === 'venta' || p.id === 'cuentas') && !turnoAbierto) return
                setPantalla(p.id)
                window.location.hash = ''
                setCuentaId(null)
                setCuentaEtiqueta(null)
              }}
              disabled={!turnoAbierto && (p.id === 'venta' || p.id === 'cuentas')}
              className={`flex-shrink-0 min-w-[80px] max-w-[120px] rounded-xl text-xs font-semibold py-2 px-3 whitespace-nowrap ${
                pantalla === p.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : !turnoAbierto && (p.id === 'venta' || p.id === 'cuentas')
                  ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  : 'text-neutral-600 active:bg-neutral-100'
              }`}
            >
              {p.etiqueta}
              {!turnoAbierto && (p.id === 'venta' || p.id === 'cuentas') && ' ⚠️'}
            </button>
          ))}
        </div>
      </nav>

      {!turnoAbierto && (
        <div className="bg-yellow-50 border border-yellow-200 p-3 text-center">
          <p className="text-sm text-yellow-800 font-medium">No hay turno abierto</p>
          <button
            onClick={() => setPantalla('apertura')}
            className="mt-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white active:bg-orange-600"
          >
            Iniciar turno
          </button>
        </div>
      )}

      <main className="flex-1 pb-20">
        {pantalla === 'venta' && <VentaRapida 
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
        {pantalla === 'apertura' && !turnoAbierto && (
          <AperturaTurno
            onTurnoAbierto={() => {
              setTurnoAbierto(true)
              setPantalla('venta')
            }}
          />
        )}
      </main>
    </div>
  )
}
