<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import CodeEditor from './CodeEditor.vue'
import Icon from './Icon.vue'
import { defaultCameraSettings } from '../camera'
import { GEOMETRY_CATALOG, defaultParams, geometryEntry, type GeometryType, type ParamSpec } from '../geometry'
import { kindClass, kindIcon } from '../lib/format'
import { NODE_TYPES, type NodeKind } from '../state'
import { useEditorStore } from '../stores/editor'
import { DEFAULT_FLAGS, TSL_PRESETS, presetById, type MaterialSide } from '../tsl'

const store = useEditorStore()
const initial = presetById(store.createPreset || 'lit')
type PickId = NodeKind | 'Material' | 'Geometry'
const draft = reactive({
  pick: (store.createResource === 'material' ? 'Material' : store.createResource === 'geometry' ? 'Geometry' : store.createKind) as PickId,
  query: '',
  name: '',
  geometryType: 'box' as GeometryType,
  params: defaultParams('box'),
  presetId: initial.id,
  source: initial.source,
  side: DEFAULT_FLAGS.side as MaterialSide,
  transparent: DEFAULT_FLAGS.transparent,
  wireframe: DEFAULT_FLAGS.wireframe,
  color: '#fff4e4',
  ground: '#3c342c',
  intensity: 2.4,
  range: 12,
  angle: 35,
  penumbra: 0.4,
  projection: defaultCameraSettings().projection,
  fov: defaultCameraSettings().fov,
  near: defaultCameraSettings().near,
  far: defaultCameraSettings().far,
  zoom: defaultCameraSettings().zoom,
  left: defaultCameraSettings().left,
  right: defaultCameraSettings().right,
  top: defaultCameraSettings().top,
  bottom: defaultCameraSettings().bottom,
})
const error = ref('')
const groups = ['Node', 'Mesh', 'Camera', 'Light', 'Physics', 'Resource']
const resources = [
  {
    id: 'Material' as const,
    label: 'Material',
    group: 'Resource',
    description: 'A TSL material file. Set the name, the preset, the source, and the surface flags. The file is not added to the scene.',
    inherits: 'Material',
  },
  {
    id: 'Geometry' as const,
    label: 'Geometry',
    group: 'Resource',
    description: 'A mesh primitive file. Set the name, the type, and every size. The file is not added to the scene.',
    inherits: 'Geometry',
  },
]

const entry = computed(() => {
  const resource = resources.find((item) => item.id === draft.pick)
  if (resource) return resource
  return NODE_TYPES.find((item) => item.kind === draft.pick) ?? NODE_TYPES[0]!
})
const specs = computed(() => geometryEntry(draft.geometryType).params)
const isResource = computed(() => draft.pick === 'Material' || draft.pick === 'Geometry')

function entriesFor(group: string): Array<{ id: PickId, label: string }> {
  const query = draft.query.trim().toLowerCase()
  const nodes = NODE_TYPES.filter((item) => item.group === group).map((item) => ({ id: item.kind as PickId, label: item.label }))
  const extra = resources.filter((item) => item.group === group).map((item) => ({ id: item.id as PickId, label: item.label }))
  return [...nodes, ...extra].filter((item) => !query || item.label.toLowerCase().includes(query))
}

function choose(id: PickId): void {
  draft.pick = id
}

function onGeometry(event: Event): void {
  draft.geometryType = (event.target as HTMLSelectElement).value as GeometryType
  draft.params = defaultParams(draft.geometryType)
}

function onPreset(event: Event): void {
  const next = presetById((event.target as HTMLSelectElement).value)
  draft.presetId = next.id
  draft.source = next.source
}

function setParam(spec: ParamSpec, event: Event): void {
  draft.params[spec.key] = Number((event.target as HTMLInputElement).value)
}

function submit(): void {
  const resource = draft.pick === 'Material' ? 'material' : draft.pick === 'Geometry' ? 'geometry' : 'node'
  const message = store.createFromDraft({
    kind: resource === 'node' ? draft.pick as NodeKind : 'Node3D',
    resource,
    name: draft.name,
    side: draft.side,
    transparent: draft.transparent,
    wireframe: draft.wireframe,
    assignNodeId: store.createAssignNodeId,
    geometryType: draft.geometryType,
    params: { ...draft.params },
    source: draft.source,
    color: draft.color,
    ground: draft.ground,
    intensity: draft.intensity,
    range: draft.range,
    angle: draft.angle,
    penumbra: draft.penumbra,
    projection: draft.projection,
    fov: draft.fov,
    near: draft.near,
    far: draft.far,
    zoom: draft.zoom,
    left: draft.left,
    right: draft.right,
    top: draft.top,
    bottom: draft.bottom,
  })
  error.value = message ?? ''
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    store.createOpen = false
    return
  }
  if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'TEXTAREA') {
    event.preventDefault()
    submit()
  }
}

function onBackdrop(event: PointerEvent): void {
  if (event.target === event.currentTarget) store.createOpen = false
}
</script>

<template>
  <div class="modal-back" @pointerdown="onBackdrop">
    <div class="dialog" @keydown="onKey">
      <div class="dialog-title">
        <span>Create New Node</span>
        <span class="spacer" />
        <button type="button" class="icon-btn" @click="store.createOpen = false">
          <Icon name="close" />
        </button>
      </div>
      <div class="dialog-body">
        <div class="dialog-list">
          <input v-model="draft.query" class="filter dialog-filter" placeholder="Filter nodes" />
          <div class="tree dialog-nodes">
            <template v-for="group in groups" :key="group">
              <template v-if="entriesFor(group).length">
                <div class="group-label">{{ group }}</div>
                <div
                  v-for="item in entriesFor(group)"
                  :key="item.id"
                  class="tree-row"
                  :class="{ selected: item.id === draft.pick }"
                  style="padding-left: 12px"
                  @click="choose(item.id)"
                  @dblclick="submit"
                >
                  <span class="kind-icon" :class="item.id === 'Material' ? 'mat' : item.id === 'Geometry' ? 'mesh' : kindClass(item.id)">
                    <Icon :name="item.id === 'Material' ? 'material' : item.id === 'Geometry' ? 'mesh' : kindIcon(item.id)" />
                  </span>
                  <span class="label">{{ item.label }}</span>
                </div>
              </template>
            </template>
          </div>
        </div>
        <div class="dialog-detail">
          <h2>{{ entry.label }}</h2>
          <div class="inherits" style="padding: 0">{{ entry.inherits }}</div>
          <p class="desc">{{ entry.description }}</p>
          <template v-if="draft.pick === 'Material'">
            <div class="prop">
              <div class="prop-label">TSL Preset</div>
              <select :value="draft.presetId" @change="onPreset">
                <option v-for="item in TSL_PRESETS" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
            <CodeEditor v-model="draft.source" />
            <div class="prop">
              <div class="prop-label">Cull</div>
              <select v-model="draft.side">
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="double">Double</option>
              </select>
            </div>
            <div class="prop">
              <div class="prop-label">Transparent</div>
              <input v-model="draft.transparent" type="checkbox" />
            </div>
            <div class="prop">
              <div class="prop-label">Wireframe</div>
              <input v-model="draft.wireframe" type="checkbox" />
            </div>
            <div class="hint">{{ error }}</div>
          </template>
          <template v-else-if="draft.pick === 'Geometry' || draft.pick === 'MeshInstance3D'">
            <div class="prop">
              <div class="prop-label">Geometry</div>
              <select :value="draft.geometryType" @change="onGeometry">
                <option v-for="item in GEOMETRY_CATALOG" :key="item.type" :value="item.type">{{ item.label }}</option>
              </select>
            </div>
            <div v-for="spec in specs" :key="spec.key" class="prop">
              <div class="prop-label">{{ spec.label }}</div>
              <input
                type="number"
                :min="spec.min"
                :max="spec.max"
                :step="spec.step"
                :value="draft.params[spec.key]"
                @change="setParam(spec, $event)"
              />
            </div>
            <template v-if="draft.pick === 'MeshInstance3D'">
              <div class="prop">
                <div class="prop-label">TSL Preset</div>
                <select :value="draft.presetId" @change="onPreset">
                  <option v-for="item in TSL_PRESETS" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </div>
              <CodeEditor v-model="draft.source" />
            </template>
            <div class="hint">{{ error }}</div>
          </template>
          <template v-else-if="draft.pick === 'Camera3D'">
            <div class="prop">
              <div class="prop-label">Projection</div>
              <select v-model="draft.projection">
                <option value="perspective">Perspective</option>
                <option value="orthographic">Orthographic</option>
              </select>
            </div>
            <div v-if="draft.projection === 'perspective'" class="prop">
              <div class="prop-label">FOV</div>
              <input v-model.number="draft.fov" type="number" min="1" max="179" step="0.1" />
            </div>
            <template v-else>
              <div class="prop">
                <div class="prop-label">Left</div>
                <input v-model.number="draft.left" type="number" step="0.1" />
              </div>
              <div class="prop">
                <div class="prop-label">Right</div>
                <input v-model.number="draft.right" type="number" step="0.1" />
              </div>
              <div class="prop">
                <div class="prop-label">Top</div>
                <input v-model.number="draft.top" type="number" step="0.1" />
              </div>
              <div class="prop">
                <div class="prop-label">Bottom</div>
                <input v-model.number="draft.bottom" type="number" step="0.1" />
              </div>
            </template>
            <div class="prop">
              <div class="prop-label">Near</div>
              <input v-model.number="draft.near" type="number" min="0" step="0.01" />
            </div>
            <div class="prop">
              <div class="prop-label">Far</div>
              <input v-model.number="draft.far" type="number" min="0.01" step="0.1" />
            </div>
            <div class="prop">
              <div class="prop-label">Zoom</div>
              <input v-model.number="draft.zoom" type="number" min="0.001" step="0.01" />
            </div>
            <div class="hint">The inspector edits the rest of the lens after the camera is created.</div>
          </template>
          <template v-else-if="draft.pick !== 'Node3D' && draft.pick !== 'Body' && !isResource">
            <div class="prop">
              <div class="prop-label">Color</div>
              <input v-model="draft.color" type="color" />
            </div>
            <div class="prop">
              <div class="prop-label">Energy</div>
              <input v-model.number="draft.intensity" type="number" min="0" max="50" step="0.1" />
            </div>
            <div v-if="draft.pick === 'HemisphereLight3D'" class="prop">
              <div class="prop-label">Ground</div>
              <input v-model="draft.ground" type="color" />
            </div>
            <div v-if="draft.pick === 'OmniLight3D' || draft.pick === 'SpotLight3D'" class="prop">
              <div class="prop-label">Range</div>
              <input v-model.number="draft.range" type="number" min="0" max="200" step="0.1" />
            </div>
            <template v-if="draft.pick === 'SpotLight3D'">
              <div class="prop">
                <div class="prop-label">Angle</div>
                <input v-model.number="draft.angle" type="number" min="1" max="90" step="1" />
              </div>
              <div class="prop">
                <div class="prop-label">Penumbra</div>
                <input v-model.number="draft.penumbra" type="number" min="0" max="1" step="0.01" />
              </div>
            </template>
          </template>
        </div>
      </div>
      <div class="dialog-actions">
        <label class="name-label">Name</label>
        <input v-model="draft.name" type="text" :placeholder="entry.label" />
        <span class="spacer" />
        <button type="button" class="btn" @click="store.createOpen = false">Cancel</button>
        <button type="button" class="btn primary" @click="submit">Create</button>
      </div>
    </div>
  </div>
</template>

<style>
.dialog-actions .name-label {
  flex: none;
  color: var(--font-dim);
}

.dialog-actions input[type="text"] {
  width: 220px;
  height: 28px;
  background: #1e1e1e;
  border: 1px solid #121212;
  border-radius: 3px;
  padding: 0 8px;
}
</style>
