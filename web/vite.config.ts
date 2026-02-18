import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  base: process.env.GH_PAGES === 'true' ? '/pesamirror/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(
      process.env.GH_PAGES === 'true'
        ? {
            spa: {
              enabled: true,
              prerender: {
                enabled: true,
                crawlLinks: true,
              },
            },
          }
        : {},
    ),
    viteReact(),
  ],
})

export default config
