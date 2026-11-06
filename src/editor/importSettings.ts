import { readCached, writeText } from './projectFs'

export type ImportValue = boolean | number | string
export type ImporterId = 'texture' | 'scene' | 'wav' | 'mp3' | 'oggvorbis' | 'keep'

export interface ImportChoice {
  label: string
  value: number
}

export interface ImportProp {
  name: string
  label: string
  group: string
  kind: 'bool' | 'float' | 'int' | 'enum' | 'string'
  options?: ImportChoice[]
  min?: number
  max?: number
  step?: number
  show?: (params: Record<string, ImportValue>, path: string) => boolean
}

export interface ImportFile {
  importer: ImporterId
  type: string
  dest: string
  source: string
  params: Record<string, ImportValue>
}

export const IMPORTER_LABEL: Record<ImporterId, string> = {
  texture: 'Texture',
  scene: 'Scene',
  wav: 'WAV',
  mp3: 'MP3',
  oggvorbis: 'Ogg Vorbis',
  keep: 'Keep File (exported as is)',
}

const IMPORTER_TYPE: Record<ImporterId, string> = {
  texture: 'CompressedTexture2D',
  scene: 'PackedScene',
  wav: 'AudioStreamWAV',
  mp3: 'AudioStreamMP3',
  oggvorbis: 'AudioStreamOggVorbis',
  keep: '',
}

const SIZE_LIMITS = [0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]

const TEXTURE_PROPS: ImportProp[] = [
  {
    name: 'compress/mode',
    label: 'Mode',
    group: 'Compress',
    kind: 'enum',
    options: [
      { label: 'Lossless', value: 0 },
      { label: 'Lossy', value: 1 },
    ],
  },
  {
    name: 'compress/lossy_quality',
    label: 'Lossy Quality',
    group: 'Compress',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    show: (params) => params['compress/mode'] === 1,
  },
  {
    name: 'process/fix_alpha_border',
    label: 'Fix Alpha Border',
    group: 'Process',
    kind: 'bool',
  },
  {
    name: 'process/premult_alpha',
    label: 'Premult Alpha',
    group: 'Process',
    kind: 'bool',
  },
  {
    name: 'process/normal_map_invert_y',
    label: 'Normal Map Invert Y',
    group: 'Process',
    kind: 'bool',
  },
  {
    name: 'process/hdr_as_srgb',
    label: 'HDR as sRGB',
    group: 'Process',
    kind: 'bool',
    show: (_params, path) => isHdrPath(path),
  },
  {
    name: 'process/hdr_clamp_exposure',
    label: 'HDR Clamp Exposure',
    group: 'Process',
    kind: 'bool',
    show: (_params, path) => isHdrPath(path),
  },
  {
    name: 'process/size_limit',
    label: 'Size Limit',
    group: 'Process',
    kind: 'enum',
    options: SIZE_LIMITS.map((value) => ({ label: value === 0 ? 'Disabled' : String(value), value })),
  },
]

const SCENE_PROPS: ImportProp[] = [
  {
    name: 'nodes/root_type',
    label: 'Root Type',
    group: 'Nodes',
    kind: 'string',
  },
  {
    name: 'nodes/apply_root_scale',
    label: 'Apply Root Scale',
    group: 'Nodes',
    kind: 'bool',
  },
  {
    name: 'nodes/root_scale',
    label: 'Root Scale',
    group: 'Nodes',
    kind: 'float',
    min: 0.001,
    max: 1000,
    step: 0.001,
  },
  {
    name: 'nodes/use_name_suffixes',
    label: 'Use Name Suffixes',
    group: 'Nodes',
    kind: 'bool',
  },
  {
    name: 'meshes/ensure_tangents',
    label: 'Ensure Tangents',
    group: 'Meshes',
    kind: 'bool',
  },
  {
    name: 'gltf/embedded_image_handling',
    label: 'Embedded Texture Handling',
    group: 'glTF',
    kind: 'enum',
    options: [
      { label: 'Discard All Textures', value: 0 },
      { label: 'Embed as Uncompressed', value: 3 },
    ],
    show: (_params, path) => isGltfPath(path),
  },
]

const WAV_PROPS: ImportProp[] = [
  { name: 'force/8_bit', label: '8 Bit', group: 'Force', kind: 'bool' },
  { name: 'force/mono', label: 'Mono', group: 'Force', kind: 'bool' },
  { name: 'force/max_rate', label: 'Max Rate', group: 'Force', kind: 'bool' },
  {
    name: 'force/max_rate_hz',
    label: 'Max Rate Hz',
    group: 'Force',
    kind: 'float',
    min: 1000,
    max: 192000,
    step: 1,
    show: (params) => params['force/max_rate'] === true,
  },
  { name: 'edit/trim', label: 'Trim', group: 'Edit', kind: 'bool' },
  { name: 'edit/normalize', label: 'Normalize', group: 'Edit', kind: 'bool' },
  {
    name: 'edit/loop_mode',
    label: 'Loop Mode',
    group: 'Edit',
    kind: 'enum',
    options: [
      { label: 'Detect From WAV', value: 0 },
      { label: 'Disabled', value: 1 },
      { label: 'Forward', value: 2 },
      { label: 'Ping-Pong', value: 3 },
      { label: 'Backward', value: 4 },
    ],
  },
  {
    name: 'edit/loop_begin',
    label: 'Loop Begin',
    group: 'Edit',
    kind: 'int',
    min: 0,
    step: 1,
    show: (params) => loopPointsVisible(params['edit/loop_mode']),
  },
  {
    name: 'edit/loop_end',
    label: 'Loop End',
    group: 'Edit',
    kind: 'int',
    step: 1,
    show: (params) => loopPointsVisible(params['edit/loop_mode']),
  },
]

const STREAM_PROPS: ImportProp[] = [
  { name: 'loop', label: 'Loop', group: 'Edit', kind: 'bool' },
  { name: 'loop_offset', label: 'Loop Offset', group: 'Edit', kind: 'float', min: 0, step: 0.01 },
  { name: 'bpm', label: 'BPM', group: 'Edit', kind: 'float', min: 0, max: 400, step: 0.01 },
  { name: 'beat_count', label: 'Beat Count', group: 'Edit', kind: 'int', min: 0, step: 1 },
]

const PROPS: Record<ImporterId, ImportProp[]> = {
  texture: TEXTURE_PROPS,
  scene: SCENE_PROPS,
  wav: WAV_PROPS,
  mp3: STREAM_PROPS,
  oggvorbis: STREAM_PROPS,
  keep: [],
}

const DEFAULTS: Record<ImporterId, Record<string, ImportValue>> = {
  texture: {
    'compress/mode': 0,
    'compress/lossy_quality': 0.7,
    'process/fix_alpha_border': true,
    'process/premult_alpha': false,
    'process/normal_map_invert_y': false,
    'process/hdr_as_srgb': false,
    'process/hdr_clamp_exposure': false,
    'process/size_limit': 0,
  },
  scene: {
    'nodes/root_type': '',
    'nodes/apply_root_scale': true,
    'nodes/root_scale': 1,
    'nodes/use_name_suffixes': true,
    'meshes/ensure_tangents': true,
    'gltf/embedded_image_handling': 3,
  },
  wav: {
    'force/8_bit': false,
    'force/mono': false,
    'force/max_rate': false,
    'force/max_rate_hz': 44100,
    'edit/trim': false,
    'edit/normalize': false,
    'edit/loop_mode': 0,
    'edit/loop_begin': 0,
    'edit/loop_end': -1,
  },
  mp3: {
    loop: false,
    loop_offset: 0,
    bpm: 0,
    beat_count: 0,
  },
  oggvorbis: {
    loop: false,
    loop_offset: 0,
    bpm: 0,
    beat_count: 0,
  },
  keep: {},
}

export const MODEL_DRAG_TYPE = 'text/x-model-path'
export const MODEL_DRAG_PREFIX = 'model:'

export function importFilePath(source: string): string {
  return `${source}.import`
}

export function isHdrPath(path: string): boolean {
  const ext = extensionOf(path)
  return ext === '.hdr' || ext === '.exr'
}

export function isGltfPath(path: string): boolean {
  const ext = extensionOf(path)
  return ext === '.gltf' || ext === '.glb'
}

export function isModelFile(path: string): boolean {
  const ext = extensionOf(path)
  return ext === '.gltf' || ext === '.glb' || ext === '.obj'
}

export function importerForPath(path: string): ImporterId | null {
  const ext = extensionOf(path)
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.hdr' || ext === '.exr') return 'texture'
  if (isModelFile(path)) return 'scene'
  if (ext === '.wav') return 'wav'
  if (ext === '.mp3') return 'mp3'
  if (ext === '.ogg' || ext === '.oga') return 'oggvorbis'
  return null
}

export function importProps(importer: ImporterId): ImportProp[] {
  return PROPS[importer]
}

export function defaultImportParams(importer: ImporterId): Record<string, ImportValue> {
  return { ...DEFAULTS[importer] }
}

export function visibleImportProps(importer: ImporterId, params: Record<string, ImportValue>, path: string): ImportProp[] {
  return importProps(importer).filter((prop) => !prop.show || prop.show(params, path))
}

/** Godot saves VRAM modes this editor cannot encode. Those files open as Lossless. */
export function unsupportedTextureMode(value: ImportValue): string | null {
  if (value === 2) return 'VRAM Compressed'
  if (value === 3) return 'VRAM Uncompressed'
  if (value === 4) return 'Basis Universal'
  return null
}

export function coerceImportParams(importer: ImporterId, raw: Record<string, ImportValue>): Record<string, ImportValue> {
  const next = defaultImportParams(importer)
  for (const prop of importProps(importer)) {
    if (!(prop.name in raw)) continue
    next[prop.name] = coerceProp(prop, raw[prop.name], next[prop.name] ?? false)
  }
  if (importer === 'texture') {
    const mode = unsupportedTextureMode(raw['compress/mode'] ?? next['compress/mode'] ?? 0)
    if (mode) next['compress/mode'] = 0
  }
  return next
}

export function readImportFile(source: string): ImportFile | null {
  const text = readCached(importFilePath(source))
  if (!text) return null
  return parseImport(text, source)
}

export function writeImportFile(file: ImportFile): void {
  writeText(importFilePath(file.source), formatImport(file))
}

export function makeImportFile(
  source: string,
  importer: ImporterId,
  params: Record<string, ImportValue>,
  dest = source,
): ImportFile {
  return {
    importer,
    type: IMPORTER_TYPE[importer],
    dest,
    source,
    params: coerceImportParams(importer, params),
  }
}

export function artifactPath(source: string, ext: string): string {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const name = source.slice(source.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
  const safe = name.replace(/[^A-Za-z0-9_-]+/g, '') || 'import'
  return `res://.godot/imported/${safe}-${(hash >>> 0).toString(16)}${ext}`
}

export function writeModelDrag(transfer: DataTransfer, path: string): void {
  transfer.effectAllowed = 'copy'
  transfer.setData('text/plain', `${MODEL_DRAG_PREFIX}${path}`)
  try {
    transfer.setData(MODEL_DRAG_TYPE, path)
  } catch {
    // text/plain still carries the path.
  }
}

export function isModelDrag(transfer: DataTransfer | null): boolean {
  return !!transfer && [...transfer.types].includes(MODEL_DRAG_TYPE)
}

export function modelDragPath(transfer: DataTransfer | null): string | null {
  if (!transfer) return null
  const plain = transfer.getData('text/plain')
  if (plain.startsWith(MODEL_DRAG_PREFIX)) return plain.slice(MODEL_DRAG_PREFIX.length)
  const typed = transfer.getData(MODEL_DRAG_TYPE)
  return typed || null
}

export function formatImport(file: ImportFile): string {
  const lines = [
    '[remap]',
    '',
    `importer="${file.importer}"`,
    `type="${file.type}"`,
    `path="${file.dest}"`,
    '',
    '[deps]',
    '',
    `source_file="${file.source}"`,
    `dest_files=["${file.dest}"]`,
    '',
    '[params]',
    '',
  ]
  for (const prop of importProps(file.importer)) {
    const value = file.params[prop.name]
    if (value === undefined) continue
    lines.push(`${prop.name}=${formatValue(value)}`)
  }
  lines.push('')
  return lines.join('\n')
}

function parseImport(text: string, fallbackSource: string): ImportFile | null {
  let section = ''
  let importer: ImporterId = 'keep'
  let type = ''
  let dest = fallbackSource
  let source = fallbackSource
  const params: Record<string, ImportValue> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed.slice(1, -1)
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const raw = trimmed.slice(eq + 1).trim()
    const value = parseValue(raw)
    if (section === 'remap' && key === 'importer' && isImporter(value)) importer = value
    else if (section === 'remap' && key === 'type' && typeof value === 'string') type = value
    else if (section === 'remap' && key === 'path' && typeof value === 'string') dest = value
    else if (section === 'deps' && key === 'source_file' && typeof value === 'string') source = value
    else if (section === 'params') params[key] = value
  }
  if (!isImporter(importer)) return null
  return { importer, type, dest, source, params: coerceImportParams(importer, params) }
}

function isImporter(value: ImportValue): value is ImporterId {
  return value === 'texture' || value === 'scene' || value === 'wav' || value === 'mp3' || value === 'oggvorbis' || value === 'keep'
}

function parseValue(raw: string): ImportValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('"') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') return parsed
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    } catch {
      return raw.replace(/^"|"$/g, '')
    }
  }
  const number = Number(raw)
  if (raw !== '' && Number.isFinite(number)) return number
  return raw.replace(/^"|"$/g, '')
}

function formatValue(value: ImportValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function coerceProp(prop: ImportProp, value: ImportValue | undefined, fallback: ImportValue): ImportValue {
  if (prop.kind === 'bool') return value === true || value === 'true'
  if (prop.kind === 'string') return typeof value === 'string' ? value : String(fallback)
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  if (prop.kind === 'int' || prop.kind === 'enum') return Math.round(number)
  return number
}

function loopPointsVisible(mode: ImportValue | undefined): boolean {
  return mode === 2 || mode === 3 || mode === 4
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot <= path.lastIndexOf('/')) return ''
  return path.slice(dot).toLowerCase()
}
