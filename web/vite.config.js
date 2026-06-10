import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
