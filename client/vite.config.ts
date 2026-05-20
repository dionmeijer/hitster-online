import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, path.resolve(__dirname, '../server'), '');
  const port = serverEnv.PORT || process.env.PORT || '3000';
  const apiTarget = `http://localhost:${port}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      proxy: {
        '/socket.io': { target: apiTarget, ws: true },
        '/rooms': { target: apiTarget },
        '/health': { target: apiTarget },
      },
    },
  };
});
