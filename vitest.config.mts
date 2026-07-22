import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './worker/src/index.ts',
      miniflare: {
        // Keep runtime behavior aligned with the production Worker configuration.
        compatibilityDate: '2026-07-20',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        bindings: {
          ADMIN_USERNAME: 'admin',
          ADMIN_PASSWORD: 'local-test-password',
          CODE_HASH_PEPPER: '1111111111111111111111111111111111111111111111111111111111111111',
          SESSION_SECRET: '2222222222222222222222222222222222222222222222222222222222222222',
        },
      },
    }),
  ],
  test: {
    include: ['worker/test/**/*.test.ts'],
  },
})
