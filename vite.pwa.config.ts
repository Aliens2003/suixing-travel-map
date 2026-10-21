import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('standalone'),
  publicDir: path.resolve('public'),
  plugins: [react()],
  css: {postcss: path.resolve('.')},
  build: {outDir: path.resolve('dist/pwa'), emptyOutDir: true},
});
