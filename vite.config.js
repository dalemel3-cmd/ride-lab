import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app updates itself in the background; a rider should never have to
      // think about versions.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Ride Lab',
        short_name: 'Ride Lab',
        description: 'Cycling case study: rides, RPE, heart rate, body composition, journal.',
        theme_color: '#0b1a2b',
        background_color: '#0b1a2b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the shell so the app opens on a trail with no signal. Writes
        // made offline are handled separately by the queue in data/store.js.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Recharts is heavy and only needed on Progress/Body; splitting it keeps
        // the first paint on a phone fast.
        manualChunks: {
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
