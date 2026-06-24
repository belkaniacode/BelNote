import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// The data-layer tests load the native better-sqlite3 binary. That binary is built for
// Electron's ABI (see postinstall), so the test runner is launched through Electron's Node
// (ELECTRON_RUN_AS_NODE=1 — see the "test" script), keeping a single native build for
// both `npm run dev` and `npm test`.
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
