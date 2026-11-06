import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const ROOT_NAME = 'threejs-editor'
const PREFIX = '/__editor/fs'

export interface ProjectEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  children: ProjectEntry[]
}

/** Dev-server access to the `threejs-editor` project folder. */
export function editorProjectPlugin(): Plugin {
  return {
    name: 'editor-project',
    configureServer(server) {
      const root = path.resolve(server.config.root, ROOT_NAME)
      fs.mkdirSync(root, { recursive: true })
      const clients = new Set<ServerResponse>()
      let pending: NodeJS.Timeout | null = null
      let pendingName = ''
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        pendingName = filename?.toString() ?? pendingName
        if (pending) clearTimeout(pending)
        pending = setTimeout(() => {
          const payload = `data: ${JSON.stringify({ filename: pendingName })}\n\n`
          pendingName = ''
          for (const client of clients) client.write(payload)
        }, 40)
      })
      server.httpServer?.on('close', () => {
        if (pending) clearTimeout(pending)
        watcher.close()
        for (const client of clients) client.end()
        clients.clear()
      })
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(PREFIX)) {
          next()
          return
        }
        fs.mkdirSync(root, { recursive: true })
        void handle(root, clients, req, res).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 500, { error: message })
        })
      })
    },
  }
}

async function handle(
  root: string,
  clients: Set<ServerResponse>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? PREFIX, 'http://editor.local')
  const route = url.pathname
  if (route === `${PREFIX}/events` && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(': ok\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  if (route === `${PREFIX}/tree` && req.method === 'GET') {
    sendJson(res, 200, { entries: readTree(root, '') })
    return
  }
  if (route.startsWith(`${PREFIX}/raw/`) && req.method === 'GET') {
    const rel = route.slice(`${PREFIX}/raw/`.length).split('/').map((part) => decodeURIComponent(part)).join('/')
    const full = resolveRes(root, `res://${rel}`)
    if (!full) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      sendJson(res, 404, { error: 'File not found.' })
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', mimeOf(full))
    res.setHeader('Cache-Control', 'no-store')
    res.end(fs.readFileSync(full))
    return
  }
  if (route === `${PREFIX}/bytes` && req.method === 'PUT') {
    const full = resolveRes(root, url.searchParams.get('path') ?? '')
    if (!full) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    const data = await readBuffer(req)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, data)
    sendJson(res, 200, { ok: true })
    return
  }
  if (route === `${PREFIX}/file` && req.method === 'GET') {
    const full = resolveRes(root, url.searchParams.get('path') ?? '')
    if (!full) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      sendJson(res, 404, { error: 'File not found.' })
      return
    }
    sendJson(res, 200, { path: url.searchParams.get('path'), text: fs.readFileSync(full, 'utf8') })
    return
  }
  if (route === `${PREFIX}/file` && req.method === 'PUT') {
    const body = JSON.parse(await readBody(req)) as { path?: string, text?: string }
    const full = resolveRes(root, body.path ?? '')
    if (!full || typeof body.text !== 'string') {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body.text)
    sendJson(res, 200, { ok: true })
    return
  }
  if (route === `${PREFIX}/mkdir` && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { path?: string }
    const full = resolveRes(root, body.path ?? '')
    if (!full) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    fs.mkdirSync(full, { recursive: true })
    sendJson(res, 200, { ok: true })
    return
  }
  if (route === `${PREFIX}/move` && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { from?: string, to?: string }
    const from = resolveRes(root, body.from ?? '')
    const to = resolveRes(root, body.to ?? '')
    if (!from || !to) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    if (to === from || to.startsWith(from + path.sep)) {
      sendJson(res, 400, { error: 'Cannot move a folder into itself.' })
      return
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(from, to)
    sendJson(res, 200, { ok: true })
    return
  }
  if (route === `${PREFIX}/file` && req.method === 'DELETE') {
    const target = url.searchParams.get('path') ?? ''
    if (target === 'res://settings.json') {
      sendJson(res, 400, { error: 'settings.json stays in the project.' })
      return
    }
    const full = resolveRes(root, target)
    if (!full) {
      sendJson(res, 400, { error: 'Path is outside the project folder.' })
      return
    }
    if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true })
    sendJson(res, 200, { ok: true })
    return
  }
  sendJson(res, 404, { error: 'Unknown project route.' })
}

function readTree(dir: string, prefix: string): ProjectEntry[] {
  const entries: ProjectEntry[] = []
  const listing = fs.readdirSync(dir, { withFileTypes: true })
  listing.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of listing) {
    if (entry.name.startsWith('.')) continue
    const resPath = prefix ? `${prefix}/${entry.name}` : `res://${entry.name}`
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      entries.push({ name: entry.name, path: resPath, kind: 'dir', children: readTree(full, resPath) })
    } else if (entry.isFile()) {
      entries.push({ name: entry.name, path: resPath, kind: 'file', children: [] })
    }
  }
  return entries
}

function resolveRes(root: string, resPath: string): string | null {
  if (!resPath.startsWith('res://')) return null
  const rel = resPath.slice('res://'.length)
  if (!rel || rel.startsWith('/')) return null
  const parts = rel.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  const full = path.resolve(root, ...parts)
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base + path.sep)) return null
  return full
}

function readBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return readBuffer(req).then((buffer) => buffer.toString('utf8'))
}

function mimeOf(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.hdr': return 'image/vnd.radiance'
    case '.exr': return 'image/x-exr'
    case '.glb': return 'model/gltf-binary'
    case '.gltf': return 'model/gltf+json'
    case '.obj': return 'text/plain'
    case '.wav': return 'audio/wav'
    case '.mp3': return 'audio/mpeg'
    case '.ogg':
    case '.oga': return 'audio/ogg'
    default: return 'application/octet-stream'
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}
