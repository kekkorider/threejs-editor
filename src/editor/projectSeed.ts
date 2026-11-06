import spinSource from '../webgl/behaviors/Spin.ts?raw'
import { defaultParams } from './geometry'
import { GLOBAL_GROUPS_KEY } from './groups'
import { PHYSICS_KEY } from './physicsSettings'
import { PREVIEW_SUN_ENV_KEY } from './previewSunEnv'
import {
  clearLegacyKeys,
  hasFile,
  legacyJson,
  legacySceneBlob,
  writeText,
} from './projectFs'
import {
  isSceneFile,
  rememberOpenPath,
  writeSceneFile,
  type SceneFile,
} from './sceneFile'
import { DEFAULT_FLAGS, presetById } from './tsl'

export interface LegacyBundle {
  scenes: string | null
  openPath: string | null
  physics: unknown
  preview: unknown
  groups: unknown
}

export function takeLegacy(): LegacyBundle {
  const scenes = legacySceneBlob()
  let openPath: string | null = null
  if (scenes) {
    try {
      const parsed = JSON.parse(scenes) as { openPath?: unknown }
      if (typeof parsed.openPath === 'string') openPath = parsed.openPath
    } catch {
      openPath = null
    }
  }
  return {
    scenes,
    openPath,
    physics: legacyJson(PHYSICS_KEY),
    preview: legacyJson(PREVIEW_SUN_ENV_KEY),
    groups: legacyJson(GLOBAL_GROUPS_KEY),
  }
}

export function clearLegacy(): void {
  clearLegacyKeys()
}

/** Copy browser scene files onto disk once. Each embedded mesh and material becomes its own file. */
export function migrateScenes(raw: string, openPath: string | null): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return
  }
  const files = (parsed as { files?: unknown }).files
  if (!Array.isArray(files)) return
  for (const file of files) {
    if (isSceneFile(file)) writeSceneFile(file)
  }
  if (openPath) rememberOpenPath(openPath)
}

/** First project: World.tscn, the starter meshes and materials, and Spin.ts. */
export function seedStarter(): void {
  const floorParams = { ...defaultParams('box'), width: 10, height: 0.5, depth: 10 }
  const cubeParams = defaultParams('box')
  const uv = presetById('uv').source
  const flags = { ...DEFAULT_FLAGS }
  const file: SceneFile = {
    version: 1,
    path: 'res://World.tscn',
    scene: {
      background: '#3a3a3a',
      backgroundIntensity: 1,
      environmentIntensity: 0.55,
      shadows: true,
      shadowType: 'pcf',
      environment: null,
    },
    grid: {
      visible: true,
      size: 40,
      divisions: 40,
      center: '#8a8a8a',
      color: '#2a2a2a',
      position: { x: 0, y: 0, z: 0 },
    },
    geometries: [
      { id: 'g1', name: 'Floor', type: 'box', params: floorParams },
      { id: 'g2', name: 'Cube', type: 'box', params: cubeParams },
    ],
    materials: [
      { id: 'm1', name: 'UV', source: uv, ...flags },
      { id: 'm2', name: 'Scale', source: uv, ...flags },
    ],
    nodes: [
      {
        id: 'root',
        name: 'World',
        kind: 'Node3D',
        parentId: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        castShadow: false,
        receiveShadow: false,
        geometryId: null,
        materialId: null,
        light: null,
        components: [],
        groups: [],
        signals: [],
      },
      {
        id: 'n1',
        name: 'Floor',
        kind: 'MeshInstance3D',
        parentId: 'root',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        castShadow: true,
        receiveShadow: true,
        geometryId: 'g1',
        materialId: 'm1',
        light: null,
        components: [],
        groups: [],
        signals: [],
      },
      {
        id: 'n2',
        name: 'Cube',
        kind: 'MeshInstance3D',
        parentId: 'root',
        position: [0, 1.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        castShadow: true,
        receiveShadow: false,
        geometryId: 'g2',
        materialId: 'm2',
        light: null,
        components: [
          { name: 'Spin', enabled: true, parameters: { axis: 'y', speed: 1 } },
          { name: 'Spin', enabled: true, parameters: { axis: 'z', speed: 0.87 } },
        ],
        groups: [],
        signals: [],
      },
    ],
    groups: [],
    globalGroups: [],
    connections: [],
  }
  if (!isSceneFile(file)) throw new Error('Starter scene is invalid.')
  writeSceneFile(file)
  if (!hasFile('res://components/Spin.ts')) writeText('res://components/Spin.ts', spinSource, true)
}
