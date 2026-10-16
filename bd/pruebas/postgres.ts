import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import { Client } from 'pg'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Archivos que se aplican, en orden, para reconstruir el esquema de producción. */
const ARCHIVOS_ESQUEMA = [
  'schema.sql',
  'migracion_imagenes.sql',
  'migracion_cuenta_vacia.sql',
  'migracion_cuenta_numero.sql',
]

export interface BaseDeDatosDePrueba {
  /** Cliente conectado a la base recién creada. */
  cliente: Client
  /** Conexión extra, para probar concurrencia desde dos sesiones distintas. */
  nuevoCliente(): Promise<Client>
  detener(): Promise<void>
}

/**
 * Levanta un PostgreSQL real (embebido) y le aplica el esquema de producción,
 * para poder probar las funciones SQL sin depender de Supabase.
 *
 * Se usa un puerto y un directorio de datos nuevos en cada llamada, así que
 * varias suites pueden correr en paralelo sin pisarse.
 */
export async function levantarBaseDeDatos(): Promise<BaseDeDatosDePrueba> {
  const puerto = 55000 + Math.floor(Math.random() * 5000)
  const directorio = join(tmpdir(), `fritanga-pg-${randomUUID()}`)

  const servidor = new EmbeddedPostgres({
    databaseDir: directorio,
    user: 'postgres',
    password: 'postgres',
    port: puerto,
    persistent: false,
    // Sin esto, en Windows initdb hereda el locale del sistema y crea la base
    // en WIN1252, que no puede almacenar los acentos ni las flechas del esquema.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // El log de Postgres es muy verboso y ensucia la salida de las pruebas.
    onLog: () => {},
  })

  await servidor.initialise()
  await servidor.start()
  await servidor.createDatabase('fritanga')

  const cliente = new Client({
    host: '127.0.0.1',
    port: puerto,
    user: 'postgres',
    password: 'postgres',
    database: 'fritanga',
  })
  await cliente.connect()

  const abiertos = [cliente]
  const conectar = async () => {
    const extra = new Client({
      host: '127.0.0.1',
      port: puerto,
      user: 'postgres',
      password: 'postgres',
      database: 'fritanga',
    })
    await extra.connect()
    abiertos.push(extra)
    return extra
  }

  // Roles que en Supabase ya existen y que el esquema usa en GRANT y RLS.
  await cliente.query('create role anon nologin; create role authenticated nologin;')

  for (const archivo of ARCHIVOS_ESQUEMA) {
    try {
      await cliente.query(readFileSync(join(RAIZ, 'bd', archivo), 'utf8'))
    } catch (error) {
      throw new Error(`Falló al aplicar bd/${archivo}: ${(error as Error).message}`)
    }
  }

  return {
    cliente,
    nuevoCliente: conectar,
    async detener() {
      for (const conexion of abiertos) {
        try {
          await conexion.end()
        } catch {
          /* ignorado a propósito */
        }
      }
      // En Windows el directorio de datos queda bloqueado unos instantes y
      // pg.stop() no alcanza a borrarlo. Es un directorio temporal: se ignora.
      try {
        await servidor.stop()
      } catch {
        /* ignorado a propósito */
      }
      try {
        rmSync(directorio, { recursive: true, force: true })
      } catch {
        /* idem */
      }
    },
  }
}
