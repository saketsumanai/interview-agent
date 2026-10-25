import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/upload-resume': 'http://localhost:8000',
      '/resume-status': 'http://localhost:8000',
      '/capacity-check': 'http://localhost:8000',
      '/token': 'http://localhost:8000',
      '/livekit-url': 'http://localhost:8000',
      '/room-config': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/resume': 'http://localhost:8000',
    },
  },
})

