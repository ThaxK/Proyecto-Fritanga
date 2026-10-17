import { useState } from 'react'
import { supabase, supabaseConfigurado, avisoSinConexion } from '../servicios/supabase'

interface FormularioProductoProps {
  /** Se invoca tras crear el producto, para que el padre refresque la lista. */
  onCreado?: () => void
}

/**
 * Formulario para dar de alta un producto.
 *
 * Sigue el mismo patron de interaccion que "+ Agregar stock" de Inventario:
 * boton que despliega un formulario inline con input + Crear + cancelar,
 * y muestra el mensaje de la base si algo falla.
 *
 * La escritura va por fn_crear_producto (SECURITY DEFINER): la app no puede
 * escribir en la tabla producto directamente.
 */
export default function FormularioProducto({ onCreado }: FormularioProductoProps) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [imagenUrl, setImagenUrl] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    setNombre('')
    setPrecio('')
    setImagenUrl('')
    setError(null)
    setAbierto(true)
  }

  const cerrar = () => {
    setAbierto(false)
    setNombre('')
    setPrecio('')
    setImagenUrl('')
    setError(null)
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseConfigurado) {
      setError(avisoSinConexion)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const { error: err } = await supabase!.rpc('fn_crear_producto', {
        p_nombre: nombre,
        p_precio_cop: Number(precio),
        p_imagen_url: imagenUrl,
      })
      if (err) throw err
      setNombre('')
      setPrecio('')
      setImagenUrl('')
      setAbierto(false)
      onCreado?.()
    } catch (e) {
      setError('No se pudo crear el producto: ' + (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="space-y-2">
      {!abierto && (
        <button
          onClick={abrir}
          className="flex items-center gap-2 mt-2 w-full rounded-xl bg-orange-50 border border-orange-200 py-2 text-sm font-semibold text-orange-700 active:bg-orange-100"
        >
          + Nuevo producto
        </button>
      )}

      {abierto && (
        <>
          <form onSubmit={handleCrear} className="flex flex-col sm:flex-row sm:gap-2 gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium mb-1 text-neutral-600">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej. Arepa de huevo"
                className="w-full rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-base focus:border-orange-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="w-24 min-w-0">
              <label className="block text-xs font-medium mb-1 text-neutral-600">Precio</label>
              <input
                type="number"
                min="1"
                step="100"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-base text-right focus:border-orange-500 focus:outline-none"
                inputMode="numeric"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium mb-1 text-neutral-600">Imagen (opcional)</label>
              <input
                type="text"
                value={imagenUrl}
                onChange={e => setImagenUrl(e.target.value)}
                placeholder="URL de imagen"
                className="w-full rounded-xl border-2 border-neutral-300 bg-white px-3 py-2 text-base focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={enviando}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enviando ? '…' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-xl bg-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-300"
            >
              ✕
            </button>
          </form>

          {error && (
            <div className="bg-red-50 p-3 rounded-xl text-red-700 text-sm mt-2" role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </section>
  )
}
