import { describe, expect, it } from 'vitest'
import { inflate } from 'pako'
import { encodeOpaquePng } from './encodePng'

// Minimal canvas stub: encodeOpaquePng only needs width/height and a 2d
// context exposing getImageData over fixed RGBA pixels.
function fakeCanvas(width: number, height: number, rgba: number[]): HTMLCanvasElement {
  const data = new Uint8ClampedArray(rgba)
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data, width, height }) }),
  } as unknown as HTMLCanvasElement
}

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('encodeOpaquePng', () => {
  it('emits a color-type-2 (RGB, no alpha) PNG with valid header', async () => {
    // 2×1 image: red then green, both with a non-opaque alpha that must be dropped.
    const png = await bytes(
      encodeOpaquePng(fakeCanvas(2, 1, [255, 0, 0, 128, 0, 255, 0, 64])),
    )

    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    // IHDR data begins at byte 16: width(4), height(4), depth(1), colorType(1)
    const dv = new DataView(png.buffer)
    expect(dv.getUint32(16)).toBe(2) // width
    expect(dv.getUint32(20)).toBe(1) // height
    expect(png[24]).toBe(8) // bit depth
    expect(png[25]).toBe(2) // color type: truecolor, NO alpha channel
  })

  it('round-trips RGB pixels (alpha stripped) through the IDAT stream', async () => {
    const png = await bytes(
      encodeOpaquePng(fakeCanvas(2, 1, [10, 20, 30, 0, 40, 50, 60, 255])),
    )

    // Locate the IDAT chunk and inflate it back to filtered scanlines.
    const idat = findChunk(png, 'IDAT')
    const raw = inflate(idat)
    // One scanline: filter byte (0) + 2 px × 3 bytes RGB. Alpha is gone.
    expect(Array.from(raw)).toEqual([0, 10, 20, 30, 40, 50, 60])
  })
})

function findChunk(png: Uint8Array, type: string): Uint8Array {
  const dv = new DataView(png.buffer)
  let off = 8
  while (off < png.length) {
    const len = dv.getUint32(off)
    const t = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7])
    if (t === type) return png.subarray(off + 8, off + 8 + len)
    off += 12 + len
  }
  throw new Error(`chunk ${type} not found`)
}
