import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { FloatType, type DataTexture } from 'three/webgpu'
import { artifactPath, isHdrPath, type ImportValue } from './importSettings'
import {
  clampHdrExposure,
  encodeRgbe,
  fixAlphaBorder,
  invertGreen,
  limitSize,
  premultiplyAlpha,
  resizeFloat,
  resizeRgba,
  srgbToLinearImage,
  toneMapPreview,
  type FloatImage,
} from './importPixels'
import { readBytes, writeBytes } from './projectFs'

export interface TextureImportResult {
  dest: string
  note: string
  previewUrl: string
}

export async function importTexture(source: string, params: Record<string, ImportValue>): Promise<TextureImportResult> {
  const bytes = readBytes(source)
  if (!bytes) throw new Error('The texture is not in the project.')
  if (isHdrPath(source)) return importHdr(source, bytes, params)
  return importRaster(source, bytes, params)
}

async function importRaster(source: string, bytes: Uint8Array, params: Record<string, ImportValue>): Promise<TextureImportResult> {
  const bitmap = await createImageBitmap(new Blob([copyBytes(bytes)]))
  const fitted = limitSize(bitmap.width, bitmap.height, numberParam(params, 'process/size_limit'))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The texture could not be read.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  let image = context.getImageData(0, 0, canvas.width, canvas.height)
  if (fitted.width !== canvas.width || fitted.height !== canvas.height) {
    const resized = resizeRgba(image.data, image.width, image.height, fitted.width, fitted.height)
    image = imageFromSamples(resized, fitted.width, fitted.height)
  }
  if (params['process/fix_alpha_border'] === true) fixAlphaBorder(image.data, image.width, image.height)
  if (params['process/normal_map_invert_y'] === true) invertGreen(image.data)
  if (params['process/premult_alpha'] === true) premultiplyAlpha(image.data)
  const lossy = params['compress/mode'] === 1
  const quality = numberParam(params, 'compress/lossy_quality') || 0.7
  const blob = await encodeCanvas(image, lossy, quality)
  const ext = lossy ? '.webp' : '.png'
  const dest = artifactPath(source, ext)
  writeBytes(dest, new Uint8Array(await blob.arrayBuffer()))
  return {
    dest,
    note: `${image.width}×${image.height}, ${lossy ? 'Lossy' : 'Lossless'}`,
    previewUrl: URL.createObjectURL(blob),
  }
}

async function importHdr(source: string, bytes: Uint8Array, params: Record<string, ImportValue>): Promise<TextureImportResult> {
  let image = await decodeHdr(source, bytes)
  if (params['process/hdr_as_srgb'] === true) srgbToLinearImage(image)
  if (params['process/hdr_clamp_exposure'] === true) clampHdrExposure(image)
  const fitted = limitSize(image.width, image.height, numberParam(params, 'process/size_limit'))
  if (fitted.width !== image.width || fitted.height !== image.height) image = resizeFloat(image, fitted.width, fitted.height)
  const dest = artifactPath(source, '.hdr')
  writeBytes(dest, encodeRgbe(image))
  const preview = toneMapPreview(image)
  const blob = await encodeCanvas(imageFromSamples(preview.rgba, preview.width, preview.height), false, 1)
  return {
    dest,
    note: `${image.width}×${image.height}, HDR`,
    previewUrl: URL.createObjectURL(blob),
  }
}

async function decodeHdr(source: string, bytes: Uint8Array): Promise<FloatImage> {
  const url = URL.createObjectURL(new Blob([copyBytes(bytes)]))
  try {
    const loader = source.toLowerCase().endsWith('.exr') ? new EXRLoader() : new HDRLoader()
    loader.setDataType(FloatType)
    const texture = await loader.loadAsync(url)
    return textureToFloat(texture)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function textureToFloat(texture: DataTexture): FloatImage {
  const image = texture.image as { width: number, height: number, data: ArrayLike<number> }
  const rgba = new Float32Array(image.width * image.height * 4)
  const data = image.data
  const channels = data.length / (image.width * image.height)
  for (let index = 0; index < image.width * image.height; index += 1) {
    rgba[index * 4] = Number(data[index * channels] ?? 0)
    rgba[index * 4 + 1] = Number(data[index * channels + 1] ?? 0)
    rgba[index * 4 + 2] = Number(data[index * channels + 2] ?? 0)
    rgba[index * 4 + 3] = channels > 3 ? Number(data[index * channels + 3] ?? 1) : 1
  }
  texture.dispose()
  return { width: image.width, height: image.height, rgba }
}

function encodeCanvas(image: ImageData, lossy: boolean, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('The texture could not be encoded.'))
  context.putImageData(image, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The texture could not be encoded.'))
    }, lossy ? 'image/webp' : 'image/png', lossy ? quality : undefined)
  })
}

function imageFromSamples(data: ArrayLike<number>, width: number, height: number): ImageData {
  const buffer = new ArrayBuffer(width * height * 4)
  const rgba = new Uint8ClampedArray(buffer)
  for (let index = 0; index < rgba.length; index += 1) rgba[index] = data[index] ?? 0
  return new ImageData(rgba, width, height)
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function numberParam(params: Record<string, ImportValue>, name: string): number {
  const value = params[name]
  return typeof value === 'number' ? value : Number(value ?? 0)
}
