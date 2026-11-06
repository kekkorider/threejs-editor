<script lang="ts">
export default { name: 'FileTreeNode' }
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { COMPONENT_DRAG_PREFIX, markScriptDrag } from '../behaviors'
import { importerForPath, isModelFile, writeModelDrag } from '../importSettings'
import { writeSceneDrag } from '../sceneFile'
import { isMaterialFile, isMeshFile, isScenePath, PROJECT_DRAG_TYPE, RESOURCE_DRAG_TYPE, type FsEntry } from '../projectFs'
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
  if (isScenePath(entry.path)) return 'scene'
  if (isModelFile(entry.path) || isMeshFile(entry.path)) return 'meshfile'
  if (importerForPath(entry.path) === 'texture') return 'texture'
  if (isMaterialFile(entry.path)) return 'material'
  if (importerForPath(entry.path) === 'wav' || importerForPath(entry.path) === 'mp3' || importerForPath(entry.path) === 'oggvorbis') return 'audio'
  if (entry.path.endsWith('.ts')) return 'component'
  return 'script'
}

function iconClass(entry: FsEntry): string {
  if (entry.kind === 'dir') return 'folder'
  if (isScenePath(entry.path)) return 'scene'
  if (isModelFile(entry.path) || isMeshFile(entry.path)) return 'mesh'
  if (importerForPath(entry.path) === 'texture') return 'texture'
  if (isMaterialFile(entry.path)) return 'mat'
  if (importerForPath(entry.path) === 'wav' || importerForPath(entry.path) === 'mp3' || importerForPath(entry.path) === 'oggvorbis') return 'audio'
  if (entry.path.endsWith('.ts')) return 'component'
  return 'script'
}

function displayName(entry: FsEntry): string {
  const hide = (isMeshFile(entry.path) || isMaterialFile(entry.path) || isScenePath(entry.path))
    && entry.name.endsWith('.json')
  if (hide) return entry.name.slice(0, -'.json'.length)
  return entry.name
}

function onDrag(event: DragEvent): void {
  if (!event.dataTransfer) return
  suppressClick = true
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData(PROJECT_DRAG_TYPE, props.entry.path)
  if (isMeshFile(props.entry.path) || isMaterialFile(props.entry.path)) {
    event.dataTransfer.setData(RESOURCE_DRAG_TYPE, props.entry.path)
  }
  if (isScenePath(props.entry.path) && props.entry.path !== store.scenePath) {
    writeSceneDrag(event.dataTransfer, props.entry.path)
  }
  const component = store.componentFiles.find((file) => file.path === props.entry.path)
  if (component) markScriptDrag(event.dataTransfer, `${COMPONENT_DRAG_PREFIX}${component.id}`)
  if (isModelFile(props.entry.path)) writeModelDrag(event.dataTransfer, props.entry.path)
  event.dataTransfer.setData(PROJECT_DRAG_TYPE, props.entry.path)
}

function onDoubleClick(): void {
  store.editProjectPath(props.entry.path)
}

function onClick(event: MouseEvent): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  store.selectProjectPath(props.entry.path, event.shiftKey, event.ctrlKey || event.metaKey)
}

function osFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false
  const types = [...transfer.types]
  return types.includes('Files') && !types.includes(PROJECT_DRAG_TYPE)
}

function onFolderOver(event: DragEvent): void {
  if (props.entry.kind !== 'dir' || !event.dataTransfer) return
  const types = [...event.dataTransfer.types]
  if (!types.includes(PROJECT_DRAG_TYPE) && !osFiles(event.dataTransfer)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = osFiles(event.dataTransfer) ? 'copy' : 'move'
  over.value = true
}

function onFolderDrop(event: DragEvent): void {
  over.value = false
  if (props.entry.kind !== 'dir') return
  if (osFiles(event.dataTransfer)) {
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    void store.importExternalFiles(files, props.entry.path)
    return
  }
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
      :class="{ selected: store.fileSelection.includes(entry.path), 'drop-target': over }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      :title="entry.path"
      draggable="true"
      @click.stop="onClick($event)"
      @dblclick.stop="onDoubleClick"
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
        :value="displayName(entry)"
        autofocus
        @click.stop
        @keydown.enter.prevent="commitRename"
        @blur="commitRename"
      />
      <span v-else class="label">{{ displayName(entry) }}{{ entry.path === store.scenePath && store.sceneDirty ? ' (*)' : '' }}</span>
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
