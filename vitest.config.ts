import { defineConfig } from 'vitest/config';

// Vitest picks up *.test.ts and *.spec.ts by default. We explicitly exclude
// web/e2e/** because those files are Playwright specs — they import
// '@playwright/test' which only works under `playwright test`, not vitest.
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'web/e2e/**'],
  },
});
