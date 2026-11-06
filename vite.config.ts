import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { editorProjectPlugin } from './scripts/editorProjectPlugin.ts'

export default defineConfig({
  plugins: [vue(), editorProjectPlugin()],
})
