<script setup lang="ts">
import { computed } from 'vue'
import { GEOMETRY_CATALOG, geometryEntry, type GeometryType, type ParamSpec } from '../../geometry'
import { formatNumber } from '../../lib/format'
import { useEditorStore } from '../../stores/editor'
import PropRow from './PropRow.vue'
import ResourceSlot from './ResourceSlot.vue'
import Section from './Section.vue'

const store = useEditorStore()
const node = computed(() => store.selected)
const geometry = computed(() => node.value?.geometry ?? null)
const specs = computed(() => geometry.value ? geometryEntry(geometry.value.type).params : [])

function onType(event: Event): void {
  const id = node.value?.id
  if (!id) return
  store.setGeometryType(id, (event.target as HTMLSelectElement).value as GeometryType)
}

function writeParam(spec: ParamSpec, value: number): void {
  const id = node.value?.id
  if (!id) return
  store.setGeometryParam(id, spec.key, value)
}

function scrubParam(spec: ParamSpec, delta: number): void {
  const current = geometry.value?.params[spec.key] ?? spec.default
  const next = spec.integer
    ? current + (Math.trunc(delta / 6) || Math.sign(delta))
    : current + delta * 0.02
  writeParam(spec, next)
}

function openExisting(event: MouseEvent): void {
  const id = node.value?.id
  if (!id) return
  store.openExistingGeometryMenu(id, event.currentTarget as HTMLElement)
}

function openMenu(event: MouseEvent): void {
  const id = node.value?.id
  if (!id) return
  store.openGeometryMenu(id, event.currentTarget as HTMLElement)
}
</script>

<template>
  <Section v-if="node?.hasGeometry" title="Mesh" section-key="mesh" tone="sub mesh">
    <PropRow label="Configuration">
      <div v-if="!geometry" class="row-actions">
        <button type="button" class="btn" @click="openExisting">Add existing</button>
        <button type="button" class="btn" @click="store.openCreateResource('geometry', node.id)">Create new</button>
      </div>
      <ResourceSlot
        v-else
        :path="geometry.path"
        accept=".json"
        root="res://meshes/"
        @click="openMenu"
        @drop-path="store.assignMeshFile(node.id, $event)"
      />
    </PropRow>
    <template v-if="geometry">
      <PropRow label="Geometry" :reset="() => node && store.resetGeometryType(node.id)">
        <select :value="geometry.type" @change="onType">
          <option v-for="entry in GEOMETRY_CATALOG" :key="entry.type" :value="entry.type">{{ entry.label }}</option>
        </select>
      </PropRow>
      <PropRow
        v-for="spec in specs"
        :key="spec.key"
        :label="spec.label"
        scrub
        :reset="() => node && store.resetGeometryParam(node.id, spec.key)"
        @scrub="scrubParam(spec, $event)"
      >
        <input
          type="number"
          :min="spec.min"
          :max="spec.max"
          :step="spec.step"
          :value="formatNumber(geometry.params[spec.key] ?? spec.default)"
          @change="writeParam(spec, Number(($event.target as HTMLInputElement).value))"
        />
      </PropRow>
      <div v-if="geometry.users > 1" class="hint">Shared by {{ geometry.users }} nodes.</div>
    </template>
  </Section>
</template>
