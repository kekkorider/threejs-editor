<script setup lang="ts">
import { computed } from 'vue'
import { IMPORTER_LABEL, importerForPath, visibleImportProps, type ImporterId, type ImportProp } from '../importSettings'
import Section from './inspector/Section.vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()

const path = computed(() => store.importPaths[0] ?? '')
const importer = computed(() => store.importAs)
const propsForFile = computed(() => {
  const current = importer.value
  if (!current || current === 'keep') return []
  return visibleImportProps(current, store.importParams, path.value)
})
const groups = computed(() => {
  const order: string[] = []
  const map = new Map<string, ImportProp[]>()
  for (const prop of propsForFile.value) {
    const list = map.get(prop.group)
    if (list) list.push(prop)
    else {
      map.set(prop.group, [prop])
      order.push(prop.group)
    }
  }
  return order.map((name) => ({ name, props: map.get(name) ?? [] }))
})
const choices = computed(() => {
  const native = importerForPath(path.value)
  if (!native) return []
  return [native, 'keep'] as ImporterId[]
})
const audio = computed(() => importer.value === 'wav' || importer.value === 'mp3' || importer.value === 'oggvorbis')
const reimportLabel = computed(() => store.importDirty ? 'Reimport (*)' : 'Reimport')

function onImportAs(event: Event): void {
  store.setImportAs((event.target as HTMLSelectElement).value as ImporterId)
}

function onEnum(prop: ImportProp, event: Event): void {
  store.setImportParam(prop.name, Number((event.target as HTMLSelectElement).value))
}

function onNumber(prop: ImportProp, event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  store.setImportParam(prop.name, prop.kind === 'int' ? Math.round(raw) : raw)
}

function onText(prop: ImportProp, event: Event): void {
  store.setImportParam(prop.name, (event.target as HTMLInputElement).value)
}

function onBool(prop: ImportProp, event: Event): void {
  store.setImportParam(prop.name, (event.target as HTMLInputElement).checked)
}

function onCheck(prop: ImportProp, event: Event): void {
  store.setImportChecked(prop.name, (event.target as HTMLInputElement).checked)
}

function onPreset(event: MouseEvent): void {
  const target = event.currentTarget
  if (target instanceof HTMLElement) store.openImportPresetMenu(target)
}
</script>

<template>
  <div class="import-dock">
  <div v-if="store.importMessage" class="empty-note import-empty">{{ store.importMessage }}</div>
  <template v-else>
    <div class="import-scroll">
      <div v-if="store.importPreview" class="import-preview">
        <img :src="store.importPreview" alt="" />
      </div>
      <div v-if="audio" class="import-play">
        <button type="button" class="btn" @click="store.playImportPreview()">Play</button>
      </div>
      <p v-if="store.importNote" class="import-note">{{ store.importNote }}</p>
      <p v-if="store.importWarning" class="import-warning">{{ store.importWarning }}</p>
      <div class="prop">
        <div class="prop-label">Import As</div>
        <select :value="importer ?? ''" @change="onImportAs">
          <option v-for="choice in choices" :key="choice" :value="choice">{{ IMPORTER_LABEL[choice] }}</option>
        </select>
      </div>
      <div class="prop">
        <div class="prop-label">Preset</div>
        <button type="button" class="btn import-preset" :disabled="importer === 'keep'" @click="onPreset">
          Preset...
        </button>
      </div>
      <Section v-for="group in groups" :key="group.name" :title="group.name" :section-key="`import:${group.name}`">
        <div v-for="prop in group.props" :key="prop.name" class="prop" :class="{ 'with-check': store.importMulti }">
          <input
            v-if="store.importMulti"
            class="import-check"
            type="checkbox"
            :checked="store.importChecked.includes(prop.name)"
            @change="onCheck(prop, $event)"
          />
          <div class="prop-label" :title="prop.label">{{ prop.label }}</div>
          <select v-if="prop.name === 'nodes/root_type'" disabled>
            <option value="">Node</option>
          </select>
          <select v-else-if="prop.kind === 'enum'" :value="String(store.importParams[prop.name] ?? '')" @change="onEnum(prop, $event)">
            <option v-for="option in prop.options" :key="option.value" :value="String(option.value)">{{ option.label }}</option>
          </select>
          <input
            v-else-if="prop.kind === 'float' || prop.kind === 'int'"
            type="number"
            :min="prop.min"
            :max="prop.max"
            :step="prop.step ?? (prop.kind === 'int' ? 1 : 0.01)"
            :value="store.importParams[prop.name]"
            @change="onNumber(prop, $event)"
          />
          <input
            v-else-if="prop.kind === 'string'"
            type="text"
            :value="store.importParams[prop.name]"
            @change="onText(prop, $event)"
          />
          <label v-else class="check">
            <input type="checkbox" :checked="store.importParams[prop.name] === true" @change="onBool(prop, $event)" />
          </label>
        </div>
      </Section>
    </div>
    <div class="import-actions">
      <button type="button" class="btn primary" :disabled="store.importBusy" @click="store.reimportFiles()">
        {{ reimportLabel }}
      </button>
    </div>
  </template>
  </div>
</template>
