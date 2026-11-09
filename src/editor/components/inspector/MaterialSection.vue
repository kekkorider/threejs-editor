<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import PropRow from './PropRow.vue'
import Section from './Section.vue'

const store = useEditorStore()
const node = computed(() => store.selected)

function openExisting(event: MouseEvent): void {
  const id = node.value?.id
  if (!id) return
  store.openExistingMaterialMenu(id, event.currentTarget as HTMLElement)
}
</script>

<template>
  <Section v-if="node?.hasGeometry" title="Material" section-key="geometry" tone="sub mat">
    <PropRow v-if="node.material" label="">
      <div class="row-actions">
        <span class="name">{{ node.material.name }}</span>
        <button type="button" class="btn" @click="store.showMaterialInspector(node.id)">Edit material</button>
      </div>
    </PropRow>
    <PropRow v-else label="">
      <div class="row-actions">
        <button type="button" class="btn" @click="openExisting">Add existing</button>
        <button type="button" class="btn" @click="store.openCreateResource('material', node.id)">Create new</button>
      </div>
    </PropRow>
  </Section>
</template>
