<script setup lang="ts">
import { computed } from 'vue'
import { fileNameOf, isMeshFile, isScenePath } from '../projectFs'
import { useEditorStore } from '../stores/editor'
import CodeEditor from './CodeEditor.vue'
import Icon from './Icon.vue'

const store = useEditorStore()
const active = computed(() => store.openScripts.find((file) => file.id === store.activeScriptId) ?? null)
const jsonOpen = computed(() => store.editorKind === 'json' && !!store.jsonPath)

function label(path: string): string {
  const name = fileNameOf(path)
  if (name.endsWith('.json') && path !== 'res://settings.json') return name.slice(0, -'.json'.length)
  return name
}

function iconName(path: string): string {
  if (isMeshFile(path)) return 'meshfile'
  if (isScenePath(path)) return 'scene'
  return 'material'
}

function iconClass(path: string): string {
  if (isMeshFile(path)) return 'mesh'
  if (isScenePath(path)) return 'scene'
  return 'mat'
}
</script>

<template>
  <div class="script-screen">
    <aside class="script-files">
      <div class="dock-title">Open scripts</div>
      <div class="tree">
        <div v-if="store.openScripts.length === 0 && store.openJsonPaths.length === 0" class="empty-note">No scripts open.</div>
        <div
          v-for="file in store.openScripts"
          :key="file.id"
          class="tree-row"
          :class="{ selected: !jsonOpen && file.id === store.activeScriptId }"
          @click="store.showScript(file.id)"
        >
          <span class="kind-icon component"><Icon name="component" /></span>
          <span class="label">{{ file.name }}.ts</span>
          <button type="button" class="icon-btn row-close" title="Close" @click.stop="store.closeScript(file.id)">
            <Icon name="close" />
          </button>
        </div>
        <div
          v-for="path in store.openJsonPaths"
          :key="path"
          class="tree-row"
          :class="{ selected: jsonOpen && path === store.jsonPath }"
          :title="path"
          @click="store.showJsonDoc(path)"
        >
          <span class="kind-icon" :class="iconClass(path)"><Icon :name="iconName(path)" /></span>
          <span class="label">{{ label(path) }}</span>
          <button type="button" class="icon-btn row-close" title="Close" @click.stop="store.closeJsonDoc(path)">
            <Icon name="close" />
          </button>
        </div>
      </div>
    </aside>
    <div class="script-main">
      <div class="tsl-bar">
        <span class="name">{{ jsonOpen ? store.jsonPath : (active ? active.path : 'No script') }}</span>
        <span class="spacer" />
        <span
          v-if="jsonOpen ? store.jsonStatus : store.scriptStatus"
          :key="jsonOpen ? store.jsonStatusKey : store.scriptStatusKey"
          class="status"
          :class="{
            error: jsonOpen ? store.jsonStatus !== 'Applied' : store.scriptError,
            ok: jsonOpen ? store.jsonStatus === 'Applied' : !store.scriptError,
            fade: (jsonOpen ? store.jsonStatus : store.scriptStatus) === 'Applied',
          }"
        >{{ jsonOpen ? store.jsonStatus : store.scriptStatus }}</span>
        <button
          type="button"
          class="btn"
          :disabled="jsonOpen ? !store.jsonDirty : !store.scriptDirty"
          @click="jsonOpen ? store.saveJsonFile() : store.saveActiveScript(true)"
        >Apply</button>
      </div>
      <CodeEditor v-if="jsonOpen" :key="store.jsonPath ?? ''" v-model="store.jsonSource" language="json" @change="store.onJsonChange" />
      <CodeEditor v-else-if="active" v-model="store.scriptSource" language="typescript" @change="store.onScriptChange" />
      <div v-else class="empty-note script-empty">Double-click a component in the scene tree, or double-click a JSON file in the File system.</div>
    </div>
  </div>
</template>
