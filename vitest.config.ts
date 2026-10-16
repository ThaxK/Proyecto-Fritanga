import { defineConfig } from 'vitest/config'

// Config propia (tiene prioridad sobre vite.config.ts) para no cargar los
// plugins de React y Tailwind: las pruebas corren en Node, sin navegador.
export default defineConfig({
  test: {
    environment: 'node',
    // Levantar el PostgreSQL embebido tarda unos segundos la primera vez.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
})
