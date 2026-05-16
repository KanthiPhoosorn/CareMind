import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest picks up *.test.ts and *.spec.ts by default. We explicitly exclude
// web/e2e/** because those files are Playwright specs — they import
// '@playwright/test' which only works under `playwright test`, not vitest.
//
// The `@` alias mirrors web/tsconfig.json's "@/*" path so web tests (e.g.
// the LINE webhook route test) can import and vi.mock `@/lib/...` modules.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'web') },
  },
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'web/e2e/**'],
  },
});
