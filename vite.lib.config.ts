import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const dependencyNames = [
  'vue',
  'pinia',
  'three',
  'three-start',
  'crashcat',
  'eventemitter3',
  'gsap',
  'sucrase',
]

function isDependency(id: string): boolean {
  return dependencyNames.some((name) => id === name || id.startsWith(`${name}/`))
}

function injectCss(): Plugin {
  return {
    name: 'inject-editor-css',
    apply: 'build',
    async closeBundle() {
      const cssPath = resolve('dist/index.css')
      const jsPath = resolve('dist/index.js')
      const css = await readFile(cssPath, 'utf8')
      const js = await readFile(jsPath, 'utf8')
      const runtime =
        `const css = ${JSON.stringify(css)};\n` +
        `const mountCss = () => {\n` +
        `  const style = document.createElement('style');\n` +
        `  style.textContent = css;\n` +
        `  document.head.append(style);\n` +
        `};\n` +
        `if (document.head) mountCss();\n` +
        `else document.addEventListener('DOMContentLoaded', mountCss, { once: true });\n`
      await writeFile(jsPath, js + runtime)
      await rm(cssPath)
    },
  }
}

function copyDecoders(): Plugin {
  return {
    name: 'copy-decoders',
    apply: 'build',
    async closeBundle() {
      const source = resolve('node_modules/three/examples/jsm/libs')
      await cp(resolve(source, 'draco'), resolve('dist/draco'), { recursive: true })
      await cp(resolve(source, 'basis'), resolve('dist/basis'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [vue(), injectCss(), copyDecoders()],
  publicDir: false,
  build: {
    lib: {
      entry: resolve('src/package.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: isDependency,
      output: {
        codeSplitting: false,
      },
    },
  },
})
