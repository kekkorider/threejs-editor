import { artifactPath, type ImportValue } from './importSettings'
import { readBytes, writeBytes } from './projectFs'

export interface AudioImportResult {
  dest: string
  note: string
}

const buffers = new Map<string, AudioBuffer>()

function copyAudioBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export function importAudioBuffer(path: string): AudioBuffer | null {
  return buffers.get(path) ?? null
}

export async function importWav(source: string, params: Record<string, ImportValue>): Promise<AudioImportResult> {
  const bytes = readBytes(source)
  if (!bytes) throw new Error('The audio file is not in the project.')
  const detected = wavLoopPoints(bytes)
  const rate = wavSampleRate(bytes) ?? 44100
  const context = new AudioContext({ sampleRate: rate })
  try {
    const decoded = await context.decodeAudioData(copyAudioBytes(bytes))
    let processed = processPcm(decoded, params)
    const mode = params['edit/loop_mode']
    if (mode === 0 && detected) {
      params['edit/loop_begin'] = detected.start
      params['edit/loop_end'] = detected.end
    }
    const eightBit = params['force/8_bit'] === true
    const dest = artifactPath(source, '.wav')
    writeBytes(dest, encodeWav(processed, eightBit))
    buffers.set(source, processed)
    return { dest, note: describeAudio(processed) }
  } finally {
    await context.close()
  }
}

export async function importStream(source: string, params: Record<string, ImportValue>): Promise<AudioImportResult> {
  const bytes = readBytes(source)
  if (!bytes) throw new Error('The audio file is not in the project.')
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(copyAudioBytes(bytes))
    buffers.set(source, decoded)
    return { dest: source, note: describeAudio(decoded, params) }
  } finally {
    await context.close()
  }
}

export function playbackBuffer(source: AudioBuffer, params: Record<string, ImportValue>, context: AudioContext): {
  buffer: AudioBuffer
  loop: boolean
  loopStart: number
  loopEnd: number
} {
  if ('edit/loop_mode' in params) return playbackWav(source, params, context)
  return playbackStream(source, params, context)
}

export function processPcm(source: AudioBuffer, params: Record<string, ImportValue>): AudioBuffer {
  const rate = source.sampleRate
  let channels = copyChannels(source)
  if (params['force/mono'] === true && channels.length > 1) channels = [mixMono(channels)]
  let nextRate = rate
  if (params['force/max_rate'] === true) {
    const limit = numberParam(params, 'force/max_rate_hz') || 44100
    if (rate > limit) {
      channels = channels.map((channel) => resample(channel, rate, limit))
      nextRate = limit
    }
  }
  if (params['edit/normalize'] === true) normalize(channels)
  if (params['edit/trim'] === true) channels = trimSilence(channels)
  if (params['force/8_bit'] === true) quantize8(channels)
  return channelsToBuffer(channels, nextRate)
}

function playbackWav(source: AudioBuffer, params: Record<string, ImportValue>, context: AudioContext): {
  buffer: AudioBuffer
  loop: boolean
  loopStart: number
  loopEnd: number
} {
  const mode = numberParam(params, 'edit/loop_mode')
  if (mode === 0 || mode === 1) return { buffer: source, loop: false, loopStart: 0, loopEnd: source.duration }
  const begin = Math.max(0, Math.min(source.length - 1, numberParam(params, 'edit/loop_begin')))
  const endValue = numberParam(params, 'edit/loop_end')
  const end = endValue < 0 ? source.length : Math.max(begin + 1, Math.min(source.length, endValue))
  if (mode === 4) {
    return { buffer: reverseRegion(source, begin, end, context), loop: true, loopStart: 0, loopEnd: (end - begin) / source.sampleRate }
  }
  if (mode === 3) {
    return { buffer: pingPongRegion(source, begin, end, context), loop: true, loopStart: 0, loopEnd: (end - begin) * 2 / source.sampleRate }
  }
  return {
    buffer: source,
    loop: true,
    loopStart: begin / source.sampleRate,
    loopEnd: end / source.sampleRate,
  }
}

function playbackStream(source: AudioBuffer, params: Record<string, ImportValue>, _context: AudioContext): {
  buffer: AudioBuffer
  loop: boolean
  loopStart: number
  loopEnd: number
} {
  if (params.loop !== true) return { buffer: source, loop: false, loopStart: 0, loopEnd: source.duration }
  const offset = Math.max(0, numberParam(params, 'loop_offset'))
  const bpm = numberParam(params, 'bpm')
  const beats = numberParam(params, 'beat_count')
  const beatEnd = bpm > 0 && beats > 0 ? beats * 60 / bpm : source.duration
  return {
    buffer: source,
    loop: true,
    loopStart: Math.min(offset, source.duration),
    loopEnd: Math.min(source.duration, Math.max(offset, beatEnd)),
  }
}

function wavSampleRate(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (id === 'fmt ' && start + 8 <= bytes.length) return view.getUint32(start + 4, true)
    offset = start + size + (size % 2)
  }
  return null
}

function wavLoopPoints(bytes: Uint8Array): { start: number, end: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (id === 'smpl' && start + 36 <= bytes.length) {
      const loops = view.getUint32(start + 28, true)
      if (loops > 0 && start + 36 + 16 <= bytes.length) {
        return {
          start: view.getUint32(start + 44, true),
          end: view.getUint32(start + 48, true),
        }
      }
      return null
    }
    offset = start + size + (size % 2)
  }
  return null
}

function encodeWav(buffer: AudioBuffer, eightBit: boolean): Uint8Array {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytesPerSample = eightBit ? 1 : 2
  const dataSize = frames * channels * bytesPerSample
  const file = new ArrayBuffer(44 + dataSize)
  const view = new DataView(file)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  const data = new Uint8Array(file)
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0))
      if (eightBit) data[offset++] = Math.round((sample + 1) * 0.5 * 255)
      else {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }
  }
  return new Uint8Array(file)
}

function copyChannels(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = []
  for (let index = 0; index < buffer.numberOfChannels; index += 1) channels.push(buffer.getChannelData(index).slice())
  return channels
}

function mixMono(channels: Float32Array[]): Float32Array {
  const mono = new Float32Array(channels[0]!.length)
  for (let index = 0; index < mono.length; index += 1) {
    let sum = 0
    for (const channel of channels) sum += channel[index] ?? 0
    mono[index] = sum / channels.length
  }
  return mono
}

function resample(channel: Float32Array, fromRate: number, toRate: number): Float32Array {
  const length = Math.max(1, Math.round(channel.length * toRate / fromRate))
  const next = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * fromRate / toRate
    const left = Math.floor(position)
    const right = Math.min(channel.length - 1, left + 1)
    const mix = position - left
    next[index] = (channel[left] ?? 0) * (1 - mix) + (channel[right] ?? 0) * mix
  }
  return next
}

function normalize(channels: Float32Array[]): void {
  let peak = 0
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample))
  }
  if (peak <= 0 || peak >= 0.999) return
  const gain = 1 / peak
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * gain
  }
}

function trimSilence(channels: Float32Array[]): Float32Array[] {
  let peak = 0
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample))
  }
  const limit = (peak || 1) * (10 ** (-50 / 20))
  const length = channels[0]?.length ?? 0
  let start = 0
  let end = length
  while (start < end && !loudAt(channels, start, limit)) start += 1
  while (end > start && !loudAt(channels, end - 1, limit)) end -= 1
  if (start === 0 && end === length) return channels
  const fade = Math.min(500, Math.floor((end - start) / 2))
  return channels.map((channel) => {
    const next = channel.slice(start, end)
    for (let index = 0; index < fade; index += 1) {
      const gain = index / fade
      next[index] = (next[index] ?? 0) * gain
      const tail = next.length - 1 - index
      next[tail] = (next[tail] ?? 0) * gain
    }
    return next
  })
}

function quantize8(channels: Float32Array[]): void {
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index] ?? 0))
      const level = Math.round((sample + 1) * 0.5 * 255)
      channel[index] = level / 255 * 2 - 1
    }
  }
}

function loudAt(channels: Float32Array[], index: number, limit: number): boolean {
  return channels.some((channel) => Math.abs(channel[index] ?? 0) > limit)
}

function channelsToBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const context = new AudioContext()
  const buffer = context.createBuffer(channels.length, channels[0]?.length ?? 1, sampleRate)
  channels.forEach((channel, index) => {
    const copy = new Float32Array(channel.length)
    copy.set(channel)
    buffer.copyToChannel(copy, index)
  })
  void context.close()
  return buffer
}

function reverseRegion(source: AudioBuffer, begin: number, end: number, context: AudioContext): AudioBuffer {
  const length = end - begin
  const buffer = context.createBuffer(source.numberOfChannels, length, source.sampleRate)
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel)
    const output = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) output[index] = input[end - 1 - index] ?? 0
  }
  return buffer
}

function pingPongRegion(source: AudioBuffer, begin: number, end: number, context: AudioContext): AudioBuffer {
  const length = end - begin
  const buffer = context.createBuffer(source.numberOfChannels, length * 2, source.sampleRate)
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel)
    const output = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      output[index] = input[begin + index] ?? 0
      output[length + index] = input[end - 1 - index] ?? 0
    }
  }
  return buffer
}

function describeAudio(buffer: AudioBuffer, params?: Record<string, ImportValue>): string {
  const seconds = (Math.round(buffer.duration * 100) / 100).toFixed(2)
  const layout = buffer.numberOfChannels === 1 ? 'mono' : 'stereo'
  const loop = params?.loop === true ? ', loop' : ''
  return `${seconds} s, ${buffer.sampleRate} Hz, ${layout}${loop}`
}

function numberParam(params: Record<string, ImportValue>, name: string): number {
  const value = params[name]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = ''
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index] ?? 0)
  return text
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
}
