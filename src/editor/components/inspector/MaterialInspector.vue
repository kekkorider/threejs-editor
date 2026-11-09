<script setup lang="ts">
import { TSL_PRESETS, type MaterialSide } from '../../tsl'
import { useEditorStore } from '../../stores/editor'
import Icon from '../Icon.vue'
import PropRow from './PropRow.vue'
import Section from './Section.vue'

const store = useEditorStore()

function onPreset(event: Event): void {
  store.applyBoundPreset((event.target as HTMLSelectElement).value)
}

function onSide(event: Event): void {
  const material = store.inspectedMaterial
  if (!material) return
  store.setMaterialFlags(material.id, { side: (event.target as HTMLSelectElement).value as MaterialSide })
}

function onName(event: Event): void {
  const material = store.inspectedMaterial
  if (!material) return
  store.setMaterialName(material.id, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <template v-if="store.inspectedMaterial">
    <div class="node-head">
      <span class="kind-icon mat"><Icon name="material" /></span>
      <span class="label">{{ store.inspectedMaterial.name }}</span>
    </div>
    <div class="inherits">{{ store.inspectedMaterial.path }}</div>
    <div class="material-open">
      <button type="button" class="btn" @click="store.openShaderEditor(store.inspectedMaterial.id)">Open Node Editor</button>
    </div>
    <Section title="Material" section-key="material-file" tone="sub mat">
      <PropRow label="Name" :reset="() => store.inspectedMaterial && store.resetMaterialName(store.inspectedMaterial.id)">
        <input type="text" :value="store.inspectedMaterial.name" @change="onName" />
      </PropRow>
      <PropRow label="Preset" :reset="() => store.inspectedMaterial && store.resetMaterialSource(store.inspectedMaterial.id)">
        <select :value="store.inspectedMaterial.presetId" @change="onPreset">
          <option value="custom">Custom</option>
          <option v-for="preset in TSL_PRESETS" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
        </select>
      </PropRow>
      <PropRow label="Cull" :reset="() => store.inspectedMaterial && store.resetMaterialFlag(store.inspectedMaterial.id, 'side')">
        <select :value="store.inspectedMaterial.side" @change="onSide">
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="double">Double</option>
        </select>
      </PropRow>
      <PropRow label="Transparent" :reset="() => store.inspectedMaterial && store.resetMaterialFlag(store.inspectedMaterial.id, 'transparent')">
        <label class="check">
          <input
            type="checkbox"
            :checked="store.inspectedMaterial.transparent"
            @change="store.inspectedMaterial && store.setMaterialFlags(store.inspectedMaterial.id, { transparent: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </PropRow>
      <PropRow label="Wireframe" :reset="() => store.inspectedMaterial && store.resetMaterialFlag(store.inspectedMaterial.id, 'wireframe')">
        <label class="check">
          <input
            type="checkbox"
            :checked="store.inspectedMaterial.wireframe"
            @change="store.inspectedMaterial && store.setMaterialFlags(store.inspectedMaterial.id, { wireframe: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </PropRow>
      <div v-if="store.inspectedMaterial.error" class="hint">{{ store.inspectedMaterial.error }}</div>
    </Section>
  </template>
</template>
