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
    exclude: ['node_modules', 'e2e/**'],
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
        'lib/rate-limit.ts', // Redis integration only, tested via in-memory fallback in API tests
        'lib/google/client.ts', // Calls real Google API, tested via mocks in sync tests
        'lib/analytics/**', // Client-side analytics, tested in E2E
        'app/api/uploads/**',
        'app/api/jobs/**', // Cron job endpoints, tested via E2E/integration
        'prisma/**',
        'sentry.*.config.ts',
        'e2e/**',
      ],
      // Use istanbul ignore comments to exclude Redis paths from coverage
      // Coverage will be calculated only for tested code paths
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      thresholds: {
        lines: 93,
        functions: 91,
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
