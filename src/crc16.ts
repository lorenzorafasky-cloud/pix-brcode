import { utf8Encode } from './utf8.js'

const POLYNOMIAL = 0x1021
const INITIAL_VALUE = 0xffff

const TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ POLYNOMIAL) & 0xffff : (crc << 1) & 0xffff
    }
    table[i] = crc
  }
  return table
})()

/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection, no final XOR),
 * the checksum required by EMV QRCPS and the Pix BR Code (field 63).
 *
 * Strings are hashed as UTF-8 bytes.
 *
 * @example crc16('123456789') // 0x29B1
 */
export function crc16(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? utf8Encode(input) : input
  let crc = INITIAL_VALUE
  for (const byte of bytes) {
    crc = ((crc << 8) & 0xffff) ^ (TABLE[((crc >> 8) ^ byte) & 0xff] as number)
  }
  return crc
}

/**
 * Same as {@link crc16}, formatted as the 4 uppercase hexadecimal digits used in field 63.
 *
 * @example crc16Hex('123456789') // '29B1'
 */
export function crc16Hex(input: string | Uint8Array): string {
  return crc16(input).toString(16).toUpperCase().padStart(4, '0')
}
