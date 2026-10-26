// Corte de día y zona horaria del negocio.
//
// El negocio opera en una zona horaria fija (espejo de `ajustes.zona_horaria`
// en la base de datos). TODO cálculo de "qué día es" o "a qué hora se vendió"
// debe pasar por acá, porque las tres alternativas obvias están mal:
//
//   - `toISOString()` siempre devuelve UTC: en Colombia (UTC-5) después de las
//     19:00 ya devuelve la fecha de mañana.
//   - Un filtro tipo `'2026-10-16 00:00:00'` lo interpreta Postgres en la zona
//     del servidor (UTC en Supabase) → el corte de día se corre 5 horas.
//   - `Date#getHours()` usa la zona del dispositivo: los 3 dispositivos pueden
//     estar configurados distinto y agruparían las ventas en horas distintas.

/** Zona horaria del negocio. Espejo de `ajustes.zona_horaria`. */
export const ZONA_NEGOCIO = 'America/Bogota'

type LectorPartes = (tipo: string) => number

/**
 * Devuelve un lector de los componentes de `instante` *tal como se ven en la
 * zona del negocio*. Usa `formatToParts` (no `format`) para no depender del
 * orden ni del separador que elija el locale.
 */
function leerPartes(instante: Date, opciones: Intl.DateTimeFormatOptions): LectorPartes {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_NEGOCIO,
    hourCycle: 'h23',
    ...opciones,
  }).formatToParts(instante)

  return (tipo) => Number(partes.find((p) => p.type === tipo)?.value ?? NaN)
}

const CAMPOS_FECHA_COMPLETA: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}

/** Desfase (ms) de la zona del negocio respecto a UTC en el instante dado. */
function desfaseMs(instante: Date): number {
  const p = leerPartes(instante, CAMPOS_FECHA_COMPLETA)
  const leidoComoUTC = Date.UTC(
    p('year'),
    p('month') - 1,
    p('day'),
    p('hour'),
    p('minute'),
    p('second'),
  )
  // Se trunca a segundos porque los campos leídos no tienen milisegundos.
  return leidoComoUTC - Math.floor(instante.getTime() / 1000) * 1000
}

/**
 * Instante UTC correspondiente a una hora de pared (`hh:mm:ss`) de la fecha
 * `aaaa-mm-dd` interpretada en la zona del negocio.
 *
 * Itera dos veces porque el desfase depende del instante y el instante depende
 * del desfase. Dos pasadas convergen en cualquier zona real; en zonas sin
 * cambio de horario (America/Bogota) alcanza con una.
 */
function paredEnZonaAUTC(fecha: string, horaDePared: string): Date {
  const objetivo = Date.parse(`${fecha}T${horaDePared}Z`)
  let instante = objetivo
  for (let i = 0; i < 2; i++) {
    instante = objetivo - desfaseMs(new Date(instante))
  }
  return new Date(instante)
}

/**
 * Rango medio abierto `[desde, hasta)` en UTC que cubre el día `fecha` tal como
 * se vive en la zona del negocio.
 *
 * Es medio abierto a propósito: un filtro `<= '23:59:59'` descartaría las ventas
 * del último segundo del día, porque `creada_el` es `timestamptz` con fracción
 * de segundo.
 */
export function rangoDiaZona(fecha: string): { desde: string; hasta: string } {
  return {
    desde: paredEnZonaAUTC(fecha, '00:00:00').toISOString(),
    hasta: paredEnZonaAUTC(desplazarFecha(fecha, 1), '00:00:00').toISOString(),
  }
}

/** Fecha (`aaaa-mm-dd`) de HOY según la zona del negocio. */
export function fechaHoyZona(instante: Date = new Date()): string {
  const p = leerPartes(instante, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return armarFecha(p('year'), p('month'), p('day'))
}

/** Desplaza una fecha (`aaaa-mm-dd`) en días de calendario. */
export function desplazarFecha(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Hora (0–23) del día en la zona del negocio. */
export function horaEnZona(instante: string | Date): number {
  const p = leerPartes(new Date(instante), { hour: 'numeric' })
  return p('hour')
}

/** Hora y minuto (HH:mm) del instante en la zona del negocio. */
export function horaMinutoEnZona(instante: string | Date): string {
  const p = leerPartes(new Date(instante), { hour: '2-digit', minute: '2-digit' })
  return `${String(p('hour')).padStart(2, '0')}:${String(p('minute')).padStart(2, '0')}`
}

/**
 * Fecha en palabras para mostrar al operador. Se ancla a UTC a propósito: acá
 * `fecha` es un día de calendario, no un instante, así que no debe pasar por la
 * zona del dispositivo.
 */
export function formatearFechaLarga(fecha: string): string {
  return new Date(`${fecha}T00:00:00Z`).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function armarFecha(anio: number, mes: number, dia: number): string {
  const dd = String(dia).padStart(2, '0')
  const mm = String(mes).padStart(2, '0')
  return `${anio}-${mm}-${dd}`
}
