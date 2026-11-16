import { describe, expect, it } from 'vitest'
import { decodeFields, encodeField, encodeFields, PixError } from '../src/index.js'
import { BCB_STATIC } from './vectors.js'

describe('encodeField', () => {
  it('writes ID, two-digit length and value', () => {
    expect(encodeField('59', 'Fulano de Tal')).toBe('5913Fulano de Tal')
    expect(encodeField('00', '01')).toBe('000201')
  })

  it('rejects empty values, values over 99 characters and bad IDs', () => {
    expect(() => encodeField('59', '')).toThrow(PixError)
    expect(() => encodeField('59', 'x'.repeat(100))).toThrow(/maximum is 99/)
    expect(() => encodeField('5', 'x')).toThrow(/two digits/)
  })

  it('counts characters, not bytes', () => {
    expect(encodeField('59', 'São')).toBe('5903São')
  })
})

describe('encodeFields', () => {
  it('skips undefined values', () => {
    expect(encodeFields([['00', '01'], ['01', undefined], ['58', 'BR']])).toBe('0002015802BR')
  })
})

describe('decodeFields', () => {
  it('decodes the BCB static example, including templates', () => {
    const fields = decodeFields(BCB_STATIC)
    expect(fields.map((f) => f.id)).toEqual(['00', '26', '52', '53', '58', '59', '60', '62', '63'])
    expect(fields[1]?.children).toEqual([
      { id: '00', value: 'br.gov.bcb.pix' },
      { id: '01', value: '123e4567-e12b-12d1-a456-426655440000' },
    ])
    expect(fields[7]?.children).toEqual([{ id: '05', value: '***' }])
    expect(fields[8]).toEqual({ id: '63', value: '1D3D' })
  })

  it('does not decode primitive fields as templates', () => {
    const fields = decodeFields('5913Fulano de Tal')
    expect(fields[0]?.children).toBeUndefined()
  })

  it('keeps templates whose content is not TLV as plain values', () => {
    const fields = decodeFields('2603abc')
    expect(fields[0]).toEqual({ id: '26', value: 'abc' })
  })

  it.each([
    ['truncated header', '000'],
    ['non-numeric length', '00AB01'],
    ['length beyond the end', '000501'],
    ['zero length', '0000'],
  ])('rejects %s', (_, input) => {
    expect(() => decodeFields(input)).toThrow(expect.objectContaining({ code: 'INVALID_FORMAT' }))
  })
})
