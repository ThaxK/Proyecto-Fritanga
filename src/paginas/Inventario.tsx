// Pantalla 4: inventario — teórico vs vendido en tiempo real (RF2)
// Se implementa en el Paso 4 con Supabase (vista stock_teorico + Realtime)
export default function Inventario() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">Inventario</h2>
      <p className="mt-2 text-neutral-600">
        Stock teórico por producto, actualizado en los 3 dispositivos al instante.
      </p>
      <p className="mt-4 rounded-xl bg-white p-4 text-neutral-500">
        Pendiente (Paso 4): tabla de productos con inicial, vendidos y restantes.
      </p>
    </div>
  )
}
