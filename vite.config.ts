import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // 注意: API Key 不应该注入到前端代码中！
    // 前端应该通过 localStorage 获取用户输入的 API Key，或通过后端代理调用 AI API
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/uploads': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        // 不要在这里注入 API Key！会暴露在前端代码中
        // 'process.env.API_KEY': JSON.stringify(apiKey),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
