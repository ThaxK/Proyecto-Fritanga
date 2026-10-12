// Pantalla 6: reportes — ventas por producto y por hora del turno (roadmap)
// Se implementa en el Paso 4 con la vista v_reporte_turno
export default function Reportes() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">Reportes</h2>
      <p className="mt-2 text-neutral-600">
        Ventas por producto, totales del turno y histórico de cierres.
      </p>
      <p className="mt-4 rounded-xl bg-white p-4 text-neutral-500">
        Pendiente (Paso 4): resumen del turno actual y de turnos anteriores.
      </p>
    </div>
  )
}
