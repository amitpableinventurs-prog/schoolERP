import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = { target: `http://127.0.0.1:${env.PORT || 5188}` }

  return {
    plugins: [react()],
    // Fixed ports so this project doesn't collide with the other local projects.
    server: { port: 5388, strictPort: true, proxy: { '/api': api } },
    preview: { port: 5389, strictPort: true, proxy: { '/api': api } },
  }
})
