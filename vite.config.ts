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
    server: {
      host: true,
      allowedHosts: true as const,
      // HMR can be disabled in hosted environments through DISABLE_HMR.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Polling is enabled by the Base44 compose environment for bind mounts.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
