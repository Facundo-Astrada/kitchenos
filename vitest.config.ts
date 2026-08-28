import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      // lib/hooks/** ya no está en bloque: los que tienen test.ts (empezando
      // por useTareas/usePermisos) suman a coverage real, el resto sigue en 0%
      // hasta que se les escriba el suyo — señal honesta, no hay que ocultarla.
      exclude: ['lib/**/*.test.ts', 'lib/supabase/**', 'lib/test-utils/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
