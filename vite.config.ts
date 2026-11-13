import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'config.json'],
      manifest: {
        name: 'Rainbow English',
        short_name: 'Rainbow',
        description: 'Английский по Rainbow English 2',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F3F5FA',
        theme_color: '#2A3170',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json}'],
        navigateFallback: 'index.html'
      }
    })
  ]
})
