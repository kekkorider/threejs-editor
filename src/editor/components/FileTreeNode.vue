<script lang="ts">
export default { name: 'FileTreeNode' }
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { COMPONENT_DRAG_PREFIX, markScriptDrag } from '../behaviors'
import { writeSceneDrag } from '../sceneFile'
import { PROJECT_DRAG_TYPE, RESOURCE_DRAG_TYPE, type FsEntry } from '../projectFs'
import Icon from './Icon.vue'
import { useEditorStore } from '../stores/editor'

const props = defineProps<{ entry: FsEntry, depth: number, query: string }>()
const store = useEditorStore()
const over = ref(false)
let suppressClick = false

const visible = computed(() => matches(props.entry, props.query))
const open = computed(() => props.query ? true : store.expandedFiles.has(props.entry.path))

function matches(entry: FsEntry, query: string): boolean {
  if (!query) return true
  if (entry.path.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query)) return true
  return entry.children.some((child) => matches(child, query))
}

function iconName(entry: FsEntry): string {
  if (entry.kind === 'dir') return 'folder'
  if (entry.path.endsWith('.tscn')) return 'scene'
  if (entry.path.endsWith('.tres')) return 'meshfile'
  if (entry.path.endsWith('.tsl')) return 'material'
  if (entry.path.endsWith('.ts')) return 'component'
  return 'script'
}

function iconClass(entry: FsEntry): string {
  if (entry.kind === 'dir') return 'folder'
  if (entry.path.endsWith('.tscn')) return 'scene'
  if (entry.path.endsWith('.tres')) return 'mesh'
  if (entry.path.endsWith('.tsl')) return 'mat'
  if (entry.path.endsWith('.ts')) return 'component'
  return 'script'
}

function onDrag(event: DragEvent): void {
  if (!event.dataTransfer) return
  suppressClick = true
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData(PROJECT_DRAG_TYPE, props.entry.path)
  if (props.entry.path.endsWith('.tres') || props.entry.path.endsWith('.tsl')) {
    event.dataTransfer.setData(RESOURCE_DRAG_TYPE, props.entry.path)
  }
  if (props.entry.path.endsWith('.tscn') && props.entry.path !== store.scenePath) {
    writeSceneDrag(event.dataTransfer, props.entry.path)
  }
  const component = store.componentFiles.find((file) => file.path === props.entry.path)
  if (component) markScriptDrag(event.dataTransfer, `${COMPONENT_DRAG_PREFIX}${component.id}`)
  event.dataTransfer.setData(PROJECT_DRAG_TYPE, props.entry.path)
}

function onClick(): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (props.entry.kind === 'dir') {
    store.toggleProjectFolder(props.entry.path)
    return
  }
  if (props.entry.path.endsWith('.tscn')) store.openSceneFile(props.entry.path)
  else if (props.entry.path.endsWith('.tsl')) store.selectMaterialPath(props.entry.path)
  else if (props.entry.path.endsWith('.tres')) store.selectGeometryPath(props.entry.path)
  else if (props.entry.path.endsWith('.ts')) {
    const component = store.componentFiles.find((file) => file.path === props.entry.path)
    if (component) store.openComponentDialog(component.id)
  }
}

function onFolderOver(event: DragEvent): void {
  if (props.entry.kind !== 'dir') return
  if (!event.dataTransfer || ![...event.dataTransfer.types].includes(PROJECT_DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  over.value = true
}

function onFolderDrop(event: DragEvent): void {
  over.value = false
  if (props.entry.kind !== 'dir') return
  const from = event.dataTransfer?.getData(PROJECT_DRAG_TYPE) ?? ''
  if (!from) return
  event.preventDefault()
  event.stopPropagation()
  store.moveProjectEntry(from, props.entry.path)
}

function commitRename(event: Event): void {
  store.commitFileRename((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div v-if="visible">
    <div
      class="file-row"
      :class="{ selected: entry.path === store.scenePath, 'drop-target': over }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      :title="entry.path"
      draggable="true"
      @click.stop="onClick"
      @contextmenu.prevent.stop="store.openProjectMenu(entry.path, $event.clientX, $event.clientY)"
      @dragstart.stop="onDrag"
      @dragover="onFolderOver"
      @dragleave="over = false"
      @drop="onFolderDrop"
    >
      <button
        v-if="entry.kind === 'dir'"
        type="button"
        class="twist"
        :class="{ closed: !open }"
        @click.stop="store.toggleProjectFolder(entry.path)"
      >
        <Icon name="chevron-down" />
      </button>
      <span v-else class="twist spacer"></span>
      <span class="kind-icon" :class="iconClass(entry)"><Icon :name="iconName(entry)" /></span>
      <input
        v-if="store.renamingFile === entry.path"
        class="rename-input"
        :value="entry.name"
        autofocus
        @click.stop
        @keydown.enter.prevent="commitRename"
        @blur="commitRename"
      />
      <span v-else class="label">{{ entry.name }}{{ entry.path === store.scenePath && store.sceneDirty ? ' (*)' : '' }}</span>
    </div>
    <template v-if="entry.kind === 'dir' && open">
      <FileTreeNode
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :query="query"
      />
    </template>
  </div>
</template>
