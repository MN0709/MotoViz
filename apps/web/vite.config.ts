import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 引用联调使用同源 API；生产部署仍需由网关转发 /api。
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
