import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levantarBaseDeDatos, type BaseDeDatosDePrueba } from './postgres.ts'

/**
 * La app llama a los RPC como rol `anon` (o `authenticated`). Si una función
 * creada por una migración no queda ejecutable para esos roles, en producción
 * falla con "permission denied for function" recién al usarla.
 */
describe('permisos de los RPC', () => {
  let bd: BaseDeDatosDePrueba

  beforeAll(async () => {
    bd = await levantarBaseDeDatos()
  }, 180_000)

  afterAll(async () => {
    await bd?.detener()
  })

  it('toda función fn_* del esquema es ejecutable por anon y authenticated', async () => {
    const { rows } = await bd.cliente.query<{ proname: string; anon: boolean; autenticado: boolean }>(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as autenticado
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'fn!_%' escape '!'
      order by p.proname
    `)

    expect(rows.map((f) => f.proname)).toContain('fn_crear_cuenta_automatica')
    expect(rows.filter((f) => !f.anon || !f.autenticado)).toEqual([])
  })
})
