import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import {
  encodeQRCode,
  renderSVG,
  renderText,
  toQRCodeDataURL,
  toQRCodeSVG,
  type ErrorCorrectionLevel,
  type QRCode,
} from '../src/index.js'
import { BCB_COMPOSITE_DYNAMIC, BCB_DYNAMIC, BCB_STATIC } from './vectors.js'

// jsqr is a CommonJS module; depending on the interop its default export is the function itself.
type JsQR = typeof jsQRModule.default
const jsQR = ((jsQRModule as unknown as { default?: JsQR }).default ??
  (jsQRModule as unknown as JsQR)) as JsQR

/** Rasterizes a QR code and decodes it with jsQR, an independent decoder. */
function decode(qr: QRCode, scale = 3, margin = 4): string | undefined {
  const dimension = (qr.size + margin * 2) * scale
  const pixels = new Uint8ClampedArray(dimension * dimension * 4).fill(255)
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y]?.[x]) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = (((y + margin) * scale + dy) * dimension + (x + margin) * scale + dx) * 4
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0
        }
      }
    }
  }
  return jsQR(pixels, dimension, dimension, { inversionAttempts: 'dontInvert' })?.data
}

const LEVELS: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H']

describe('encodeQRCode', () => {
  it.each([
    ['static', BCB_STATIC],
    ['dynamic', BCB_DYNAMIC],
    ['composite', BCB_COMPOSITE_DYNAMIC],
  ])('encodes the BCB %s example so that an independent decoder reads it back', (_, code) => {
    for (const errorCorrectionLevel of LEVELS) {
      expect(decode(encodeQRCode(code, { errorCorrectionLevel }))).toBe(code)
    }
  })

  it('picks the smallest version that fits', () => {
    // 137 bytes need version 8 at level M (152 bytes); version 7 holds 122.
    const qr = encodeQRCode(BCB_STATIC)
    expect(BCB_STATIC).toHaveLength(137)
    expect(qr).toMatchObject({ version: 8, size: 49, errorCorrectionLevel: 'M' })
    expect(encodeQRCode('a'.repeat(122)).version).toBe(7)
    expect(encodeQRCode('a'.repeat(123)).version).toBe(8)
  })

  it('round-trips payloads across versions 1 to 40', () => {
    // Byte capacities at level L for a sample of versions (ISO/IEC 18004 table 7).
    const capacities: Array<[number, number]> = [
      [1, 17],
      [2, 32],
      [5, 106],
      [9, 230],
      [10, 271],
      [14, 458],
      [20, 858],
      [27, 1465],
      [33, 2068],
      [40, 2953],
    ]
    for (const [version, capacity] of capacities) {
      const text = Array.from({ length: capacity }, (_, i) => String.fromCharCode(33 + (i % 90))).join('')
      const qr = encodeQRCode(text, { errorCorrectionLevel: 'L' })
      expect(qr.version).toBe(version)
      expect(decode(qr, 2)).toBe(text)
      if (version < 40) {
        expect(encodeQRCode(text + 'x', { errorCorrectionLevel: 'L' }).version).toBe(version + 1)
      }
    }
  })

  it('decodes with every mask pattern', () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeQRCode(BCB_STATIC, { mask })
      expect(qr.mask).toBe(mask)
      expect(decode(qr)).toBe(BCB_STATIC)
    }
  })

  it('encodes UTF-8 text', () => {
    expect(decode(encodeQRCode('Olá, São Paulo! ☕'))).toBe('Olá, São Paulo! ☕')
  })

  it('respects minVersion and maxVersion', () => {
    expect(encodeQRCode('abc', { minVersion: 10 }).version).toBe(10)
    expect(() => encodeQRCode(BCB_STATIC, { maxVersion: 5 })).toThrow(
      expect.objectContaining({ code: 'DATA_TOO_LONG' }),
    )
    expect(() => encodeQRCode('x'.repeat(2954), { errorCorrectionLevel: 'L' })).toThrow(
      expect.objectContaining({ code: 'DATA_TOO_LONG' }),
    )
  })

  it('validates options', () => {
    expect(() => encodeQRCode('a', { errorCorrectionLevel: 'X' as never })).toThrow(/errorCorrectionLevel/)
    expect(() => encodeQRCode('a', { minVersion: 0 })).toThrow(/minVersion/)
    expect(() => encodeQRCode('a', { minVersion: 5, maxVersion: 4 })).toThrow(/greater/)
    expect(() => encodeQRCode('a', { mask: 8 })).toThrow(/mask/)
    expect(() => encodeQRCode(1 as never)).toThrow(/string/)
  })
})

describe('rendering', () => {
  it('renders an SVG with quiet zone and colors', () => {
    const svg = toQRCodeSVG(BCB_STATIC, { width: 256, darkColor: '#123456' })
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 57 57" width="256" height="256"/)
    expect(svg).toContain('fill="#123456"')
    expect(svg).toContain('<rect width="57" height="57" fill="#ffffff"/>')
    expect(toQRCodeSVG(BCB_STATIC, { lightColor: 'transparent', margin: 0 })).not.toContain('<rect')
  })

  it('draws every dark module and nothing else', () => {
    const qr = encodeQRCode(BCB_DYNAMIC)
    const svg = renderSVG(qr, { margin: 0 })
    const grid = qr.modules.map((row) => row.map(() => false))
    const path = /d="([^"]*)"/.exec(svg)?.[1] ?? ''
    for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(w); i++) (grid[Number(y)] as boolean[])[Number(x) + i] = true
    }
    expect(grid).toEqual(qr.modules)
  })

  it('escapes attribute values', () => {
    expect(toQRCodeSVG('a', { darkColor: '"><script>' })).not.toContain('<script>')
  })

  it('builds a data URL', () => {
    const url = toQRCodeDataURL(BCB_STATIC)
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1] as string)).toBe(toQRCodeSVG(BCB_STATIC))
  })

  it('renders text for terminals', () => {
    const qr = encodeQRCode(BCB_STATIC)
    const lines = renderText(qr).split('\n')
    expect(lines).toHaveLength(Math.ceil((qr.size + 4) / 2))
    expect(lines.every((line) => [...line].length === qr.size + 4)).toBe(true)
  })

  it('rejects an invalid margin', () => {
    expect(() => toQRCodeSVG('a', { margin: -1 })).toThrow(/margin/)
  })
})
