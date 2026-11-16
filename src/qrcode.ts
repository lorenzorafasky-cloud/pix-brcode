/**
 * Minimal QR Code encoder (ISO/IEC 18004), byte mode only, written for BR Code payloads.
 * No dependencies; works in Node.js, browsers, Deno, Bun and edge runtimes.
 */
import { PixError } from './errors.js'
import { utf8Encode } from './utf8.js'

/** QR error correction level: recovers roughly 7% (L), 15% (M), 25% (Q) or 30% (H) of damage. */
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export interface QRCodeOptions {
  /** Defaults to `'M'`. */
  errorCorrectionLevel?: ErrorCorrectionLevel
  /** Smallest version (1-40) to use. Defaults to 1. */
  minVersion?: number
  /** Largest version (1-40) to use. Defaults to 40. */
  maxVersion?: number
  /** Force a mask pattern (0-7). By default the one with the lowest penalty score is chosen. */
  mask?: number
}

/** An encoded QR code. `modules[y][x]` is `true` for dark modules. */
export interface QRCode {
  version: number
  /** Width and height in modules (`version * 4 + 17`), without quiet zone. */
  size: number
  errorCorrectionLevel: ErrorCorrectionLevel
  mask: number
  modules: boolean[][]
}

export interface QRCodeSVGOptions extends QRCodeOptions {
  /** Quiet zone around the symbol, in modules. Defaults to 4 (the minimum required by the standard). */
  margin?: number
  /** Width and height attributes of the `<svg>` element (e.g. `256` or `'100%'`). Omitted by default. */
  width?: number | string
  /** Color of dark modules. Defaults to `'#000000'`. */
  darkColor?: string
  /** Background color, or `'transparent'`. Defaults to `'#ffffff'`. */
  lightColor?: string
}

const ECL_ORDINAL: Record<ErrorCorrectionLevel, number> = { L: 0, M: 1, Q: 2, H: 3 }
const ECL_FORMAT_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

// Error correction codewords per block, indexed by [level][version]. Index 0 is unused.
// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]

// Number of error correction blocks, indexed by [level][version]. Index 0 is unused.
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

// ---------------------------------------------------------------------------------------------
// Reed-Solomon over GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
// ---------------------------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255] as number
}

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[(GF_LOG[a] as number) + (GF_LOG[b] as number)] as number
}

const generatorCache = new Map<number, Uint8Array>()

/** Monic generator polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), highest coefficient first. */
function rsGenerator(degree: number): Uint8Array {
  const cached = generatorCache.get(degree)
  if (cached) return cached
  let poly = Uint8Array.of(1)
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] as number) ^ (poly[j] as number)
      next[j + 1] = (next[j + 1] as number) ^ gfMultiply(poly[j] as number, GF_EXP[i] as number)
    }
    poly = next
  }
  generatorCache.set(degree, poly)
  return poly
}

function rsRemainder(data: Uint8Array, generator: Uint8Array): Uint8Array {
  const degree = generator.length - 1
  const work = new Uint8Array(data.length + degree)
  work.set(data)
  for (let i = 0; i < data.length; i++) {
    const coefficient = work[i] as number
    if (coefficient === 0) continue
    for (let j = 1; j < generator.length; j++) {
      work[i + j] = (work[i + j] as number) ^ gfMultiply(generator[j] as number, coefficient)
    }
  }
  return work.slice(data.length)
}

// ---------------------------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------------------------

/** Modules available for data and error correction (everything but function patterns). */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2
    result -= (25 * alignments - 10) * alignments - 55
    if (version >= 7) result -= 36
  }
  return result
}

function dataCodewordCount(version: number, level: ErrorCorrectionLevel): number {
  const ecl = ECL_ORDINAL[level]
  return (
    Math.floor(rawDataModules(version) / 8) -
    (ECC_CODEWORDS_PER_BLOCK[ecl]?.[version] as number) *
      (NUM_ERROR_CORRECTION_BLOCKS[ecl]?.[version] as number)
  )
}

function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return []
  const size = version * 4 + 17
  const count = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const positions = [6]
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos)
  return positions
}

// ---------------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------------

function pushBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
}

function checkVersion(value: unknown, option: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 40) {
    throw new PixError('INVALID_OPTION', `Option "${option}" must be an integer from 1 to 40.`, option)
  }
  return value
}

/**
 * Encodes text (as UTF-8, byte mode) into a QR code matrix.
 *
 * @throws {PixError} `DATA_TOO_LONG` when the text does not fit; `INVALID_OPTION` for bad options.
 */
export function encodeQRCode(text: string, options: QRCodeOptions = {}): QRCode {
  if (typeof text !== 'string') {
    throw new PixError('INVALID_OPTION', 'The QR code content must be a string.')
  }
  const level = options.errorCorrectionLevel ?? 'M'
  if (!(level in ECL_ORDINAL)) {
    throw new PixError(
      'INVALID_OPTION',
      'Option "errorCorrectionLevel" must be "L", "M", "Q" or "H".',
      'errorCorrectionLevel',
    )
  }
  const minVersion = checkVersion(options.minVersion ?? 1, 'minVersion')
  const maxVersion = checkVersion(options.maxVersion ?? 40, 'maxVersion')
  if (minVersion > maxVersion) {
    throw new PixError('INVALID_OPTION', '"minVersion" cannot be greater than "maxVersion".', 'minVersion')
  }
  if (
    options.mask !== undefined &&
    (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 7)
  ) {
    throw new PixError('INVALID_OPTION', 'Option "mask" must be an integer from 0 to 7.', 'mask')
  }

  const data = utf8Encode(text)
  let version = minVersion
  for (;;) {
    const countBits = version <= 9 ? 8 : 16
    if (4 + countBits + data.length * 8 <= dataCodewordCount(version, level) * 8) break
    if (version >= maxVersion) {
      throw new PixError(
        'DATA_TOO_LONG',
        `${data.length} bytes do not fit in a QR code up to version ${maxVersion} with error correction ${level}.`,
      )
    }
    version++
  }

  const capacityBits = dataCodewordCount(version, level) * 8
  const bits: number[] = []
  pushBits(bits, 0b0100, 4) // byte mode
  pushBits(bits, data.length, version <= 9 ? 8 : 16)
  for (const byte of data) pushBits(bits, byte, 8)
  pushBits(bits, 0, Math.min(4, capacityBits - bits.length)) // terminator
  pushBits(bits, 0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) pushBits(bits, pad, 8)

  const dataCodewords = new Uint8Array(capacityBits / 8)
  bits.forEach((bit, i) => {
    dataCodewords[i >>> 3] = (dataCodewords[i >>> 3] as number) | (bit << (7 - (i & 7)))
  })

  const codewords = addErrorCorrection(dataCodewords, version, level)
  return buildSymbol(codewords, version, level, options.mask)
}

function addErrorCorrection(data: Uint8Array, version: number, level: ErrorCorrectionLevel): Uint8Array {
  const ecl = ECL_ORDINAL[level]
  const blockCount = NUM_ERROR_CORRECTION_BLOCKS[ecl]?.[version] as number
  const eccLength = ECC_CODEWORDS_PER_BLOCK[ecl]?.[version] as number
  const totalCodewords = Math.floor(rawDataModules(version) / 8)
  const shortBlockCount = blockCount - (totalCodewords % blockCount)
  const shortBlockLength = Math.floor(totalCodewords / blockCount)
  const generator = rsGenerator(eccLength)

  const blocks: Array<{ data: Uint8Array; ecc: Uint8Array }> = []
  let offset = 0
  for (let b = 0; b < blockCount; b++) {
    const length = shortBlockLength - eccLength + (b < shortBlockCount ? 0 : 1)
    const block = data.subarray(offset, offset + length)
    offset += length
    blocks.push({ data: block, ecc: rsRemainder(block, generator) })
  }

  const result = new Uint8Array(totalCodewords)
  let k = 0
  for (let i = 0; i <= shortBlockLength - eccLength; i++) {
    for (const block of blocks) if (i < block.data.length) result[k++] = block.data[i] as number
  }
  for (let i = 0; i < eccLength; i++) {
    for (const block of blocks) result[k++] = block.ecc[i] as number
  }
  return result
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

function buildSymbol(
  codewords: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
  fixedMask: number | undefined,
): QRCode {
  const size = version * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean): void => {
    ;(modules[y] as boolean[])[x] = dark
    ;(reserved[y] as boolean[])[x] = true
  }

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  // Finder patterns with their separators.
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, distance !== 2 && distance !== 4)
      }
    }
  }

  // Alignment patterns (skipping the three that would overlap finder patterns).
  const positions = alignmentPatternPositions(version)
  const last = positions.length - 1
  positions.forEach((cy, i) => {
    positions.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    })
  })

  const drawFormat = (mask: number): void => {
    const data = (ECL_FORMAT_BITS[level] << 3) | mask
    let remainder = data
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = ((data << 10) | remainder) ^ 0x5412
    const bit = (i: number): boolean => ((bits >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true) // dark module
  }
  drawFormat(0) // reserve the area; redrawn after the mask is chosen

  if (version >= 7) {
    let remainder = version
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = (version << 12) | remainder
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, dark)
      set(b, a, dark)
    }
  }

  // Data, in two-module-wide columns zig-zagging from the bottom-right corner.
  let bitIndex = 0
  const totalBits = codewords.length * 8
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // skip the vertical timing pattern
    const upward = ((right + 1) & 2) === 0
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step
      for (let j = 0; j < 2; j++) {
        const x = right - j
        if ((reserved[y] as boolean[])[x] || bitIndex >= totalBits) continue
        const byte = codewords[bitIndex >>> 3] as number
        ;(modules[y] as boolean[])[x] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1
        bitIndex++
      }
    }
  }

  const applyMask = (mask: number): void => {
    for (let y = 0; y < size; y++) {
      const row = modules[y] as boolean[]
      const fixed = reserved[y] as boolean[]
      for (let x = 0; x < size; x++) {
        if (!fixed[x] && maskApplies(mask, x, y)) row[x] = !row[x]
      }
    }
  }

  let mask = fixedMask
  if (mask === undefined) {
    let bestScore = Infinity
    for (let candidate = 0; candidate < 8; candidate++) {
      applyMask(candidate)
      drawFormat(candidate)
      const score = penaltyScore(modules)
      if (score < bestScore) {
        bestScore = score
        mask = candidate
      }
      applyMask(candidate) // XOR again to undo
    }
  }
  const chosen = mask as number
  applyMask(chosen)
  drawFormat(chosen)

  return { version, size, errorCorrectionLevel: level, mask: chosen, modules }
}

function linePenalty(line: readonly boolean[]): number {
  let score = 0
  // Rule 1: runs of five or more modules of the same color.
  let runLength = 1
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      runLength++
    } else {
      if (runLength >= 5) score += 3 + (runLength - 5)
      runLength = 1
    }
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns next to four light modules (outside counts as light).
  const lightAt = (i: number): boolean => i < 0 || i >= line.length || !line[i]
  for (let i = 0; i + 7 <= line.length; i++) {
    if (
      line[i] &&
      !line[i + 1] &&
      line[i + 2] &&
      line[i + 3] &&
      line[i + 4] &&
      !line[i + 5] &&
      line[i + 6]
    ) {
      const before = lightAt(i - 1) && lightAt(i - 2) && lightAt(i - 3) && lightAt(i - 4)
      const after = lightAt(i + 7) && lightAt(i + 8) && lightAt(i + 9) && lightAt(i + 10)
      if (before || after) score += 40
    }
  }
  return score
}

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length
  let score = 0
  let dark = 0
  for (let y = 0; y < size; y++) {
    const row = modules[y] as boolean[]
    score += linePenalty(row)
    score += linePenalty(modules.map((r) => r[y] as boolean))
    for (let x = 0; x < size; x++) {
      if (row[x]) dark++
      // Rule 2: 2x2 blocks of the same color.
      if (x < size - 1 && y < size - 1) {
        const next = modules[y + 1] as boolean[]
        const c = row[x]
        if (c === row[x + 1] && c === next[x] && c === next[x + 1]) score += 3
      }
    }
  }
  // Rule 4: deviation of the dark module proportion from 50%, in 5% steps.
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  score += Math.max(0, k) * 10
  return score
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Renders an encoded QR code as an SVG string. */
export function renderSVG(qr: QRCode, options: QRCodeSVGOptions = {}): string {
  const margin = options.margin ?? 4
  if (!Number.isInteger(margin) || margin < 0) {
    throw new PixError('INVALID_OPTION', 'Option "margin" must be a non-negative integer.', 'margin')
  }
  const dimension = qr.size + margin * 2
  let path = ''
  qr.modules.forEach((row, y) => {
    let x = 0
    while (x < qr.size) {
      if (!row[x]) {
        x++
        continue
      }
      const start = x
      while (x < qr.size && row[x]) x++
      path += `M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`
    }
  })
  const dark = escapeAttribute(options.darkColor ?? '#000000')
  const light = options.lightColor ?? '#ffffff'
  const sizeAttributes =
    options.width === undefined
      ? ''
      : ` width="${escapeAttribute(String(options.width))}" height="${escapeAttribute(String(options.width))}"`
  const background =
    light === 'transparent'
      ? ''
      : `<rect width="${dimension}" height="${dimension}" fill="${escapeAttribute(light)}"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}"${sizeAttributes} shape-rendering="crispEdges">` +
    `${background}<path d="${path}" fill="${dark}"/></svg>`
  )
}

/**
 * Encodes text into a QR code and renders it as an SVG string.
 *
 * @example
 * const svg = toQRCodeSVG(createStaticPix({ ... }), { width: 256 })
 */
export function toQRCodeSVG(text: string, options: QRCodeSVGOptions = {}): string {
  return renderSVG(encodeQRCode(text, options), options)
}

/**
 * Same as {@link toQRCodeSVG}, as a `data:image/svg+xml` URL ready for `<img src>`.
 */
export function toQRCodeDataURL(text: string, options: QRCodeSVGOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toQRCodeSVG(text, options))}`
}

/**
 * Renders an encoded QR code with Unicode half-block characters (two module rows per line)
 * for printing in a terminal. Light modules are drawn with block characters, so the output is
 * meant for terminals with a dark background.
 */
export function renderText(qr: QRCode, options: { margin?: number } = {}): string {
  const margin = options.margin ?? 2
  const size = qr.size + margin * 2
  const isDark = (x: number, y: number): boolean => {
    const mx = x - margin
    const my = y - margin
    if (mx < 0 || my < 0 || mx >= qr.size || my >= qr.size) return false
    return (qr.modules[my] as boolean[])[mx] as boolean
  }
  const lines: string[] = []
  for (let y = 0; y < size; y += 2) {
    let line = ''
    for (let x = 0; x < size; x++) {
      const top = !isDark(x, y)
      const bottom = y + 1 < size ? !isDark(x, y + 1) : false
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    lines.push(line)
  }
  return lines.join('\n')
}
