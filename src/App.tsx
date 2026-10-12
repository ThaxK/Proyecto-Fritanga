import { useState, useEffect } from 'react'
import AperturaTurno from './paginas/AperturaTurno'
import Bienvenida from './paginas/Bienvenida'
import CierreCaja from './paginas/CierreCaja'
import CuentasAbiertas from './paginas/CuentasAbiertas'
import Inventario from './paginas/Inventario'
import Reportes from './paginas/Reportes'
import VentaRapida from './paginas/VentaRapida'
import { avisoSinConexion, supabaseConfigurado } from './servicios/supabase'

type Pantalla =
  | 'bienvenida'
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
  const [pantalla, setPantalla] = useState<Pantalla>('bienvenida')
  const [operador, setOperador] = useState<string | null>(() =>
    localStorage.getItem('operador')
  )
  const [turnoAbierto, setTurnoAbierto] = useState(false)

  // Verificar si hay turno abierto al cargar
  useEffect(() => {
    async function checkTurno() {
      if (!operador) return
      // Aquí podríamos consultar a Supabase si hay turno abierto,
      // pero por simplicidad usamos estado local
    }
    checkTurno()
  }, [operador])

  if (pantalla === 'bienvenida' || operador === null) {
    return (
      <Bienvenida
        onEntrar={(nombre) => {
          setOperador(nombre)
          localStorage.setItem('operador', nombre)
          setPantalla('apertura')
        }}
      />
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

      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm sticky top-0 z-10">
        <span className="font-bold">🍟 Fritanga</span>
        <span className="text-sm text-neutral-500">{operador}</span>
      </header>

      <main className="flex-1 pb-20">
        {pantalla === 'venta' && <VentaRapida onAbrirCuenta={() => setPantalla('cuentas')} />}
        {pantalla === 'cuentas' && <CuentasAbiertas onVolver={() => setPantalla('venta')} />}
        {pantalla === 'inventario' && <Inventario />}
        {pantalla === 'cierre' && <CierreCaja onVolver={() => { setPantalla('venta'); setTurnoAbierto(false); }} />}
        {pantalla === 'reportes' && <Reportes />}
        {pantalla === 'apertura' && turnoAbierto && (
          <div className="p-6 text-center">
            <p className="text-green-600 font-medium">✅ Turno ya abierto</p>
            <p className="text-sm text-neutral-500 mt-1">Usa la barra inferior para navegar</p>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 grid grid-cols-6 gap-1 bg-white p-2 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
        {PANTALLAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPantalla(p.id)}
            className={`min-h-14 rounded-xl text-xs font-semibold ${
              pantalla === p.id ? 'bg-orange-500 text-white' : 'text-neutral-600'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </nav>
    </div>
  )
}