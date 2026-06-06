/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves a project site under /<repo>/. The deploy workflow sets
  // GITHUB_PAGES=true; every other build (dev, Tauri, root-domain hosts) stays
  // at '/'. Tauri in particular breaks if assets are prefixed with a subpath.
  base: process.env.GITHUB_PAGES === 'true' ? '/auto-image/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    // Logic layer only. Unit tests are `*.test.ts` under src/; Playwright owns
    // `*.spec.ts` under e2e/. The two globs never overlap.
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
  },
})
