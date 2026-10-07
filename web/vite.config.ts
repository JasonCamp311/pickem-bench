import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The built site lands in ../docs next to data.json, which the CLI rewrites on
// its own schedule. Asset names are fixed and the folder is never emptied, so a
// site build and a data build cannot clobber each other.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  publicDir: false,
  build: {
    outDir: '../docs',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  // In dev, data.json comes from `node src/cli.js serve`.
  server: { proxy: { '/data.json': 'http://localhost:8490' } },
})
