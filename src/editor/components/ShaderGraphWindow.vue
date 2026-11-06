<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()
const frame = ref<HTMLIFrameElement | null>(null)
const pos = ref({ x: 300, y: 76 })

function titleFor(materialId: string): string {
  return `Shader - ${store.shaderTitle(materialId)}`
}

function onDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  const startX = event.clientX
  const startY = event.clientY
  const origin = { ...pos.value }
  const move = (ev: PointerEvent) => {
    pos.value = {
      x: Math.max(8, origin.x + ev.clientX - startX),
      y: Math.max(8, origin.y + ev.clientY - startY),
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

onMounted(() => {
  if (frame.value) store.attachShaderFrame(frame.value)
})
</script>

<template>
  <section
    v-if="!store.shaderHost"
    class="shader-window"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <header class="shader-title" @pointerdown="onDrag">
      <span>{{ store.shaderMaterialId ? titleFor(store.shaderMaterialId) : 'Shader' }}</span>
      <span class="shader-status">{{ store.shaderStatus }}</span>
      <button type="button" class="icon-btn" title="Close" @pointerdown.stop @click="store.closeShaderEditor()">×</button>
    </header>
    <iframe ref="frame" class="shader-frame" title="Shader editor" />
  </section>
</template>
