import * as THREE from "three/webgpu"
import {
  mrt,
  output,
  velocity,
  packNormalToRGB,
  normalView,
  screenUV,
  Fn,
  mix,
  step,
  vec3,
  float
} from 'three/tsl'
import {
  ThreeContextEvents,
  ThreeStart,
} from "three-start"
import { AssetLoaderModule } from './modules/AssetLoader'
import { OrbitControlsModule } from './modules/OrbitControls'
import { InspectorModule } from './modules/Inspector'
import { InputModule } from './modules/Input'
import { physicsEnabled, readPhysicsState } from '../editor/physicsSettings'
import { ensureProject } from '../editor/projectFs'

import { DEFAULT_FLAGS, compileTSLMaterial, presetById } from '../editor/tsl'

//
// Setup
//
export const starter = new ThreeStart()

starter.addModules({
  assetLoader: new AssetLoaderModule(),
  orbitControls: new OrbitControlsModule(),
  inspector: new InspectorModule(),
  input: new InputModule(),
})

const { scene, renderer, camera, modules, scenePass, renderPipeline } = starter.ctx

let shadingMode: 'shaded' | 'debug' = 'shaded'
let applyShading: (mode: 'shaded' | 'debug') => void = (mode) => {
  shadingMode = mode
}

export function setViewportShading(mode: 'shaded' | 'debug'): void {
  applyShading(mode)
}

let bootPromise: Promise<void> | null = null

/** Boot the scene once, then move the same canvas into whichever route is showing. */
export function bootScene(container: HTMLDivElement): Promise<void> {
  if (!bootPromise) {
    bootPromise = bootOnce(container)
    return bootPromise
  }
  return bootPromise.then(() => {
    remountScene(container)
  })
}

/** Drop the canvas only if this container still owns it. */
export function releaseScene(container: HTMLDivElement): void {
  if (!starter.ctx.isMounted) return
  if (starter.ctx.canvasContainer !== container) return
  starter.unmount()
}

function remountScene(container: HTMLDivElement): void {
  if (starter.ctx.canvasContainer === container) return
  if (starter.ctx.isMounted) starter.unmount()
  starter.mount(container)
}

async function bootOnce(container: HTMLDivElement): Promise<void> {
await ensureProject()
if (physicsEnabled()) {
  const { PhysicsModule } = await import('./modules/Physics')
  starter.addModules({ physics: new PhysicsModule(readPhysicsState().world) })
}
starter.start()
starter.ctx.once(ThreeContextEvents.Mount, () => {
  createPostProcessing()
})

starter.mount(container)

await renderer.init()

renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

modules.assetLoader.createKTX2Loader()

//
// One cube. The Lit preset is the MeshStandardNodeMaterial default.
//
const lit = presetById('lit')
const cubeMaterial = compileTSLMaterial(lit.source, { ...DEFAULT_FLAGS })
cubeMaterial.name = lit.name
cubeMaterial.userData.tslSource = lit.source
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMaterial)
cube.name = 'Cube'
cube.castShadow = true
scene.add(cube)

camera.position.set(6.2, 4.2, 7.4)
camera.lookAt(0, 0, 0)
modules.orbitControls.controls.target.set(0, 0, 0)
modules.orbitControls.controls.update()

const hideProfiler = () => {
  try { starter.ctx.modules.inspector.inspector.setVisible(false) } catch { /* mounts lazily */ }
}
hideProfiler()
requestAnimationFrame(hideProfiler)
setTimeout(hideProfiler, 400)
}

//
// Post-processing and Inspector
//
function createPostProcessing(): void {
  scenePass.setMRT(
    mrt({
      output,
      velocity,
      normal: packNormalToRGB(normalView)
    })
  )

  const scenePassColor = scenePass.getTextureNode('output').toInspector('Output')
  scenePass.getLinearDepthNode().toInspector('Depth')
  const scenePassNormal = scenePass.getTextureNode('normal').toInspector('Normal')
  const scenePassVelocity = scenePass.getTextureNode('velocity').toInspector('Velocity')
  // The far plane is far beyond the starter scene, so raw linear depth
  // collapses the floor and cube into a white field. This window covers it.
  const depthDistance = scenePass.getViewZNode().abs().div(32).clamp(0, 1)

  const debugNode = Fn(() => {
    const depthView = vec3(depthDistance)
    // Velocity is an NDC offset per frame, so the raw buffer reads as black.
    // Scale it and center a stationary pixel on gray.
    const motion = scenePassVelocity.mul(48)
    const velocityView = vec3(motion.x, motion.y, float(0)).mul(0.5).add(0.5)
    const top = mix(scenePassColor.renderOutput(), depthView, step(0.5, screenUV.x))
    const bottom = mix(scenePassNormal, velocityView, step(0.5, screenUV.x))
    const out = mix(top, bottom, step(0.5, screenUV.y))

    return out
  })()

  const shadedNode = scenePassColor.renderOutput()
  applyShading = (mode) => {
    shadingMode = mode
    renderPipeline.outputNode = mode === 'debug' ? debugNode : shadedNode
    // Assigning outputNode does not rebuild the pipeline on its own.
    renderPipeline.needsUpdate = true
  }
  applyShading(shadingMode)
}
