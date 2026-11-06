import { importStream, importWav } from './importAudio'
import {
  artifactPath,
  makeImportFile,
  readImportFile,
  writeImportFile,
  type ImporterId,
  type ImportValue,
} from './importSettings'
import { importTexture } from './importTexture'
import { rawUrl } from './projectFs'

export interface ImportOutcome {
  note: string
  previewUrl: string | null
  dest: string
}

/** Apply the saved import file and write the imported artifact. */
export async function runImport(source: string): Promise<ImportOutcome> {
  const file = readImportFile(source)
  if (!file || file.importer === 'keep') {
    return { note: 'Kept as is.', previewUrl: null, dest: source }
  }
  if (file.importer === 'texture') {
    const result = await importTexture(source, file.params)
    writeImportFile(makeImportFile(source, 'texture', file.params, result.dest))
    return { note: result.note, previewUrl: result.previewUrl, dest: result.dest }
  }
  if (file.importer === 'wav') {
    const params = { ...file.params }
    const result = await importWav(source, params)
    writeImportFile(makeImportFile(source, 'wav', params, result.dest))
    return { note: result.note, previewUrl: null, dest: result.dest }
  }
  if (file.importer === 'mp3' || file.importer === 'oggvorbis') {
    const result = await importStream(source, file.params)
    writeImportFile(makeImportFile(source, file.importer, file.params, source))
    return { note: result.note, previewUrl: null, dest: source }
  }
  writeImportFile(makeImportFile(source, 'scene', file.params, source))
  return { note: sceneNote(file.params), previewUrl: null, dest: source }
}

export function sceneNote(params: Record<string, ImportValue>): string {
  const scale = typeof params['nodes/root_scale'] === 'number' ? params['nodes/root_scale'] : 1
  if (params['nodes/apply_root_scale'] === false) return `Root scale ${scale}. It scales the instance.`
  return `Root scale ${scale}. It scales the meshes.`
}

export function previewFor(source: string, importer: ImporterId, dest: string): string | null {
  if (importer !== 'texture') return null
  const path = dest && dest !== source ? dest : artifactPath(source, source.toLowerCase().endsWith('.hdr') || source.toLowerCase().endsWith('.exr') ? '.hdr' : '.png')
  if (path.endsWith('.hdr')) return null
  return `${rawUrl(path)}?v=${Date.now()}`
}
