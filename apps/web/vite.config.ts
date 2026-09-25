import { publicConfig } from './src/data/public-config.ts'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const testing = mode === 'auth-test'
  const localTest = mode === 'local-test'
  const pages = process.env.GITHUB_PAGES === 'true'
  const base = pages ? process.env.PAGES_BASE_PATH || '/' : '/'
  const env = testing
    ? {
        VITE_SUPABASE_URL: 'https://auth.test.invalid',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_1234567890',
      }
    : localTest
      ? { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
      : {
          ...loadEnv(mode, process.cwd(), 'VITE_'),
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key, value]) => key.startsWith('VITE_') && value !== undefined,
            ),
          ),
        }
  publicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  return {
    base,
    define:
      testing || localTest
        ? {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
            'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
              env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ),
          }
        : { 'import.meta.env.VITE_ROUTING': JSON.stringify(pages ? 'hash' : 'browser') },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: false,
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          id: base,
          name: 'Calendrier familial',
          short_name: 'En famille',
          description: 'Un espace simple pour organiser le quotidien de votre famille.',
          lang: 'fr',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#000000',
          theme_color: '#000000',
          icons: [
            {
              src: base + 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: base + 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: base + 'icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: { globPatterns: ['**/*.{js,css,html}'] },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      outDir: testing ? 'dist-auth-test' : localTest ? 'dist-test' : 'dist',
      target: ['es2022', 'safari16.4'],
    },
    preview: {
      proxy: { '/api/push-proof': { target: 'http://127.0.0.1:4318', changeOrigin: false } },
      headers: { 'Cache-Control': 'no-cache' },
    },
  }
})
