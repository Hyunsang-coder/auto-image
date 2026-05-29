import { deflate } from 'pako'

// App Store Connect rejects screenshots whose PNG encoding carries an alpha
// channel — even when every pixel is fully opaque. Canvas `toBlob('image/png')`
// always emits RGBA (color type 6), so we re-encode the canvas pixels as a
// 24-bit RGB PNG (color type 2) with no alpha channel. Lossless, unlike JPEG.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export function encodeOpaquePng(canvas: HTMLCanvasElement): Blob {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('encodeOpaquePng: no 2d context')
  const rgba = ctx.getImageData(0, 0, width, height).data

  // Filtered scanlines: each row is a 0 (filter: none) byte followed by RGB.
  const raw = new Uint8Array(height * (1 + width * 3))
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0
    let s = y * width * 4
    for (let x = 0; x < width; x++) {
      raw[p++] = rgba[s]
      raw[p++] = rgba[s + 1]
      raw[p++] = rgba[s + 2]
      s += 4
    }
  }

  const ihdr = new Uint8Array(13)
  const idv = new DataView(ihdr.buffer)
  idv.setUint32(0, width)
  idv.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor (RGB, no alpha)
  // bytes 10-12 (compression/filter/interlace) stay 0

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const idat = chunk('IDAT', deflate(raw))
  const png = new Uint8Array(
    sig.length + 25 + idat.length + 12, // 25 = IHDR chunk, 12 = IEND chunk
  )
  let off = 0
  for (const part of [sig, chunk('IHDR', ihdr), idat, chunk('IEND', new Uint8Array(0))]) {
    png.set(part, off)
    off += part.length
  }
  return new Blob([png], { type: 'image/png' })
}
