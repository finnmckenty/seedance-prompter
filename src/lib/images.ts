import type { ImageMediaType } from './types'

/** Longest edge the API handles without downscaling (and the token sweet spot). */
const MAX_EDGE = 1568
const MAX_BYTES = 3_500_000

export interface EncodedImage {
  data: string
  mediaType: ImageMediaType
  width: number
  height: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

function fit(w: number, h: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return [Math.round(w * scale), Math.round(h * scale)]
}

function canvasToBase64(canvas: HTMLCanvasElement, preferPng: boolean): { data: string; mediaType: ImageMediaType } {
  if (preferPng) {
    const png = canvas.toDataURL('image/png')
    if (png.length * 0.75 <= MAX_BYTES) return { data: png.split(',')[1], mediaType: 'image/png' }
  }
  let q = 0.9
  let jpeg = canvas.toDataURL('image/jpeg', q)
  while (jpeg.length * 0.75 > MAX_BYTES && q > 0.5) {
    q -= 0.1
    jpeg = canvas.toDataURL('image/jpeg', q)
  }
  return { data: jpeg.split(',')[1], mediaType: 'image/jpeg' }
}

/** Decode, downscale to MAX_EDGE, and base64-encode an image file or blob. */
export async function encodeImageFile(file: Blob): Promise<EncodedImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const [w, h] = fit(img.naturalWidth, img.naturalHeight, MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const { data, mediaType } = canvasToBase64(canvas, file.type === 'image/png')
    return { data, mediaType, width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface ContactSheet extends EncodedImage {
  durationSec: number
}

/** Sample 4 frames across a video into one labeled 2x2 contact sheet. */
export async function makeContactSheet(file: Blob): Promise<ContactSheet> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not decode video'))
    })
    const duration = video.duration
    const fractions = [0.04, 0.36, 0.68, 0.98]
    const [cw, ch] = fit(video.videoWidth, video.videoHeight, MAX_EDGE / 2)
    const pad = 6
    const labelH = 22
    const canvas = document.createElement('canvas')
    canvas.width = cw * 2 + pad * 3
    canvas.height = (ch + labelH) * 2 + pad * 3
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < fractions.length; i++) {
      const t = Math.max(0, Math.min(duration - 0.05, duration * fractions[i]))
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve()
        video.onerror = () => reject(new Error('Seek failed'))
        video.currentTime = t
      })
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = pad + col * (cw + pad)
      const y = pad + row * (ch + labelH + pad)
      ctx.drawImage(video, x, y, cw, ch)
      ctx.fillStyle = '#eee'
      ctx.font = 'bold 14px system-ui, sans-serif'
      ctx.fillText(`Frame ${i + 1} · ${t.toFixed(1)}s / ${duration.toFixed(1)}s`, x, y + ch + 16)
    }
    const { data, mediaType } = canvasToBase64(canvas, false)
    return { data, mediaType, width: canvas.width, height: canvas.height, durationSec: duration }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

export async function audioDuration(file: Blob): Promise<number | undefined> {
  const url = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  try {
    return await new Promise<number | undefined>((resolve) => {
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : undefined)
      audio.onerror = () => resolve(undefined)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function dataUrl(data: string, mediaType: string): string {
  return `data:${mediaType};base64,${data}`
}

/** Pull image blobs out of a paste or drop event. */
export function imageFilesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f && f.type.startsWith('image/')) out.push(f)
    }
  }
  if (out.length === 0) {
    for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) out.push(f)
  }
  return out
}
