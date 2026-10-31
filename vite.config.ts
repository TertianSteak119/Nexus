import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react'
          if (id.includes('react-router')) return 'router'
          if (id.includes('@supabase') || id.includes('realtime-js') || id.includes('postgrest-js') || id.includes('gotrue-js') || id.includes('storage-js')) return 'supabase'
          if (id.includes('@tanstack')) return 'tanstack'
          if (id.includes('/zod/')) return 'zod'
          return 'vendor'
        },
      },
    },
  },
})
