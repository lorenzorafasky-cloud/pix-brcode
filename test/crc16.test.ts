import { describe, expect, it } from 'vitest'
import { crc16, crc16Hex } from '../src/index.js'
import { BCB_COMPOSITE_DYNAMIC, BCB_COMPOSITE_RECURRENCE_ONLY, BCB_COMPOSITE_STATIC, BCB_DYNAMIC, BCB_STATIC } from './vectors.js'

describe('crc16 (CRC-16/CCITT-FALSE)', () => {
  it('matches the standard check value', () => {
    expect(crc16('123456789')).toBe(0x29b1)
    expect(crc16Hex('123456789')).toBe('29B1')
  })

  it('returns the initial value for empty input', () => {
    expect(crc16('')).toBe(0xffff)
    expect(crc16(new Uint8Array())).toBe(0xffff)
  })

  it('accepts bytes', () => {
    expect(crc16(Uint8Array.from([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]))).toBe(0x29b1)
  })

  it('pads to four uppercase hex digits', () => {
    // Find any input whose CRC is below 0x1000 to check padding.
    let input = 0
    while (crc16(String(input)) >= 0x1000) input++
    expect(crc16Hex(String(input))).toMatch(/^0[0-9A-F]{3}$/)
  })

  it.each([
    ['static', BCB_STATIC],
    ['dynamic', BCB_DYNAMIC],
    ['composite (recurrence only)', BCB_COMPOSITE_RECURRENCE_ONLY],
    ['composite (static)', BCB_COMPOSITE_STATIC],
    ['composite (dynamic)', BCB_COMPOSITE_DYNAMIC],
  ])('reproduces the CRC of the BCB %s example', (_, code) => {
    expect(crc16Hex(code.slice(0, -4))).toBe(code.slice(-4))
  })

  it('hashes non-ASCII text as UTF-8', () => {
    // 'ç' is C3 A7 in UTF-8.
    expect(crc16('ç')).toBe(crc16(Uint8Array.from([0xc3, 0xa7])))
  })
})
