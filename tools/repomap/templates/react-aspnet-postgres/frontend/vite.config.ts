import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// API_URL: where `npm run dev` sends /api (the API run with `dotnet run`, or the one in Docker).
const apiUrl = process.env.API_URL ?? 'http://localhost:__API_PORT__'

export default defineConfig({
  plugins: [react()],
  // @/<layer>/<slice>: Feature-Sliced Design's imports across slices (tsconfig.app.json's paths).
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Same-origin API calls: no CORS, and cookies stay first-party.
  server: { proxy: { '/api': { target: apiUrl, xfwd: true } } },
})
