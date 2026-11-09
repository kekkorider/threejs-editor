<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()
const frame = ref<HTMLIFrameElement | null>(null)

watch(() => [store.shaderOpen, store.shaderMaterialId] as const, () => {
  if (frame.value && store.shaderOpen) store.attachShaderFrame(frame.value)
}, { flush: 'post' })
</script>

<template>
  <div class="shader-pane">
    <div class="shader-bar">
      <span>{{ store.shaderMaterialId ? `Node Editor - ${store.shaderTitle(store.shaderMaterialId)}` : 'Node Editor' }}</span>
      <span class="shader-status">{{ store.shaderStatus }}</span>
    </div>
    <iframe v-if="store.shaderOpen" ref="frame" class="shader-frame" title="Node editor" />
    <div v-else class="empty-note">Open a material to edit its nodes.</div>
  </div>
</template>
