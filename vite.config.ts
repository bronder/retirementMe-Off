/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    watch: {
      // Ignore editor temp/lock files (e.g. Paint.NET's *.pdnSave) so the
      // dev server doesn't crash with EBUSY when an asset is open in an
      // external editor.
      ignored: [
        '**/.*/**',
        '**/*.pdnSave',
        '**/*.tmp',
        '**/*.bak',
      ],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
