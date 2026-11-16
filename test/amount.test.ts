import { describe, expect, it } from 'vitest'
import { formatAmount, formatCents, MAX_AMOUNT_IN_CENTS, sanitizeText, toCents } from '../src/index.js'

describe('toCents / formatAmount', () => {
  it.each([
    [10, '10.00'],
    [10.5, '10.50'],
    [0.01, '0.01'],
    [100.5, '100.50'],
    [0.1 + 0.2, '0.30'],
    [1234.56, '1234.56'],
    [9999999999.99, '9999999999.99'],
    ['10', '10.00'],
    ['10.5', '10.50'],
    ['10,50', '10.50'],
    [' 1234.56 ', '1234.56'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatAmount(input)).toBe(expected)
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['fraction of a cent', 1.005],
    ['three decimals', '1.005'],
    ['thousands separator', '1.234,56'],
    ['zero string', '0.00'],
    ['text', 'ten'],
    ['too large', 10_000_000_000],
  ])('rejects %s', (_, input) => {
    expect(() => formatAmount(input)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }))
  })

  it('converts to cents', () => {
    expect(toCents('19,90')).toBe(1990)
    expect(toCents(19.9)).toBe(1990)
  })
})

describe('formatCents', () => {
  it('formats integers', () => {
    expect(formatCents(1)).toBe('0.01')
    expect(formatCents(1050)).toBe('10.50')
    expect(formatCents(MAX_AMOUNT_IN_CENTS)).toBe('9999999999.99')
  })

  it('rejects non-integers and out-of-range values', () => {
    expect(() => formatCents(1.5)).toThrow()
    expect(() => formatCents(0)).toThrow()
    expect(() => formatCents(MAX_AMOUNT_IN_CENTS + 1)).toThrow(/13-character/)
  })
})

describe('sanitizeText', () => {
  it('removes accents and non-ASCII characters', () => {
    expect(sanitizeText('  São João do Açaí  ')).toBe('Sao Joao do Acai')
    expect(sanitizeText('Café ☕ & Cia')).toBe('Cafe & Cia')
    expect(sanitizeText('Linha\nnova')).toBe('Linhanova')
  })
})
