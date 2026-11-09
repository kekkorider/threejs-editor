/** Pixel operations used when a texture is reimported. */

export interface FloatImage {
  width: number
  height: number
  rgba: Float32Array
}

export function fixAlphaBorder(rgba: Uint8ClampedArray, width: number, height: number): void {
  const source = new Uint8ClampedArray(rgba)
  const maxRadius = 4
  const alphaThreshold = 20
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      if (source[index + 3]! >= alphaThreshold) continue
      let closest = 0x7fffffff
      let red = 0
      let green = 0
      let blue = 0
      const x0 = Math.max(0, x - maxRadius)
      const x1 = Math.min(width - 1, x + maxRadius)
      const y0 = Math.max(0, y - maxRadius)
      const y1 = Math.min(height - 1, y + maxRadius)
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          const dist = (y - yy) * (y - yy) + (x - xx) * (x - xx)
          if (dist >= closest) continue
          const other = (yy * width + xx) * 4
          if (source[other + 3]! < alphaThreshold) continue
          closest = dist
          red = source[other]!
          green = source[other + 1]!
          blue = source[other + 2]!
        }
      }
      if (closest !== 0x7fffffff) {
        rgba[index] = red
        rgba[index + 1] = green
        rgba[index + 2] = blue
      }
    }
  }
}

export function premultiplyAlpha(rgba: Uint8ClampedArray): void {
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3]! / 255
    rgba[index] = Math.round(rgba[index]! * alpha)
    rgba[index + 1] = Math.round(rgba[index + 1]! * alpha)
    rgba[index + 2] = Math.round(rgba[index + 2]! * alpha)
  }
}

export function invertGreen(rgba: Uint8ClampedArray): void {
  for (let index = 1; index < rgba.length; index += 4) rgba[index] = 255 - rgba[index]!
}

export function resizeRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  nextWidth: number,
  nextHeight: number,
): Uint8ClampedArray {
  return resizePlane(source, width, height, nextWidth, nextHeight, 4, 255) as Uint8ClampedArray
}

export function limitSize(width: number, height: number, limit: number): { width: number, height: number } {
  const longest = Math.max(width, height)
  if (limit <= 0 || longest <= limit) return { width, height }
  const scale = limit / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function srgbToLinearImage(image: FloatImage): void {
  const data = image.rgba
  for (let index = 0; index < data.length; index += 4) {
    data[index] = srgbChannel(data[index]!)
    data[index + 1] = srgbChannel(data[index + 1]!)
    data[index + 2] = srgbChannel(data[index + 2]!)
  }
}

/** Filament clamp used by Godot's HDR Clamp Exposure import option. */
export function clampHdrExposure(image: FloatImage): void {
  const linear = 4096
  const compressed = 16384
  const data = image.rgba
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]!
    const green = data[index + 1]!
    const blue = data[index + 2]!
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    if (luma <= linear) continue
    const factor = ((linear * linear - compressed * luma) / (2 * linear - compressed - luma)) / luma
    data[index] = red * factor
    data[index + 1] = green * factor
    data[index + 2] = blue * factor
  }
}

export function resizeFloat(image: FloatImage, nextWidth: number, nextHeight: number): FloatImage {
  return {
    width: nextWidth,
    height: nextHeight,
    rgba: resizePlane(image.rgba, image.width, image.height, nextWidth, nextHeight, 4, 0) as Float32Array,
  }
}

export function floatToRgbe(red: number, green: number, blue: number): [number, number, number, number] {
  const max = Math.max(red, green, blue)
  if (!(max > 1e-32)) return [0, 0, 0, 0]
  const exponent = Math.ceil(Math.log2(max)) + 128
  const scale = (2 ** (exponent - 128)) / 255
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value / scale)))
  return [byte(red), byte(green), byte(blue), Math.max(0, Math.min(255, exponent))]
}

export function encodeRgbe(image: FloatImage): Uint8Array {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n-Y ${image.height} +X ${image.width}\n`
  const pixels = new Uint8Array(image.width * image.height * 4)
  for (let index = 0; index < image.width * image.height; index += 1) {
    const [red, green, blue, exponent] = floatToRgbe(
      image.rgba[index * 4]!,
      image.rgba[index * 4 + 1]!,
      image.rgba[index * 4 + 2]!,
    )
    pixels[index * 4] = red
    pixels[index * 4 + 1] = green
    pixels[index * 4 + 2] = blue
    pixels[index * 4 + 3] = exponent
  }
  const body = image.width >= 8 && image.width <= 0x7fff ? encodeRgbeRle(pixels, image.width, image.height) : pixels
  const head = new TextEncoder().encode(header)
  const file = new Uint8Array(head.length + body.length)
  file.set(head, 0)
  file.set(body, head.length)
  return file
}

export function toneMapPreview(image: FloatImage): { rgba: Uint8ClampedArray, width: number, height: number } {
  const rgba = new Uint8ClampedArray(image.width * image.height * 4)
  for (let index = 0; index < image.width * image.height; index += 1) {
    rgba[index * 4] = displayChannel(image.rgba[index * 4]!)
    rgba[index * 4 + 1] = displayChannel(image.rgba[index * 4 + 1]!)
    rgba[index * 4 + 2] = displayChannel(image.rgba[index * 4 + 2]!)
    rgba[index * 4 + 3] = 255
  }
  return { rgba, width: image.width, height: image.height }
}

function displayChannel(value: number): number {
  const mapped = value / (1 + Math.max(0, value))
  return Math.max(0, Math.min(255, Math.round((mapped ** (1 / 2.2)) * 255)))
}

function srgbChannel(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return value
  if (value <= 0.04045) return value / 12.92
  return ((value + 0.055) / 1.055) ** 2.4
}

function resizePlane(
  source: ArrayLike<number>,
  width: number,
  height: number,
  nextWidth: number,
  nextHeight: number,
  stride: number,
  clampMax: number,
): Uint8ClampedArray | Float32Array {
  const horizontal = clampMax > 0 ? new Float32Array(nextWidth * height * stride) : new Float32Array(nextWidth * height * stride)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      const srcX = (x + 0.5) * width / nextWidth - 0.5
      const x0 = Math.floor(srcX)
      for (let channel = 0; channel < stride; channel += 1) {
        let sum = 0
        let weight = 0
        for (let tap = -1; tap <= 2; tap += 1) {
          const sample = clampIndex(x0 + tap, width)
          const w = cubicWeight(srcX - (x0 + tap))
          sum += source[(y * width + sample) * stride + channel]! * w
          weight += w
        }
        horizontal[(y * nextWidth + x) * stride + channel] = weight === 0 ? 0 : sum / weight
      }
    }
  }
  const output = clampMax > 0 ? new Uint8ClampedArray(nextWidth * nextHeight * stride) : new Float32Array(nextWidth * nextHeight * stride)
  for (let y = 0; y < nextHeight; y += 1) {
    const srcY = (y + 0.5) * height / nextHeight - 0.5
    const y0 = Math.floor(srcY)
    for (let x = 0; x < nextWidth; x += 1) {
      for (let channel = 0; channel < stride; channel += 1) {
        let sum = 0
        let weight = 0
        for (let tap = -1; tap <= 2; tap += 1) {
          const sample = clampIndex(y0 + tap, height)
          const w = cubicWeight(srcY - (y0 + tap))
          sum += horizontal[(sample * nextWidth + x) * stride + channel]! * w
          weight += w
        }
        const value = weight === 0 ? 0 : sum / weight
        output[(y * nextWidth + x) * stride + channel] = clampMax > 0
          ? Math.max(0, Math.min(clampMax, Math.round(value)))
          : value
      }
    }
  }
  return output
}

function cubicWeight(distance: number): number {
  const x = Math.abs(distance)
  if (x <= 1) return 1.5 * x * x * x - 2.5 * x * x + 1
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2
  return 0
}

function clampIndex(index: number, size: number): number {
  if (index < 0) return 0
  if (index >= size) return size - 1
  return index
}

function encodeRgbeRle(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const chunks: number[] = []
  for (let y = 0; y < height; y += 1) {
    chunks.push(2, 2, (width >> 8) & 0xff, width & 0xff)
    for (let channel = 0; channel < 4; channel += 1) {
      const row: number[] = []
      for (let x = 0; x < width; x += 1) row.push(pixels[(y * width + x) * 4 + channel]!)
      chunks.push(...encodeChannel(row))
    }
  }
  return Uint8Array.from(chunks)
}

function encodeChannel(values: number[]): number[] {
  const out: number[] = []
  let index = 0
  while (index < values.length) {
    let run = 1
    while (run < 127 && index + run < values.length && values[index] === values[index + run]) run += 1
    if (run >= 3) {
      out.push(128 + run, values[index]!)
      index += run
      continue
    }
    const start = index
    index += 1
    while (index < values.length && index - start < 128) {
      let peek = 1
      while (peek < 127 && index + peek < values.length && values[index] === values[index + peek]) peek += 1
      if (peek >= 3) break
      index += 1
    }
    const count = index - start
    out.push(count)
    for (let cursor = 0; cursor < count; cursor += 1) out.push(values[start + cursor]!)
  }
  return out
}
