/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
