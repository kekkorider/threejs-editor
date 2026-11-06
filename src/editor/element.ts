import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import EditorPage from './pages/EditorPage.vue'
import { ensureProject } from './projectFs'
import './element.css'

/**
 * Standalone editor element. One page can host one instance.
 * The scene runtime in `src/webgl/index.ts` is a single `ThreeStart`.
 */
export class ThreejsEditor extends HTMLElement {
  private app: App<Element> | null = null
  private root: HTMLDivElement | null = null
  private mounting = false

  connectedCallback(): void {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this.connectedCallback(), { once: true })
      return
    }
    // Fixed positioning is relative to a transformed ancestor. Move to the body
    // so the element covers the window from any host location.
    if (this.parentElement !== document.body) {
      document.body.append(this)
      return
    }
    if (this.app || this.mounting) return
    this.mounting = true
    void this.mountEditor()
  }

  private async mountEditor(): Promise<void> {
    if (this.app) return
    try {
      await ensureProject()
    } catch (error) {
      console.error(error)
    }

    const root = document.createElement('div')
    root.className = 'threejs-editor-root'
    this.append(root)
    this.root = root

    const app = createApp(EditorPage)
    app.use(createPinia())
    app.mount(root)
    this.app = app
  }

  disconnectedCallback(): void {
    if (this.isConnected) return
    this.app?.unmount()
    this.app = null
    this.mounting = false
    this.root?.remove()
    this.root = null
  }
}

if (!customElements.get('threejs-editor')) {
  customElements.define('threejs-editor', ThreejsEditor)
}
