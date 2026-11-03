import { defineConfig } from 'vite';

export default defineConfig({
  base: '/online-calculator/',
  esbuild: false,
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  build: {
    minify: false,
    cssMinify: false,
    rollupOptions: {
      input: {
        calculator: 'index.html',
        dashboard: 'dashboard.html',
        phoneKeyboard: 'phone-keyboard.html',
      },
    },
  },
});
