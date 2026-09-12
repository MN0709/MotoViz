import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 仅配置 React 编译；代理和后端地址由 F20 接口约定后再添加。
export default defineConfig({
  plugins: [react()],
});
