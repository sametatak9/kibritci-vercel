import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['exceljs', 'uuid'],
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/],
      },
      rollupOptions: {
        output: {
          // Büyük vendor kütüphanelerini ayrı paketlere böl: tarayıcı bunları önbelleğe alır,
          // uygulama kodu güncellense bile tekrar indirilmez.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true as const,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        }
      }
    },
  };
});
