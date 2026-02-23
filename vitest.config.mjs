import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/setup.ts',
        '**/*.config.*',
        '**/dist/**',
        // Infrastructure files requiring integration tests
        'lib/db/**',
        'lib/supabase/**',
        'app/api/uploads/**',
        'prisma/**',
      ],
      thresholds: {
        lines: 93,
        functions: 93,
        branches: 93,
        statements: 93,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
