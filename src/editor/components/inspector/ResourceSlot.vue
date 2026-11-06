<script setup lang="ts">
import { ref } from 'vue'
import { RESOURCE_DRAG_TYPE, fileNameOf } from '../../projectFs'

const props = defineProps<{ path: string | null, accept: string, root?: string }>()
const emit = defineEmits<{ click: [event: MouseEvent], dropPath: [path: string] }>()
const over = ref(false)

function allows(transfer: DataTransfer | null): boolean {
  return !!transfer && [...transfer.types].includes(RESOURCE_DRAG_TYPE)
}

function onOver(event: DragEvent): void {
  if (!allows(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  over.value = true
}

function onDrop(event: DragEvent): void {
  over.value = false
  const path = event.dataTransfer?.getData(RESOURCE_DRAG_TYPE) ?? ''
  if (!path.endsWith(props.accept)) return
  if (props.root && !path.startsWith(props.root)) return
  event.preventDefault()
  emit('dropPath', path)
}
</script>

<template>
  <button
    type="button"
    class="resource-btn"
    :class="{ dragover: over, empty: !path }"
    :title="path ?? '[empty]'"
    @click="emit('click', $event)"
    @dragover="onOver"
    @dragleave="over = false"
    @drop="onDrop"
  >
    <span class="label">{{ path ? fileNameOf(path) : '[empty]' }}</span>
  </button>
</template>
