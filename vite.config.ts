/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Served at the domain root everywhere: screenshotstudio.dev (GitHub Pages
  // with a custom domain), dev, and Tauri. No subpath base needed anymore.
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // MPA: static landing at /, the React app at /app/.
      input: {
        landing: 'index.html',
        app: 'app/index.html',
      },
    },
  },
  test: {
    // Logic layer only. Unit tests are `*.test.ts` under src/; Playwright owns
    // `*.spec.ts` under e2e/. The two globs never overlap.
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
  },
})
