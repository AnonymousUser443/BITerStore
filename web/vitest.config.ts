import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __API_URL__: JSON.stringify('/api/v1'),
    __BIT_LOGIN_URL__: JSON.stringify('https://login.example.test'),
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
    restoreMocks: true,
  },
});
