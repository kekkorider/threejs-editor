<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import PropRow from './PropRow.vue'
import Section from './Section.vue'

const store = useEditorStore()
const node = computed(() => store.selected)
</script>

<template>
  <Section v-if="node?.hasGeometry" title="Material" section-key="geometry" tone="sub mat">
    <PropRow label="">
      <button type="button" class="btn" @click="store.showMaterialInspector(node.id)">Edit material</button>
    </PropRow>
  </Section>
</template>
