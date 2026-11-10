import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base './' makes the build work from any GitHub Pages path (user.github.io/<repo>/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
});
