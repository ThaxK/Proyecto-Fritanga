import { useState, useEffect, useCallback } from 'react'
import { cargarDiasConVentas, type DiaConVentas } from '../servicios/reportes'
import {
  anioMesDe,
  desplazarMes,
  diasEnMes,
  diaSemanaPrimerDia,
  formatearFechaLarga,
} from '../servicios/fechas'

interface CalendarioVentasProps {
  fechaSeleccionada: string
  onSeleccionar: (fecha: string) => void
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Monto abreviado para que quepa en la celda del día: $45k, $1,2M. */
function montoAbreviado(monto: number): string {
  if (monto >= 1_000_000) return `$${(monto / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (monto >= 1000) return `$${Math.round(monto / 1000)}k`
  return `$${monto}`
}

/**
 * Selector de fecha con calendario propio. A diferencia del `<input type="date">`
 * nativo, permite marcar los días que tuvieron ventas y mostrar el monto.
 */
export default function CalendarioVentas({
  fechaSeleccionada,
  onSeleccionar,
}: CalendarioVentasProps) {
  const [abierto, setAbierto] = useState(false)
  const [mesVisible, setMesVisible] = useState(() => anioMesDe(fechaSeleccionada))
  const [dias, setDias] = useState<Map<string, DiaConVentas>>(new Map())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setDias(await cargarDiasConVentas(mesVisible.anio, mesVisible.mes))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [mesVisible.anio, mesVisible.mes])

  // Al abrir, arrancar en el mes de la fecha seleccionada y traer sus días.
  useEffect(() => {
    if (!abierto) return
    setMesVisible(anioMesDe(fechaSeleccionada))
  }, [abierto, fechaSeleccionada])

  useEffect(() => {
    if (abierto) cargar()
  }, [abierto, cargar])

  const moverMes = (delta: number) =>
    setMesVisible((m) => desplazarMes(m.anio, m.mes, delta))

  const totalDias = diasEnMes(mesVisible.anio, mesVisible.mes)
  // La grilla empieza el lunes: 0 = lunes … 6 = domingo.
  const celdasVacias = (diaSemanaPrimerDia(mesVisible.anio, mesVisible.mes) + 6) % 7
  const celdas: (number | null)[] = Array.from(
    { length: celdasVacias + totalDias },
    (_, i) => {
      const dia = i - celdasVacias + 1
      return dia >= 1 && dia <= totalDias ? dia : null
    },
  )

  const fechaDe = (dia: number) =>
    `${mesVisible.anio}-${String(mesVisible.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

  const seleccionar = (dia: number) => {
    onSeleccionar(fechaDe(dia))
    setAbierto(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-label="Elegir fecha"
        className="rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 focus:border-orange-500 focus:outline-none"
      >
        📅 {formatearFechaLarga(fechaSeleccionada)}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => moverMes(-1)}
                aria-label="Mes anterior"
                className="rounded-lg px-2 py-1 text-neutral-600 active:bg-neutral-100"
              >
                ←
              </button>
              <span className="font-semibold capitalize">
                {NOMBRES_MES[mesVisible.mes - 1]} {mesVisible.anio}
              </span>
              <button
                onClick={() => moverMes(1)}
                aria-label="Mes siguiente"
                className="rounded-lg px-2 py-1 text-neutral-600 active:bg-neutral-100"
              >
                →
              </button>
            </div>

            {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
            {cargando && <p className="mb-1 text-xs text-neutral-500">Cargando…</p>}

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
              {DIAS_SEMANA.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {celdas.map((dia, i) => {
                if (dia === null) return <span key={`vacio-${i}`} />
                const fecha = fechaDe(dia)
                const info = dias.get(fecha)
                const seleccionado = fecha === fechaSeleccionada
                return (
                  <button
                    key={fecha}
                    onClick={() => seleccionar(dia)}
                    className={`rounded-lg p-1 text-center leading-tight ${
                      seleccionado
                        ? 'bg-orange-500 text-white'
                        : info
                          ? 'bg-orange-50 text-orange-700'
                          : 'text-neutral-700 active:bg-neutral-100'
                    }`}
                  >
                    <span className="block text-sm font-medium">{dia}</span>
                    {info && (
                      <span
                        className={`block text-[10px] ${
                          seleccionado ? 'text-white/90' : 'text-orange-600'
                        }`}
                      >
                        {montoAbreviado(info.total)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
