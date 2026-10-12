import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente de Supabase: se configura con las variables de entorno.
// Copia .env.example a .env.local y rellena los valores del proyecto Supabase.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const claveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado: boolean = Boolean(url && claveAnon)

export const supabase: SupabaseClient | null = supabaseConfigurado
  ? createClient(url!, claveAnon!)
  : null

// Aviso en pantalla mientras no haya proyecto Supabase conectado (Paso 3)
export const avisoSinConexion =
  'Sin conexión a Supabase: crea .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).'
