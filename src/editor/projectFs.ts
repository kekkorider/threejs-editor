import { groupsFromUnknown, type GroupRecord } from './groups'
import { copyPhysicsState, defaultPhysicsState, physicsFromUnknown, PHYSICS_KEY, type PhysicsState } from './physicsSettings'
import { defaultPreviewSunEnvState, PREVIEW_SUN_ENV_KEY, previewFromUnknown, type PreviewSunEnvState } from './previewSunEnv'
import type { GeometryType } from './geometry'
import type { MaterialSide } from './tsl'

/** `res://` root on disk. The dev server creates this folder. */
export const SETTINGS_PATH = 'res://settings.json'
export const RESOURCE_DRAG_TYPE = 'text/x-resource-path'
export const PROJECT_DRAG_TYPE = 'text/x-project-path'
export const LEGACY_SCENE_KEY = 'threejs-starter.scene-files'

const TREE_URL = '/__editor/fs/tree'
const FILE_URL = '/__editor/fs/file'

export interface FsEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  children: FsEntry[]
}

export interface ProjectSettings {
  openPath: string
  physics: PhysicsState
  previewSunEnv: PreviewSunEnvState
  globalGroups: GroupRecord[]
}

export interface MeshFile {
  version: 1
  name: string
  type: GeometryType
  params: Record<string, number>
}

export interface MaterialFile {
  version: 1
  name: string
  source: string
  side: MaterialSide
  transparent: boolean
  wireframe: boolean
}

interface ServerEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  children: ServerEntry[]
}

const files = new Map<string, string>()
const directories = new Set<string>()
let tree: FsEntry[] = []
let settings: ProjectSettings = defaultProjectSettings()
let booted = false
let bootPromise: Promise<void> | null = null
let pullPromise: Promise<string[]> | null = null
let diskQueue: Promise<void> = Promise.resolve()
const listeners = new Set<(changed: string[]) => void>()
const freshWrites = new Map<string, number>()

export function projectReady(): boolean {
  return booted
}

export function defaultProjectSettings(): ProjectSettings {
  return {
    openPath: 'res://World.tscn',
    physics: defaultPhysicsState(),
    previewSunEnv: defaultPreviewSunEnvState(),
    globalGroups: [],
  }
}

export function readSettings(): ProjectSettings {
  return {
    openPath: settings.openPath,
    physics: copyPhysicsState(settings.physics),
    previewSunEnv: {
      sunEnabled: settings.previewSunEnv.sunEnabled,
      envEnabled: settings.previewSunEnv.envEnabled,
      sun: { ...settings.previewSunEnv.sun },
      environment: { ...settings.previewSunEnv.environment },
    },
    globalGroups: settings.globalGroups.map((record) => ({ ...record })),
  }
}

export function writeSettings(next: ProjectSettings): void {
  settings = {
    openPath: next.openPath,
    physics: copyPhysicsState(next.physics),
    previewSunEnv: {
      sunEnabled: next.previewSunEnv.sunEnabled,
      envEnabled: next.previewSunEnv.envEnabled,
      sun: { ...next.previewSunEnv.sun },
      environment: { ...next.previewSunEnv.environment },
    },
    globalGroups: next.globalGroups.map((record) => ({ ...record })),
  }
  writeText(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`)
}

export function ensureProject(): Promise<void> {
  if (!bootPromise) bootPromise = boot()
  return bootPromise
}

export function readCached(path: string): string | null {
  return files.get(path) ?? null
}

export function hasFile(path: string): boolean {
  return files.has(path)
}

export function hasEntry(path: string): boolean {
  return files.has(path) || directories.has(path)
}

export function projectPaths(): string[] {
  return [...files.keys()]
}

export function snapshotTree(): FsEntry[] {
  return structuredClone(tree)
}

function enqueue(task: () => Promise<void>): void {
  diskQueue = diskQueue.then(task).catch((error: unknown) => {
    console.error(error)
  })
}

export function subscribe(listener: (changed: string[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function writeText(path: string, text: string, quiet = false): void {
  if (!path.startsWith('res://') || path.includes('..')) return
  files.set(path, text)
  freshWrites.set(path, Date.now())
  rememberDirectory(parentPath(path))
  tree = buildTree()
  enqueue(async () => {
    await putFile(path, text)
    await pullChanges()
  })
  if (!quiet) emit([path])
}

export function mkdirPath(path: string): void {
  rememberDirectory(path)
  tree = buildTree()
  enqueue(async () => {
    await sendJson('/__editor/fs/mkdir', { path })
    await pullChanges()
  })
  emit([])
}

export function movePath(from: string, to: string): void {
  if (from === to) return
  const movedFiles: [string, string][] = []
  for (const path of files.keys()) {
    const next = retarget(path, from, to)
    if (next !== path) movedFiles.push([path, next])
  }
  for (const [path, next] of movedFiles) {
    const text = files.get(path)
    files.delete(path)
    if (text !== undefined) files.set(next, text)
  }
  const movedDirs = [...directories].filter((dir) => dir === from || dir.startsWith(`${from}/`))
  for (const dir of movedDirs) directories.delete(dir)
  for (const dir of movedDirs) directories.add(retarget(dir, from, to))
  rememberDirectory(parentPath(to))
  const dirty = new Map<string, string>()
  for (const path of rewriteReferences(from, to)) {
    const text = files.get(path)
    if (text !== undefined) dirty.set(path, text)
  }
  tree = buildTree()
  enqueue(async () => {
    await sendJson('/__editor/fs/move', { from, to })
    for (const [path, text] of dirty) {
      files.set(path, text)
      freshWrites.set(path, Date.now())
      await putFile(path, text)
    }
    await pullChanges()
  })
  emit([])
}

export function removePath(path: string): void {
  if (path === SETTINGS_PATH) return
  for (const key of [...files.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) files.delete(key)
  }
  for (const dir of [...directories]) {
    if (dir === path || dir.startsWith(`${path}/`)) directories.delete(dir)
  }
  tree = buildTree()
  enqueue(async () => {
    const response = await fetch(`${FILE_URL}?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(`Could not delete ${path} (${response.status}).`)
    await pullChanges()
  })
  emit([])
}

export function duplicatePath(path: string): string | null {
  const text = files.get(path)
  if (text === undefined) return null
  const next = uniqueCopyPath(path)
  const body = path.endsWith('.tscn') ? text.replaceAll(`"${path}"`, `"${next}"`) : text
  writeText(next, body)
  return next
}

export function rewriteReferences(from: string, to: string): string[] {
  const dirty: string[] = []
  for (const [path, text] of files) {
    if (!path.endsWith('.tscn') && path !== SETTINGS_PATH) continue
    const next = text.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`"${from}/`, `"${to}/`)
    if (next === text) continue
    files.set(path, next)
    freshWrites.set(path, Date.now())
    dirty.push(path)
  }
  if (settings.openPath === from || settings.openPath.startsWith(`${from}/`)) {
    settings = { ...settings, openPath: retarget(settings.openPath, from, to) }
    const text = `${JSON.stringify(settings, null, 2)}\n`
    files.set(SETTINGS_PATH, text)
    freshWrites.set(SETTINGS_PATH, Date.now())
    if (!dirty.includes(SETTINGS_PATH)) dirty.push(SETTINGS_PATH)
  }
  return dirty
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  if (slash <= 'res://'.length) return 'res://'
  return path.slice(0, slash)
}

export function fileNameOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

export function fileStem(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_-]+/g, '')
  return cleaned || 'Resource'
}

export function joinRes(dir: string, name: string): string {
  if (dir === 'res://') return `res://${name}`
  return `${dir}/${name}`
}

export function uniqueFilePath(dir: string, stem: string, ext: string, ignore?: string): string {
  let path = joinRes(dir, `${stem}${ext}`)
  let index = 2
  while ((files.has(path) || directories.has(path)) && path !== ignore) {
    path = joinRes(dir, `${stem}${index}${ext}`)
    index += 1
  }
  return path
}

export function uniqueDirectory(parent: string, stem: string): string {
  let path = joinRes(parent, stem)
  let index = 2
  while (files.has(path) || directories.has(path)) {
    path = joinRes(parent, `${stem}${index}`)
    index += 1
  }
  return path
}

export function writeMeshFile(path: string, file: MeshFile, quiet = false): void {
  writeText(path, `${JSON.stringify({ ...file, version: 1 }, null, 2)}\n`, quiet)
}

export function readMeshFile(path: string): MeshFile | null {
  const text = files.get(path)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as MeshFile
    if (parsed.version !== 1 || typeof parsed.name !== 'string' || typeof parsed.type !== 'string') return null
    if (!parsed.params || typeof parsed.params !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function writeMaterialFile(path: string, file: MaterialFile, quiet = false): void {
  writeText(path, `${JSON.stringify({ ...file, version: 1 }, null, 2)}\n`, quiet)
}

export function readMaterialFile(path: string): MaterialFile | null {
  const text = files.get(path)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as MaterialFile
    if (parsed.version !== 1 || typeof parsed.name !== 'string' || typeof parsed.source !== 'string') return null
    if (parsed.side !== 'front' && parsed.side !== 'back' && parsed.side !== 'double') return null
    if (typeof parsed.transparent !== 'boolean' || typeof parsed.wireframe !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

export function retarget(path: string, from: string, to: string): string {
  if (path === from) return to
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
  return path
}

async function boot(): Promise<void> {
  await pullAll()
  const hadSettings = files.has(SETTINGS_PATH)
  const seed = await import('./projectSeed')
  const legacy = seed.takeLegacy()
  if (!hasSceneFile() && legacy.scenes) seed.migrateScenes(legacy.scenes, legacy.openPath)
  if (!hasSceneFile()) seed.seedStarter()
  const next = files.has(SETTINGS_PATH) ? parseSettings(files.get(SETTINGS_PATH) ?? '') : defaultProjectSettings()
  if (legacy.physics) next.physics = physicsFromUnknown(legacy.physics)
  if (legacy.preview) next.previewSunEnv = previewFromUnknown(legacy.preview)
  if (legacy.groups) next.globalGroups = groupsFromUnknown(legacy.groups)
  if (legacy.openPath && hasPath(legacy.openPath)) next.openPath = legacy.openPath
  else if (!hadSettings && hasPath('res://World.tscn')) next.openPath = 'res://World.tscn'
  if (!hadSettings || legacy.physics || legacy.preview || legacy.groups) writeSettings(next)
  else settings = next
  seed.clearLegacy()
  booted = true
  listen()
  tree = buildTree()
}

function hasSceneFile(): boolean {
  return [...files.keys()].some((path) => path.endsWith('.tscn'))
}

function hasPath(path: string): boolean {
  return files.has(path)
}

async function pullAll(): Promise<void> {
  const entries = await fetchTree()
  const paths = collectFiles(entries)
  directories.clear()
  collectDirs(entries, directories)
  const next = new Map<string, string>()
  await Promise.all(paths.map(async (path) => {
    const text = await fetchFile(path)
    if (text !== null) next.set(path, text)
  }))
  files.clear()
  for (const [path, text] of next) files.set(path, text)
  tree = buildTree()
}

function listen(): void {
  const source = new EventSource('/__editor/fs/events')
  source.onmessage = () => {
    enqueue(async () => {
      if (!pullPromise) pullPromise = pullChanges().finally(() => { pullPromise = null })
      await pullPromise
    })
  }
}

async function pullChanges(): Promise<string[]> {
  const previous = new Map(files)
  const entries = await fetchTree()
  const paths = new Set(collectFiles(entries))
  directories.clear()
  collectDirs(entries, directories)
  const changed: string[] = []
  for (const path of [...files.keys()]) {
    if (!paths.has(path)) {
      files.delete(path)
      changed.push(path)
    }
  }
  await Promise.all([...paths].map(async (path) => {
    if ((freshWrites.get(path) ?? 0) > Date.now() - 500) return
    const text = await fetchFile(path)
    if (text === null) return
    if (previous.get(path) !== text) changed.push(path)
    files.set(path, text)
  }))
  if (files.has(SETTINGS_PATH)) settings = parseSettings(files.get(SETTINGS_PATH) ?? '')
  tree = buildTree()
  emit(changed)
  return changed
}

function emit(changed: string[]): void {
  for (const listener of listeners) listener(changed)
}

async function fetchTree(): Promise<ServerEntry[]> {
  const response = await fetch(TREE_URL)
  if (!response.ok) throw new Error(`Could not read the project folder (${response.status}).`)
  const body = await response.json() as { entries?: ServerEntry[] }
  return body.entries ?? []
}

async function fetchFile(path: string): Promise<string | null> {
  const response = await fetch(`${FILE_URL}?path=${encodeURIComponent(path)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`)
  const body = await response.json() as { text?: string }
  return typeof body.text === 'string' ? body.text : null
}

async function putFile(path: string, text: string): Promise<void> {
  const response = await fetch(FILE_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, text }),
  })
  if (!response.ok) throw new Error(`Could not write ${path} (${response.status}).`)
}

async function sendJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Project request failed (${response.status}).`)
}

function collectFiles(entries: ServerEntry[]): string[] {
  const paths: string[] = []
  for (const entry of entries) {
    if (entry.kind === 'file') paths.push(entry.path)
    else paths.push(...collectFiles(entry.children))
  }
  return paths
}

function collectDirs(entries: ServerEntry[], target: Set<string>): void {
  for (const entry of entries) {
    if (entry.kind !== 'dir') continue
    target.add(entry.path)
    collectDirs(entry.children, target)
  }
}

function rememberDirectory(path: string): void {
  if (!path.startsWith('res://') || path === 'res://') return
  directories.add(path)
  rememberDirectory(parentPath(path))
}

function buildTree(): FsEntry[] {
  const root: FsEntry = { name: '', path: 'res://', kind: 'dir', children: [] }
  const byPath = new Map<string, FsEntry>([['res://', root]])
  const dirs = [...directories].sort((a, b) => a.localeCompare(b))
  for (const path of dirs) {
    const parent = byPath.get(parentPath(path))
    if (!parent) continue
    const node: FsEntry = { name: fileNameOf(path), path, kind: 'dir', children: [] }
    parent.children.push(node)
    byPath.set(path, node)
  }
  const paths = [...files.keys()].sort((a, b) => a.localeCompare(b))
  for (const path of paths) {
    const parent = byPath.get(parentPath(path)) ?? root
    parent.children.push({ name: fileNameOf(path), path, kind: 'file', children: [] })
  }
  sortEntry(root)
  return root.children
}

function sortEntry(entry: FsEntry): void {
  entry.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const child of entry.children) sortEntry(child)
}

function uniqueCopyPath(path: string): string {
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? 'res://' : path.slice(0, slash)
  const name = slash === -1 ? path : path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? '' : name.slice(dot)
  return uniqueFilePath(dir, `${stem}Copy`, ext)
}

function parseSettings(text: string): ProjectSettings {
  const fallback = defaultProjectSettings()
  try {
    const parsed = JSON.parse(text) as Partial<ProjectSettings>
    const openPath = typeof parsed.openPath === 'string' && parsed.openPath.startsWith('res://')
      ? parsed.openPath
      : fallback.openPath
    return {
      openPath,
      physics: physicsFromUnknown(parsed.physics),
      previewSunEnv: previewFromUnknown(parsed.previewSunEnv),
      globalGroups: groupsFromUnknown(parsed.globalGroups),
    }
  } catch {
    return fallback
  }
}

export function legacySceneBlob(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(LEGACY_SCENE_KEY)
}

export function legacyJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function clearLegacyKeys(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(LEGACY_SCENE_KEY)
  localStorage.removeItem(PHYSICS_KEY)
  localStorage.removeItem(PREVIEW_SUN_ENV_KEY)
  localStorage.removeItem('threejs-starter.global-groups')
}
