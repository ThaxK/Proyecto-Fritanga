// Tipos compartidos del dominio (espejo del MER en docs/mer-tecnico.md)

export type EstadoTurno = 'abierto' | 'cerrado'
export type EstadoCuenta = 'abierta' | 'cerrada'
export type TipoVenta = 'mostrador' | 'cobro_cuenta'
export type TipoMovimiento = 'retiro' | 'entrada'

export interface Producto {
  id: number
  nombre: string
  precioCop: number
  orden: number
  activo: boolean
}

export interface Turno {
  id: number
  estado: EstadoTurno
  baseInicialCop: number
  etiquetaOperador: string
  efectivoFisicoCop: number | null
}

export interface Cuenta {
  id: number
  turnoId: number
  etiqueta: string
  estado: EstadoCuenta
}

export interface ItemVenta {
  productoId: number
  cantidad: number
}

export interface Venta {
  id: number
  turnoId: number
  cuentaId: number | null
  tipo: TipoVenta
  totalCop: number
  recibidoCop: number
  vueltoCop: number
}
