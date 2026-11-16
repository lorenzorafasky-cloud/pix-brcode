import { describe, expect, it } from 'vitest'
import {
  detectPixKeyType,
  formatPixKey,
  isValidCNPJ,
  isValidCPF,
  isValidPixKey,
  normalizePixKey,
  PixError,
  validatePixKey,
} from '../src/index.js'

describe('isValidCPF', () => {
  it.each(['52998224725', '529.982.247-25', '12345678909', ' 111.444.777-35 '])('accepts %s', (cpf) => {
    expect(isValidCPF(cpf)).toBe(true)
  })

  it.each([
    ['wrong check digit', '52998224724'],
    ['repeated digits', '11111111111'],
    ['too short', '5299822472'],
    ['letters', '5299822472a'],
    // Format example of the BCB manual: right shape, wrong check digits.
    ['BCB format example', '12345678900'],
  ])('rejects %s', (_, cpf) => {
    expect(isValidCPF(cpf)).toBe(false)
  })
})

describe('isValidCNPJ', () => {
  it.each([
    '11222333000181',
    '11.222.333/0001-81',
    // Examples from the BCB manual (section 2.5.1), including an alphanumeric CNPJ.
    '00038166000105',
    '12ABC34501DE35',
    '12.abc.345/01de-35',
  ])('accepts %s', (cnpj) => {
    expect(isValidCNPJ(cnpj)).toBe(true)
  })

  it.each([
    ['wrong check digit', '11222333000182'],
    ['wrong alphanumeric check digit', '12ABC34501DE36'],
    ['letters in check digits', '12ABC34501DE3A'],
    ['repeated digits', '00000000000000'],
    ['too short', '1122233300018'],
  ])('rejects %s', (_, cnpj) => {
    expect(isValidCNPJ(cnpj)).toBe(false)
  })
})

describe('validatePixKey', () => {
  it.each([
    // Examples from the BCB manual (section 2.5.1).
    ['fulano_da_silva.recebedor@example.com', 'email', 'fulano_da_silva.recebedor@example.com'],
    ['00038166000105', 'cnpj', '00038166000105'],
    ['12ABC34501DE35', 'cnpj', '12ABC34501DE35'],
    ['+5561912345678', 'phone', '+5561912345678'],
    ['123e4567-e12b-12d1-a456-426655440000', 'evp', '123e4567-e12b-12d1-a456-426655440000'],
    // User-typed variants.
    ['529.982.247-25', 'cpf', '52998224725'],
    ['11.222.333/0001-81', 'cnpj', '11222333000181'],
    ['  Fulano@Example.COM ', 'email', 'fulano@example.com'],
    ['+55 (61) 91234-5678', 'phone', '+5561912345678'],
    ['(61) 91234-5678', 'phone', '+5561912345678'],
    ['123E4567-E12B-12D1-A456-426655440000', 'evp', '123e4567-e12b-12d1-a456-426655440000'],
  ])('normalizes %s', (input, type, key) => {
    expect(validatePixKey(input)).toEqual({ valid: true, type, key })
  })

  it('uses the given type for ambiguous numbers', () => {
    expect(validatePixKey('61912345678')).toMatchObject({ valid: false, type: 'cpf' })
    expect(validatePixKey('61912345678', 'phone')).toEqual({
      valid: true,
      type: 'phone',
      key: '+5561912345678',
    })
    expect(validatePixKey('5561912345678', 'phone')).toMatchObject({ valid: true, key: '+5561912345678' })
  })

  it('hints at phone numbers when an 11-digit CPF is invalid', () => {
    const result = validatePixKey('61912345678')
    expect(!result.valid && result.reason).toMatch(/\+55/)
  })

  it.each([
    ['empty', '', undefined],
    ['invalid CPF', '123.456.789-00', undefined],
    ['invalid CNPJ', '11.222.333/0001-82', undefined],
    ['invalid e-mail', 'fulano@', 'email'],
    ['e-mail over 77 characters', `${'a'.repeat(66)}@example.com`, 'email'],
    ['landline number', '+556132345678', 'phone'],
    ['invalid area code', '+5520912345678', 'phone'],
    ['non-E.164 phone', '+0123', 'phone'],
    ['malformed EVP', '123e4567-e12b-12d1-a456', 'evp'],
    ['garbage', 'not a key', undefined],
  ] as const)('rejects %s', (_, input, type) => {
    const result = validatePixKey(input, type)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBeTruthy()
  })

  it('accepts foreign phone numbers in E.164 format', () => {
    expect(validatePixKey('+14155552671')).toMatchObject({ valid: true, type: 'phone' })
  })

  it('rejects unknown types', () => {
    expect(validatePixKey('x', 'pix' as never).valid).toBe(false)
  })
})

describe('helpers', () => {
  it('isValidPixKey', () => {
    expect(isValidPixKey('529.982.247-25')).toBe(true)
    expect(isValidPixKey('529.982.247-25', 'email')).toBe(false)
  })

  it('normalizePixKey throws PixError with the reason', () => {
    expect(normalizePixKey('Fulano@Example.com')).toBe('fulano@example.com')
    expect(() => normalizePixKey('123.456.789-00')).toThrow(PixError)
    expect(() => normalizePixKey('123.456.789-00')).toThrow(/check digits/)
  })

  it('detectPixKeyType looks only at the shape of canonical keys', () => {
    expect(detectPixKeyType('12345678900')).toBe('cpf')
    expect(detectPixKeyType('00038166000105')).toBe('cnpj')
    expect(detectPixKeyType('12ABC34501DE35')).toBe('cnpj')
    expect(detectPixKeyType('a@b.c')).toBe('email')
    expect(detectPixKeyType('+5561912345678')).toBe('phone')
    expect(detectPixKeyType('123e4567-e12b-12d1-a456-426655440000')).toBe('evp')
    expect(detectPixKeyType('529.982.247-25')).toBeUndefined()
  })

  it('formatPixKey', () => {
    expect(formatPixKey('52998224725')).toBe('529.982.247-25')
    expect(formatPixKey('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatPixKey('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
    expect(formatPixKey('+5561912345678')).toBe('+55 (61) 91234-5678')
    expect(formatPixKey('fulano@example.com')).toBe('fulano@example.com')
  })
})
