<script setup lang="ts">
import { computed } from 'vue'
import { PROJECT_DRAG_TYPE } from '../projectFs'
import FileTreeNode from './FileTreeNode.vue'
import Icon from './Icon.vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()
const query = computed(() => store.fileFilter.trim().toLowerCase())
const empty = computed(() => store.projectTree.length === 0)

function osFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false
  const types = [...transfer.types]
  return types.includes('Files') && !types.includes(PROJECT_DRAG_TYPE)
}

function onRootDrop(event: DragEvent): void {
  if (osFiles(event.dataTransfer)) {
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return
    event.preventDefault()
    void store.importExternalFiles(files, 'res://')
    return
  }
  const from = event.dataTransfer?.getData(PROJECT_DRAG_TYPE) ?? ''
  if (!from) return
  event.preventDefault()
  store.moveProjectEntry(from, 'res://')
}

function onRootOver(event: DragEvent): void {
  if (!event.dataTransfer) return
  const types = [...event.dataTransfer.types]
  if (!types.includes(PROJECT_DRAG_TYPE) && !osFiles(event.dataTransfer)) return
  event.preventDefault()
  if (osFiles(event.dataTransfer)) event.dataTransfer.dropEffect = 'copy'
}
</script>

<template>
  <section class="dock files-dock">
    <div class="dock-title">File system</div>
    <div class="dock-tools">
      <button type="button" class="icon-btn" :title="store.undoTitle" :disabled="!store.canUndo" @click="store.undo()">
        <Icon name="back" />
      </button>
      <button type="button" class="icon-btn" :title="store.redoTitle" :disabled="!store.canRedo" @click="store.redo()">
        <Icon name="forward" />
      </button>
      <button type="button" class="icon-btn" title="New Folder" @click="store.createProjectFolder('res://')">
        <Icon name="folder" />
      </button>
    </div>
    <input v-model="store.fileFilter" class="filter file-filter" placeholder="Filter files" />
    <div
      class="tree files"
      @contextmenu.prevent="store.openProjectMenu('res://', $event.clientX, $event.clientY)"
      @dragover="onRootOver"
      @drop="onRootDrop"
    >
      <div v-if="empty" class="empty-note">The project folder is empty.</div>
      <FileTreeNode
        v-for="entry in store.projectTree"
        :key="entry.path"
        :entry="entry"
        :depth="0"
        :query="query"
      />
    </div>
  </section>
</template>
