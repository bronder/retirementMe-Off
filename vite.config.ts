/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Group the charting stack into ONE shared async chunk. The chart
        // views are lazily loaded (see App.tsx); without this, rollup could
        // split recharts + its d3 dependencies across several panel chunks
        // or duplicate them. react/react-dom stay in the main chunk by
        // default, so they aren't re-downloaded with the charts.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (
              id.includes('recharts') ||
              id.includes('d3-') ||
              id.includes('victory-vendor') ||
              id.includes('react-smooth')
            ) {
              return 'charts'
            }
          }
        },
      },
    },
  },
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
