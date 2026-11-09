import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { ShaderCodeFile } from './projectFs'
import type { MaterialSide } from './tsl'

/** Standalone node editor. The host talks to it with postMessage. */
export const SHADER_EDITOR_ORIGIN = 'https://www.tsl-graph.xyz'

const HOST_SOURCE = 'tsl-graph-host'
const EDITOR_SOURCE = 'tsl-graph-editor'

export type ShaderMaterialType =
  | 'material/node'
  | 'material/standard'
  | 'material/basic'
  | 'material/physical'
  | 'material/phong'
  | 'material/sprite'

export type ShaderUniformType = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'color'

export interface ShaderUniformEntry {
  scope: 'node' | 'global'
  id: string
  name: string
  uniformType: ShaderUniformType
  value: unknown
}

export interface ShaderCodePayload {
  code: string | null
  error: string | null
  imports: Array<{ from: string, imports: string[] }>
}

export interface ShaderUniformRef {
  value: unknown
}

type HostCommand =
  | 'tsl:command:load'
  | 'tsl:command:clear-graph'
  | 'tsl:command:get-graph'
  | 'tsl:command:get-code'
  | 'tsl:command:set-root-material'

type EditorResponse =
  | 'tsl:response:load'
  | 'tsl:response:clear-graph'
  | 'tsl:response:get-graph'
  | 'tsl:response:get-code'
  | 'tsl:response:set-root-material'

const RESPONSE_BY_COMMAND: Record<HostCommand, EditorResponse> = {
  'tsl:command:load': 'tsl:response:load',
  'tsl:command:clear-graph': 'tsl:response:clear-graph',
  'tsl:command:get-graph': 'tsl:response:get-graph',
  'tsl:command:get-code': 'tsl:response:get-code',
  'tsl:command:set-root-material': 'tsl:response:set-root-material',
}

interface Envelope {
  source?: unknown
  type?: unknown
  requestId?: unknown
  payload?: unknown
  error?: unknown
}

interface PendingRequest {
  expectedType: EditorResponse
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: number
}

const LIBRARIES: Record<string, Record<string, unknown>> = {
  three: THREE as unknown as Record<string, unknown>,
  'three/webgpu': THREE as unknown as Record<string, unknown>,
  'three/tsl': TSL as unknown as Record<string, unknown>,
}

/** True when the payload has at least one shader node. */
export function graphHasNodes(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Array.isArray(record.nodes)) return record.nodes.length > 0
  const nested = record.graph
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return false
  const nodes = (nested as { nodes?: unknown }).nodes
  return Array.isArray(nodes) && nodes.length > 0
}

const SURFACE_MATERIALS = new Set([
  'material/standard',
  'material/basic',
  'material/physical',
  'material/phong',
])

const DEFAULT_ACTIVE: Record<string, readonly string[]> = {
  'material/standard': ['colorNode', 'positionNode'],
  'material/basic': ['colorNode', 'positionNode'],
  'material/physical': ['colorNode', 'positionNode'],
  'material/phong': ['colorNode', 'positionNode'],
}

export function sideToMaterialValue(side: MaterialSide): number {
  if (side === 'back') return 1
  if (side === 'double') return 2
  return 0
}

/**
 * Write the inspector Cull and Transparent values onto every surface material node.
 * Side and Transparent are that node's property inputs, so they stay visible and compile.
 */
export function patchGraphMaterialSettings(
  graph: unknown,
  flags: { side: MaterialSide, transparent: boolean },
): unknown {
  const copy = JSON.parse(JSON.stringify(graph)) as unknown
  for (const node of materialNodes(copy)) {
    const type = materialNodeType(node)
    if (!SURFACE_MATERIALS.has(type)) continue
    const data = nodeData(node)
    const values = asRecord(data.values) ?? {}
    values.side = sideToMaterialValue(flags.side)
    values.transparent = flags.transparent
    data.values = values
    const active = Array.isArray(data.activeInputs)
      ? data.activeInputs.filter((item): item is string => typeof item === 'string')
      : [...(DEFAULT_ACTIVE[type] ?? [])]
    for (const key of ['side', 'transparent']) {
      if (!active.includes(key)) active.push(key)
    }
    data.activeInputs = active
  }
  return copy
}

/** Keep generated `material.side` and `material.transparent` lines equal to the inspector. */
export function rewriteMaterialFlagCode(code: string, side: MaterialSide, transparent: boolean): string {
  let next = upsertMaterialAssignment(code, 'side', String(sideToMaterialValue(side)))
  next = upsertMaterialAssignment(next, 'transparent', transparent ? 'true' : 'false')
  return next
}

function upsertMaterialAssignment(code: string, field: string, literal: string): string {
  const pattern = new RegExp(`material\\.${field}\\s*=\\s*[^;\\n]+;`)
  const line = `material.${field} = ${literal};`
  if (pattern.test(code)) return code.replace(pattern, line)
  const end = code.lastIndexOf('\n}')
  if (end < 0) return `${code}\n${line}\n`
  return `${code.slice(0, end)}\n\t${line}${code.slice(end)}`
}

function materialNodes(graph: unknown): Record<string, unknown>[] {
  const record = asRecord(graph)
  if (!record) return []
  if (Array.isArray(record.nodes)) return record.nodes.filter(isNodeRecord)
  const nested = asRecord(record.graph)
  if (nested && Array.isArray(nested.nodes)) return nested.nodes.filter(isNodeRecord)
  return []
}

function isNodeRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function materialNodeType(node: Record<string, unknown>): string {
  if (typeof node.type === 'string' && node.type.startsWith('material/')) return node.type
  const data = asRecord(node.data)
  if (data && typeof data.type === 'string' && data.type.startsWith('material/')) return data.type
  return ''
}

function nodeData(node: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(node.data) ?? {}
  node.data = data
  return data
}

export function shaderEditorUrl(docId: string): string {
  const url = new URL('/editor/standalone', SHADER_EDITOR_ORIGIN)
  url.searchParams.set('graphs', 'material')
  url.searchParams.set('docId', docId)
  url.searchParams.set('targetOrigin', window.location.origin)
  return url.toString()
}

/** Run the editor's `tslGraph(material)` on the live material. */
export function applyGraphCode(material: THREE.Material, code: ShaderCodeFile): Record<string, ShaderUniformRef> {
  const imports: Record<string, unknown> = {}
  for (const spec of code.imports) {
    const library = LIBRARIES[spec.from]
    if (!library) throw new Error(`Missing library ${spec.from}.`)
    for (const name of spec.imports) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`Cannot import ${name}.`)
      if (!(name in library)) throw new Error(`Missing ${name} in ${spec.from}.`)
      imports[name] = library[name]
    }
  }
  const body = code.code
    .replace(/function\s+tslGraph\b/, 'materials[\'tslGraph\'] = function')
    .replace(/\n|^/g, '\n\t')
  const names = Object.keys(imports)
  const source = `return ( THREE, { ${names.join(', ')} } ) => {\n\n\tconst materials = {};\n${body}\n\n\treturn materials;\n\n}`
  const factory = new Function(source)() as (
    three: typeof THREE,
    bindings: Record<string, unknown>,
  ) => Record<string, (target: THREE.Material) => { uniforms?: Record<string, ShaderUniformRef> }>
  const materials = factory(THREE, imports)
  const apply = materials.tslGraph
  if (!apply) throw new Error('The graph did not return tslGraph.')
  const result = apply(material)
  material.needsUpdate = true
  return result?.uniforms ?? {}
}

export function writeUniformValue(target: ShaderUniformRef, uniformType: string, value: unknown): void {
  const current = target.value
  if ((uniformType === 'vec2' || uniformType === 'vec3' || uniformType === 'vec4') && hasFromArray(current)) {
    const source = Array.isArray(value) ? value : []
    current.fromArray(source.map((item) => finiteNumber(item)))
    return
  }
  if (uniformType === 'color' && hasSetHex(current)) {
    const hex = typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'
    current.setHex(Number.parseInt(hex.slice(1), 16))
    return
  }
  if (uniformType === 'bool') {
    target.value = Boolean(value)
    return
  }
  if (uniformType === 'int') {
    target.value = Math.round(finiteNumber(value))
    return
  }
  target.value = finiteNumber(value)
}

function finiteNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function hasFromArray(value: unknown): value is { fromArray: (values: number[]) => void } {
  return !!value && typeof value === 'object' && typeof (value as { fromArray?: unknown }).fromArray === 'function'
}

function hasSetHex(value: unknown): value is { setHex: (hex: number) => void } {
  return !!value && typeof value === 'object' && typeof (value as { setHex?: unknown }).setHex === 'function'
}

function requestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function readCodePayload(value: unknown): ShaderCodePayload {
  const record = asRecord(value)
  const material = asRecord(record?.material) ?? record
  const code = typeof material?.code === 'string' ? material.code : null
  const error = typeof material?.error === 'string' ? material.error : null
  const imports = Array.isArray(material?.imports)
    ? material.imports.flatMap((item) => {
      const spec = asRecord(item)
      if (!spec || typeof spec.from !== 'string' || !Array.isArray(spec.imports)) return []
      return [{
        from: spec.from,
        imports: spec.imports.filter((name): name is string => typeof name === 'string'),
      }]
    })
    : []
  return { code, error, imports }
}

/**
 * One shader window. `host` is the page that contains the iframe.
 * A popup receives the editor messages. The main page does not.
 */
export class ShaderGraphClient {
  onGraphChanged: (() => void) | null = null
  onUniformsChanged: ((uniforms: ShaderUniformEntry[]) => void) | null = null

  private pending = new Map<string, PendingRequest>()
  private readyPromise: Promise<void> = Promise.resolve()
  private markReady: (() => void) | null = null
  private onMessage = (event: MessageEvent): void => {
    if (event.origin !== SHADER_EDITOR_ORIGIN) return
    if (event.source !== this.iframe.contentWindow) return
    const message = event.data as Envelope
    if (!message || message.source !== EDITOR_SOURCE || typeof message.type !== 'string') return

    if (message.requestId && typeof message.requestId === 'string' && message.type.startsWith('tsl:response:')) {
      const waiter = this.pending.get(message.requestId)
      if (!waiter || message.type !== waiter.expectedType) return
      this.pending.delete(message.requestId)
      window.clearTimeout(waiter.timer)
      if (typeof message.error === 'string' && message.error) waiter.reject(new Error(message.error))
      else waiter.resolve(message.payload)
      return
    }

    if (message.type === 'tsl:event:ready') {
      this.markReady?.()
      return
    }
    if (message.type === 'tsl:event:graph-changed') {
      this.onGraphChanged?.()
      return
    }
    if (message.type === 'tsl:event:uniforms-changed') {
      const payload = asRecord(message.payload)
      const uniforms = Array.isArray(payload?.uniforms) ? payload.uniforms.flatMap(readUniform) : []
      this.onUniformsChanged?.(uniforms)
    }
  }

  private iframe: HTMLIFrameElement
  private host: Window

  constructor(iframe: HTMLIFrameElement, host: Window) {
    this.iframe = iframe
    this.host = host
    this.host.addEventListener('message', this.onMessage)
  }

  /** The next `tsl:event:ready` resolves `waitReady`. Call this before you set the iframe URL. */
  arm(): void {
    this.readyPromise = new Promise((resolve) => {
      this.markReady = resolve
    })
  }

  waitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('The shader editor did not open.')), 15000)
      void this.readyPromise.then(() => {
        window.clearTimeout(timer)
        resolve()
      })
    })
  }

  destroy(): void {
    this.host.removeEventListener('message', this.onMessage)
    for (const waiter of this.pending.values()) {
      window.clearTimeout(waiter.timer)
      waiter.reject(new Error('The shader window closed.'))
    }
    this.pending.clear()
    this.onGraphChanged = null
    this.onUniformsChanged = null
  }

  load(graphData: unknown): Promise<void> {
    return this.command('tsl:command:load', { graphData }).then(() => undefined)
  }

  clear(): Promise<void> {
    return this.command('tsl:command:clear-graph').then(() => undefined)
  }

  setRootMaterial(materialType: ShaderMaterialType): Promise<void> {
    return this.command('tsl:command:set-root-material', { materialType }).then(() => undefined)
  }

  getGraph(): Promise<{ graphData: unknown }> {
    return this.command('tsl:command:get-graph').then((payload) => {
      const record = asRecord(payload)
      return { graphData: record && 'graphData' in record ? record.graphData : payload }
    })
  }

  getCode(): Promise<{ material: ShaderCodePayload }> {
    return this.command('tsl:command:get-code').then((payload) => ({ material: readCodePayload(payload) }))
  }

  private command(type: HostCommand, payload?: unknown): Promise<unknown> {
    const id = requestId()
    const expectedType = RESPONSE_BY_COMMAND[type]
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`The shader editor did not answer ${type}.`))
      }, 12000)
      this.pending.set(id, { expectedType, resolve, reject, timer })
      const message: { source: string, type: HostCommand, requestId: string, payload?: unknown } = {
        source: HOST_SOURCE,
        type,
        requestId: id,
      }
      if (payload !== undefined) message.payload = payload
      this.post(message)
    })
  }

  /**
   * The editor accepts a command only when `event.source` is its parent window.
   * The popup parent must send the command. The opener cannot.
   */
  private post(message: { source: string, type: HostCommand, requestId: string, payload?: unknown }): void {
    if (this.host === window) {
      this.iframe.contentWindow?.postMessage(message, SHADER_EDITOR_ORIGIN)
      return
    }
    this.host.postMessage(message, window.location.origin)
  }
}

function readUniform(value: unknown): ShaderUniformEntry[] {
  const record = asRecord(value)
  if (!record) return []
  const scope = record.scope === 'global' ? 'global' : record.scope === 'node' ? 'node' : null
  const uniformType = readUniformType(record.uniformType)
  if (!scope || !uniformType || typeof record.id !== 'string' || typeof record.name !== 'string') return []
  return [{ scope, id: record.id, name: record.name, uniformType, value: record.value }]
}

function readUniformType(value: unknown): ShaderUniformType | null {
  if (value === 'float' || value === 'int' || value === 'bool' || value === 'vec2' || value === 'vec3' || value === 'vec4' || value === 'color') {
    return value
  }
  return null
}
