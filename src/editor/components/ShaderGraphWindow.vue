<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEditorStore } from '../stores/editor'
import Icon from './Icon.vue'

const store = useEditorStore()
const frame = ref<HTMLIFrameElement | null>(null)

watch(() => [store.shaderOpen, store.shaderMaterialId, store.shaderPlacement] as const, () => {
  if (frame.value && store.shaderOpen && store.shaderPlacement === 'panel') store.attachShaderFrame(frame.value)
}, { flush: 'post' })
</script>

<template>
  <div class="shader-pane">
    <div class="shader-bar">
      <span>{{ store.shaderMaterialId ? `Node Editor - ${store.shaderTitle(store.shaderMaterialId)}` : 'Node Editor' }}</span>
      <span class="shader-status">{{ store.shaderStatus }}</span>
      <button
        v-if="store.shaderOpen && store.shaderPlacement === 'window'"
        type="button"
        class="icon-btn"
        title="Dock to Bottom Panel"
        @click="store.dockShaderEditor()"
      >
        <Icon name="dock-bottom" />
      </button>
      <button
        v-else-if="store.shaderOpen"
        type="button"
        class="icon-btn"
        title="Open in New Window"
        @click="store.openShaderWindow()"
      >
        <Icon name="pop-out" />
      </button>
    </div>
    <iframe v-if="store.shaderOpen && store.shaderPlacement === 'panel'" ref="frame" class="shader-frame" title="Node editor" />
    <div v-else-if="store.shaderOpen" class="empty-note">The node editor is open in another window.</div>
    <div v-else class="empty-note">Open a material to edit its nodes.</div>
  </div>
</template>
