import { useState } from 'react'

// Pantalla 0: el operador escribe su nombre (texto libre, se guarda en el dispositivo)
export default function Bienvenida({ onEntrar }: { onEntrar: (operador: string) => void }) {
  const [nombre, setNombre] = useState('')

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">🍟 Fritanga</h1>
      <p className="text-neutral-600">¿Quién está operando el mostrador?</p>
      <input
        className="w-full max-w-sm rounded-2xl border-2 border-neutral-300 bg-white p-4 text-xl text-center focus:border-orange-500 focus:outline-none"
        placeholder="Nombre del operador"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        autoFocus
      />
      <button
        className="w-full max-w-sm rounded-2xl bg-orange-500 p-4 text-xl font-bold text-white active:bg-orange-600 disabled:opacity-40"
        disabled={nombre.trim() === ''}
        onClick={() => onEntrar(nombre.trim())}
      >
        Entrar
      </button>
    </div>
  )
}
