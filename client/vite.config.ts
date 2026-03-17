import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared/src'),
    },
  },
});
