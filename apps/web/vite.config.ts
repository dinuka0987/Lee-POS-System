import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../..', import.meta.url));
  const env = loadEnv(mode, envDir, 'VITE_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          id: '/lee-pos',
          name: 'Lee Point of Sale',
          short_name: 'Lee',
          description: 'Lee shop checkout with offline sales',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#183d32',
          background_color: '#f7f9f8',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [],
        },
      }),
    ],
    envDir,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000' } },
    },
    preview: {
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000' } },
    },
  };
});
