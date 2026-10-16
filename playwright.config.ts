import { defineConfig } from '@playwright/test'

const PUERTO_SIN_CONFIG = 4173
const PUERTO_CON_MOCK = 4174

/**
 * Dos servidores, a propósito:
 *
 * - 4173 corre la app SIN configuración de Supabase (el caso que dejaba la
 *   ruedita girando para siempre).
 * - 4174 corre la app apuntando a un Supabase falso, para probar las pantallas
 *   contra respuestas simuladas.
 *
 * En ninguno de los dos se usa tu `.env.local`: las variables de entorno pisan
 * a los archivos .env, así que tu proyecto real de Supabase no se toca.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // La app es para Colombia: sin esto los precios y las horas dependen del
    // locale y la zona de la máquina donde corran las pruebas.
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },
  webServer: [
    {
      command: `vite --port ${PUERTO_SIN_CONFIG} --strictPort`,
      port: PUERTO_SIN_CONFIG,
      reuseExistingServer: !process.env.CI,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
    {
      command: `vite --port ${PUERTO_CON_MOCK} --strictPort`,
      port: PUERTO_CON_MOCK,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: 'https://supabase-de-prueba.invalid',
        VITE_SUPABASE_ANON_KEY: 'clave-de-prueba',
      },
    },
  ],
  projects: [
    {
      name: 'sin-config',
      testMatch: /sin-config\.spec\.ts/,
      use: { baseURL: `http://localhost:${PUERTO_SIN_CONFIG}` },
    },
    {
      name: 'con-mock',
      testMatch: /(catalogo|cuentas)\.spec\.ts/,
      use: { baseURL: `http://localhost:${PUERTO_CON_MOCK}` },
    },
  ],
})
