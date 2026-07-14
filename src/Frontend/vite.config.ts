import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest config lives here too (test key). jsdom + RTL for component tests.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
  },
});
