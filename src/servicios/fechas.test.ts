import { describe, expect, it } from 'vitest'
import {
  anioMesDe,
  desplazarFecha,
  desplazarMes,
  diaSemanaPrimerDia,
  diasEnMes,
  fechaHoyZona,
  formatearFechaLarga,
  horaEnZona,
  rangoDiaZona,
  rangoMesZona,
} from './fechas'

// America/Bogota es UTC-5 todo el año (Colombia no tiene horario de verano),
// así que el día del negocio arranca a las 05:00 UTC.

describe('rangoDiaZona', () => {
  it('cubre de 00:00 a 24:00 de Bogotá, expresado en UTC', () => {
    expect(rangoDiaZona('2026-10-16')).toEqual({
      desde: '2026-10-16T05:00:00.000Z',
      hasta: '2026-10-17T05:00:00.000Z',
    })
  })

  it('es medio abierto: el inicio del día siguiente NO pertenece al día', () => {
    const { hasta } = rangoDiaZona('2026-10-16')
    const { desde } = rangoDiaZona('2026-10-17')
    expect(desde).toBe(hasta)
  })

  it('incluye una venta de las 23:30 de Bogotá en el día correcto', () => {
    // 23:30 del 15 de octubre en Bogotá = 04:30 del 16 en UTC.
    // El filtro viejo (`<= '2026-10-16 23:59:59'` en UTC) se la asignaba al 16.
    const venta = '2026-10-16T04:30:00.000Z'
    const quince = rangoDiaZona('2026-10-15')
    const dieciseis = rangoDiaZona('2026-10-16')

    expect(venta >= quince.desde && venta < quince.hasta).toBe(true)
    expect(venta >= dieciseis.desde && venta < dieciseis.hasta).toBe(false)
  })

  it('incluye hasta el último instante fraccionario del día', () => {
    // 23:59:59.500 de Bogotá el 16 = 04:59:59.500 UTC del 17.
    // Un filtro `<= '23:59:59'` perdería las ventas del último segundo,
    // porque creada_el es timestamptz con milisegundos.
    const venta = '2026-10-17T04:59:59.500Z'
    const { desde, hasta } = rangoDiaZona('2026-10-16')
    expect(venta >= desde && venta < hasta).toBe(true)
  })
})

describe('fechaHoyZona', () => {
  it('NO coincide con toISOString() después de las 19:00 de Bogotá', () => {
    // 16 oct 02:00 UTC = 15 oct 21:00 en Bogotá.
    const instante = new Date('2026-10-16T02:00:00.000Z')

    expect(instante.toISOString().slice(0, 10)).toBe('2026-10-16') // el bug viejo
    expect(fechaHoyZona(instante)).toBe('2026-10-15') // lo correcto
  })

  it('coincide con UTC cuando la hora de Bogotá ya pasó el mediodía', () => {
    const instante = new Date('2026-10-16T18:00:00.000Z') // 13:00 en Bogotá
    expect(fechaHoyZona(instante)).toBe('2026-10-16')
  })

  it('devuelve un día de calendario bien formado', () => {
    expect(fechaHoyZona()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('horaEnZona', () => {
  it('devuelve 0 en la medianoche de Bogotá (no 24)', () => {
    expect(horaEnZona('2026-10-16T05:00:00.000Z')).toBe(0)
  })

  it('convierte UTC a la hora local del negocio', () => {
    expect(horaEnZona('2026-10-16T04:00:00.000Z')).toBe(23) // 23:00 del 15
    expect(horaEnZona('2026-10-16T16:30:00.000Z')).toBe(11) // 11:30
  })

  it('agrupa una venta de fin de día en la última hora, no en la primera', () => {
    // 15 oct 23:45 Bogotá = 16 oct 04:45 UTC.
    expect(horaEnZona('2026-10-16T04:45:00.000Z')).toBe(23)
  })
})

describe('desplazarFecha', () => {
  it('avanza y retrocede un día', () => {
    expect(desplazarFecha('2026-10-16', 1)).toBe('2026-10-17')
    expect(desplazarFecha('2026-10-16', -1)).toBe('2026-10-15')
  })

  it('cruza fin de mes y fin de año', () => {
    expect(desplazarFecha('2026-10-31', 1)).toBe('2026-11-01')
    expect(desplazarFecha('2026-12-31', 1)).toBe('2027-01-01')
    expect(desplazarFecha('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('respeta el 29 de febrero de un año bisiesto', () => {
    expect(desplazarFecha('2028-02-28', 1)).toBe('2028-02-29')
    expect(desplazarFecha('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('formatearFechaLarga', () => {
  it('muestra el día de calendario recibido, sin corrimientos', () => {
    const texto = formatearFechaLarga('2026-10-16')
    expect(texto).toContain('16')
    expect(texto).toContain('octubre')
    expect(texto).toContain('2026')
  })
})

describe('rangoMesZona', () => {
  it('cubre de 00:00 del día 1 a 00:00 del día 1 del mes siguiente, en UTC', () => {
    expect(rangoMesZona(2026, 10)).toEqual({
      desde: '2026-10-01T05:00:00.000Z',
      hasta: '2026-11-01T05:00:00.000Z',
    })
  })

  it('cruza fin de año', () => {
    expect(rangoMesZona(2026, 12)).toEqual({
      desde: '2026-12-01T05:00:00.000Z',
      hasta: '2027-01-01T05:00:00.000Z',
    })
  })

  it('es medio abierto: el inicio del mes siguiente no pertenece al mes', () => {
    expect(rangoMesZona(2026, 10).hasta).toBe(rangoMesZona(2026, 11).desde)
  })
})

describe('desplazarMes', () => {
  it('avanza y retrocede un mes', () => {
    expect(desplazarMes(2026, 10, 1)).toEqual({ anio: 2026, mes: 11 })
    expect(desplazarMes(2026, 10, -1)).toEqual({ anio: 2026, mes: 9 })
  })

  it('cruza fin de año en ambos sentidos', () => {
    expect(desplazarMes(2026, 12, 1)).toEqual({ anio: 2027, mes: 1 })
    expect(desplazarMes(2026, 1, -1)).toEqual({ anio: 2025, mes: 12 })
  })
})

describe('diasEnMes', () => {
  it('devuelve la cantidad correcta de días, incluido febrero bisiesto', () => {
    expect(diasEnMes(2026, 10)).toBe(31)
    expect(diasEnMes(2026, 11)).toBe(30)
    expect(diasEnMes(2026, 2)).toBe(28)
    expect(diasEnMes(2028, 2)).toBe(29)
  })
})

describe('diaSemanaPrimerDia', () => {
  it('devuelve 0 para domingo y 4 para jueves', () => {
    // 1 de noviembre de 2026 es domingo; 1 de octubre de 2026 es jueves.
    expect(diaSemanaPrimerDia(2026, 11)).toBe(0)
    expect(diaSemanaPrimerDia(2026, 10)).toBe(4)
  })
})

describe('anioMesDe', () => {
  it('extrae año y mes de una fecha aaaa-mm-dd', () => {
    expect(anioMesDe('2026-10-27')).toEqual({ anio: 2026, mes: 10 })
  })
})
