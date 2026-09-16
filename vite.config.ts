import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  server: {
    // OBR loads the manifest and iframe content from its own origin
    // (https://www.owlbear.rodeo), so the dev server must allow
    // cross-origin fetches — otherwise "Failed to fetch" in the room.
    cors: true,
  },
})
