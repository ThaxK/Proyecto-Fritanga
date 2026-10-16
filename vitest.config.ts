import { defineConfig } from 'vitest/config'

// Config propia (tiene prioridad sobre vite.config.ts) para no cargar los
// plugins de React y Tailwind: las pruebas corren en Node, sin navegador.
export default defineConfig({
  test: {
    environment: 'node',
    // Las pruebas de interfaz son de Playwright (npm run test:ui), no de
    // vitest: sin esto vitest intentaría correr los .spec.ts de e2e/.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // Levantar el PostgreSQL embebido tarda unos segundos la primera vez.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
})
