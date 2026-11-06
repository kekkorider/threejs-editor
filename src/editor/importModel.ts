import * as THREE from 'three/webgpu'
import { float, texture, vec3 } from 'three/tsl'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { isGltfPath, type ImportValue } from './importSettings'

/** Load a model and apply the import settings this editor can use. */
export async function loadImportedModel(url: string, path: string, params: Record<string, ImportValue>): Promise<THREE.Group> {
  const root = path.toLowerCase().endsWith('.obj')
    ? await new OBJLoader().loadAsync(url)
    : (await new GLTFLoader().loadAsync(url)).scene
  convertTree(root, params, isGltfPath(path))
  return root
}

function convertTree(object: THREE.Object3D, params: Record<string, ImportValue>, gltf: boolean): void {
  const suffixes = params['nodes/use_name_suffixes'] !== false
  const tangents = params['meshes/ensure_tangents'] !== false
  const keepTextures = !gltf || params['gltf/embedded_image_handling'] !== 0
  for (const child of [...object.children]) {
    if (suffixes && child.name.endsWith('-noimp')) {
      object.remove(child)
      continue
    }
    if (child instanceof THREE.Mesh) {
      child.geometry = prepareGeometry(child.geometry, tangents)
      child.material = makeMaterial(child.material, child.name, keepTextures, suffixes)
      child.castShadow = true
      child.receiveShadow = true
    }
    convertTree(child, params, gltf)
  }
}

function prepareGeometry(geometry: THREE.BufferGeometry, tangents: boolean): THREE.BufferGeometry {
  const next = geometry.clone()
  if (!tangents || next.getAttribute('tangent') || !next.getAttribute('uv') || !next.getAttribute('normal') || !next.index) return next
  try {
    next.computeTangents()
  } catch {
    // Some meshes have no index or no uv seam data. Leave them without tangents.
  }
  return next
}

function makeMaterial(
  source: THREE.Material | THREE.Material[],
  name: string,
  keepTextures: boolean,
  suffixes: boolean,
): THREE.MeshStandardNodeMaterial {
  const first = Array.isArray(source) ? source[0] : source
  const material = new THREE.MeshStandardNodeMaterial()
  const map = keepTextures ? textureOf(first, 'map') : null
  const color = colorOf(first)
  material.colorNode = map ? texture(map) : vec3(color.r, color.g, color.b)
  material.roughnessNode = float(numberOf(first, 'roughness', 0.55))
  material.metalnessNode = float(numberOf(first, 'metalness', 0))
  const normal = keepTextures ? textureOf(first, 'normalMap') : null
  if (normal) material.normalNode = texture(normal)
  const alpha = suffixes && name.endsWith('-alpha')
  if (alpha || boolOf(first, 'transparent')) {
    material.transparent = true
    material.opacity = numberOf(first, 'opacity', 1)
    material.depthWrite = false
  }
  return material
}

function textureOf(material: THREE.Material | undefined, key: 'map' | 'normalMap'): THREE.Texture | null {
  if (!material || !(key in material)) return null
  const value = (material as THREE.MeshStandardMaterial)[key]
  return value instanceof THREE.Texture ? value : null
}

function colorOf(material: THREE.Material | undefined): { r: number, g: number, b: number } {
  if (material && 'color' in material && material.color instanceof THREE.Color) return material.color
  return { r: 0.8, g: 0.8, b: 0.8 }
}

function numberOf(material: THREE.Material | undefined, key: 'roughness' | 'metalness' | 'opacity', fallback: number): number {
  if (!material || !(key in material)) return fallback
  const value = (material as THREE.MeshStandardMaterial)[key]
  return typeof value === 'number' ? value : fallback
}

function boolOf(material: THREE.Material | undefined, key: 'transparent'): boolean {
  if (!material || !(key in material)) return false
  return (material as THREE.MeshStandardMaterial)[key] === true
}
