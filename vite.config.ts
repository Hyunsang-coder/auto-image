/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Logic layer only. Unit tests are `*.test.ts` under src/; Playwright owns
    // `*.spec.ts` under e2e/. The two globs never overlap.
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
  },
})
