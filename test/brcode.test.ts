import { describe, expect, it } from 'vitest'
import {
  createDynamicPix,
  createRecurrencePix,
  createStaticPix,
  crc16Hex,
  isValidPix,
  parsePix,
  PixError,
  safeParsePix,
  toHttpsUrl,
} from '../src/index.js'
import {
  BCB_COMPOSITE_DYNAMIC,
  BCB_COMPOSITE_RECURRENCE_ONLY,
  BCB_COMPOSITE_STATIC,
  BCB_DYNAMIC,
  BCB_EVP,
  BCB_MERCHANT,
  BCB_RECURRENCE_URL,
  BCB_STATIC,
  BCB_URL,
} from './vectors.js'

/** Recomputes field 63 after tampering with a payload in a test. */
function withValidCrc(code: string): string {
  const body = code.slice(0, -4)
  return body + crc16Hex(body)
}

function expectPixError(fn: () => unknown, code: PixError['code']): void {
  expect(fn).toThrow(expect.objectContaining({ name: 'PixError', code }))
}

describe('BCB manual examples — generation', () => {
  it('generates the static example (section 2.6.3)', () => {
    expect(createStaticPix({ key: BCB_EVP, ...BCB_MERCHANT })).toBe(BCB_STATIC)
  })

  it('generates the dynamic example (section 2.7.2)', () => {
    expect(createDynamicPix({ url: BCB_URL, ...BCB_MERCHANT })).toBe(BCB_DYNAMIC)
    expect(createDynamicPix({ url: `https://${BCB_URL}`, ...BCB_MERCHANT })).toBe(BCB_DYNAMIC)
  })

  it('generates the composite example with only recurrence (section 2.8.5.1)', () => {
    expect(createRecurrencePix({ recurrenceUrl: BCB_RECURRENCE_URL, ...BCB_MERCHANT })).toBe(
      BCB_COMPOSITE_RECURRENCE_ONLY,
    )
  })

  it('generates the composite example with static data (section 2.8.5.2)', () => {
    expect(
      createStaticPix({
        key: BCB_EVP,
        amount: 100.5,
        recurrenceUrl: BCB_RECURRENCE_URL,
        ...BCB_MERCHANT,
      }),
    ).toBe(BCB_COMPOSITE_STATIC)
  })

  it('generates the composite example with dynamic data (section 2.8.5.3)', () => {
    expect(
      createDynamicPix({ url: BCB_URL, recurrenceUrl: BCB_RECURRENCE_URL, ...BCB_MERCHANT }),
    ).toBe(BCB_COMPOSITE_DYNAMIC)
  })
})

describe('BCB manual examples — parsing', () => {
  it('parses the static example', () => {
    const pix = parsePix(BCB_STATIC)
    expect(pix).toMatchObject({
      type: 'static',
      composite: false,
      payloadFormatIndicator: '01',
      singleUse: false,
      merchantAccountId: '26',
      key: BCB_EVP,
      keyType: 'evp',
      merchantCategoryCode: '0000',
      transactionCurrency: '986',
      countryCode: 'BR',
      merchantName: 'Fulano de Tal',
      merchantCity: 'BRASILIA',
      txid: '***',
      crc: '1D3D',
    })
    expect(pix.amount).toBeUndefined()
    expect(pix.url).toBeUndefined()
    expect(pix.pointOfInitiationMethod).toBeUndefined()
  })

  it('parses the dynamic example', () => {
    const pix = parsePix(BCB_DYNAMIC)
    expect(pix).toMatchObject({
      type: 'dynamic',
      composite: false,
      pointOfInitiationMethod: '12',
      singleUse: true,
      url: BCB_URL,
      txid: '***',
      crc: '64E4',
    })
    expect(pix.key).toBeUndefined()
    if (pix.type === 'dynamic') expect(toHttpsUrl(pix.url)).toBe(`https://${BCB_URL}`)
  })

  it('parses the composite examples', () => {
    expect(parsePix(BCB_COMPOSITE_RECURRENCE_ONLY)).toMatchObject({
      type: 'recurrence',
      composite: true,
      recurrenceUrl: BCB_RECURRENCE_URL,
    })
    expect(parsePix(BCB_COMPOSITE_STATIC)).toMatchObject({
      type: 'static',
      composite: true,
      key: BCB_EVP,
      amount: 100.5,
      amountInCents: 10050,
      recurrenceUrl: BCB_RECURRENCE_URL,
    })
    expect(parsePix(BCB_COMPOSITE_DYNAMIC)).toMatchObject({
      type: 'dynamic',
      composite: true,
      url: BCB_URL,
      recurrenceUrl: BCB_RECURRENCE_URL,
    })
  })

  it('exposes every raw field', () => {
    const pix = parsePix(BCB_STATIC)
    expect(pix.fields.map((f) => f.id)).toEqual(['00', '26', '52', '53', '58', '59', '60', '62', '63'])
  })
})

describe('createStaticPix', () => {
  const base = { key: BCB_EVP, ...BCB_MERCHANT }

  it('round-trips every option through parsePix', () => {
    const code = createStaticPix({
      key: 'Fulano@Example.com',
      merchantName: 'Loja do João',
      merchantCity: 'São Paulo',
      amount: '1234,5',
      txid: 'PEDIDO123',
      description: 'Pedido 123',
      postalCode: '01310-100',
      merchantCategoryCode: '5812',
      singleUse: true,
    })
    expect(parsePix(code)).toMatchObject({
      type: 'static',
      key: 'fulano@example.com',
      keyType: 'email',
      merchantName: 'Loja do Joao',
      merchantCity: 'Sao Paulo',
      amount: 1234.5,
      amountInCents: 123450,
      txid: 'PEDIDO123',
      description: 'Pedido 123',
      postalCode: '01310100',
      merchantCategoryCode: '5812',
      singleUse: true,
      pointOfInitiationMethod: '12',
    })
    expect(code).toContain('54071234.50')
  })

  it('normalizes keys', () => {
    expect(parsePix(createStaticPix({ ...base, key: '529.982.247-25' })).key).toBe('52998224725')
    expect(parsePix(createStaticPix({ ...base, key: '12.abc.345/01de-35' })).key).toBe('12ABC34501DE35')
    expect(
      parsePix(createStaticPix({ ...base, key: '(61) 91234-5678', keyType: 'phone' })).key,
    ).toBe('+5561912345678')
  })

  it('accepts amountInCents', () => {
    expect(parsePix(createStaticPix({ ...base, amountInCents: 1 })).amount).toBe(0.01)
  })

  it('writes the fss field (Pix Saque)', () => {
    const pix = parsePix(createStaticPix({ ...base, amount: 50, fss: '12345678' }))
    expect(pix.fss).toBe('12345678')
  })

  it('uses *** when there is no txid', () => {
    expect(createStaticPix(base)).toContain('62070503***')
    expect(createStaticPix({ ...base, txid: '***' })).toContain('62070503***')
  })

  it('rejects invalid input', () => {
    expectPixError(() => createStaticPix({ ...base, key: '123.456.789-00' }), 'INVALID_KEY')
    expectPixError(() => createStaticPix({ ...base, amount: 0 }), 'INVALID_AMOUNT')
    expectPixError(() => createStaticPix({ ...base, amount: 1.005 }), 'INVALID_AMOUNT')
    expectPixError(() => createStaticPix({ ...base, amount: 1, amountInCents: 100 }), 'INVALID_OPTION')
    expectPixError(() => createStaticPix({ ...base, txid: 'pedido-123' }), 'INVALID_FIELD')
    expectPixError(() => createStaticPix({ ...base, txid: 'a'.repeat(26) }), 'INVALID_FIELD')
    expectPixError(() => createStaticPix({ ...base, fss: '123' }), 'INVALID_FIELD')
    expectPixError(() => createStaticPix({ ...base, merchantCategoryCode: '12' }), 'INVALID_FIELD')
    expectPixError(() => createStaticPix({ ...base, postalCode: '01310-100-000' }), 'INVALID_FIELD')
    expectPixError(() => createStaticPix({ ...base, merchantName: '   ' }), 'MISSING_FIELD')
    expectPixError(
      () => createStaticPix({ key: BCB_EVP, merchantName: 'x', merchantCity: undefined as unknown as string }),
      'INVALID_OPTION',
    )
  })

  it('enforces field sizes, or truncates when asked', () => {
    const longName = 'Comercio de Alimentos Fulano de Tal Ltda'
    expectPixError(() => createStaticPix({ ...base, merchantName: longName }), 'FIELD_TOO_LONG')
    expectPixError(() => createStaticPix({ ...base, merchantCity: 'Sao Jose dos Campos' }), 'FIELD_TOO_LONG')
    const pix = parsePix(
      createStaticPix({ ...base, merchantName: longName, merchantCity: 'Sao Jose dos Campos', truncate: true }),
    )
    expect(pix.merchantName).toBe('Comercio de Alimentos Ful')
    expect(pix.merchantCity).toBe('Sao Jose dos Ca')
  })

  it('limits the description to the space left in the 99-character template', () => {
    // GUI (18) + EVP key (4 + 36) + description header (4) leaves 37 characters.
    const fits = 'x'.repeat(37)
    expect(parsePix(createStaticPix({ ...base, description: fits })).description).toBe(fits)
    expectPixError(() => createStaticPix({ ...base, description: fits + 'x' }), 'FIELD_TOO_LONG')
    expect(
      parsePix(createStaticPix({ ...base, description: fits + 'xyz', truncate: true })).description,
    ).toBe(fits)
    // With fss there are 12 characters less.
    expectPixError(() => createStaticPix({ ...base, fss: '12345678', description: 'x'.repeat(26) }), 'FIELD_TOO_LONG')
    // A 77-character e-mail key leaves no room at all.
    const email = `${'a'.repeat(65)}@example.com`
    expect(email).toHaveLength(77)
    expectPixError(() => createStaticPix({ ...base, key: email, description: 'x' }), 'FIELD_TOO_LONG')
  })

  it('omits an empty description', () => {
    expect(createStaticPix({ ...base, description: '  ' })).toBe(BCB_STATIC)
  })

  it('removes accents by default, or refuses them with sanitize: false', () => {
    expect(parsePix(createStaticPix({ ...base, merchantCity: 'Brasília' })).merchantCity).toBe('Brasilia')
    expectPixError(
      () => createStaticPix({ ...base, merchantCity: 'Brasília', sanitize: false }),
      'INVALID_FIELD',
    )
  })
})

describe('createDynamicPix', () => {
  const base = { url: BCB_URL, ...BCB_MERCHANT }

  it('can omit field 01 for reusable dynamic BR Codes', () => {
    const pix = parsePix(createDynamicPix({ ...base, singleUse: false }))
    expect(pix.pointOfInitiationMethod).toBeUndefined()
    expect(pix.singleUse).toBe(false)
  })

  it('validates the location', () => {
    expectPixError(() => createDynamicPix({ ...base, url: 'http://pix.example.com/abc' }), 'INVALID_FIELD')
    expectPixError(() => createDynamicPix({ ...base, url: 'pix.example.com' }), 'INVALID_FIELD')
    expectPixError(() => createDynamicPix({ ...base, url: 'pix example.com/abc' }), 'INVALID_FIELD')
    expectPixError(
      () => createDynamicPix({ ...base, url: `pix.example.com/${'a'.repeat(62)}` }),
      'FIELD_TOO_LONG',
    )
    expect(() => createDynamicPix({ ...base, url: `pix.example.com/${'a'.repeat(61)}` })).not.toThrow()
  })

  it('requires the same host for payment and recurrence locations', () => {
    expectPixError(
      () => createDynamicPix({ ...base, recurrenceUrl: 'other.example.com/rec/abc' }),
      'INVALID_FIELD',
    )
  })
})

describe('parsePix', () => {
  it('trims whitespace and accepts a lowercase CRC', () => {
    expect(parsePix(`  ${BCB_STATIC}\n`).crc).toBe('1D3D')
    expect(parsePix(BCB_STATIC.slice(0, -4) + '1d3d').crc).toBe('1d3d')
  })

  it('accepts the GUI in any case', () => {
    const code = withValidCrc(BCB_STATIC.replace('br.gov.bcb.pix', 'BR.GOV.BCB.PIX'))
    expect(parsePix(code).type).toBe('static')
  })

  it('finds the Pix template in any ID from 26 to 51', () => {
    const code = withValidCrc(BCB_STATIC.replace('2658', '2758'))
    expect(parsePix(code).merchantAccountId).toBe('27')
  })

  it('rejects a wrong CRC', () => {
    expectPixError(() => parsePix(BCB_STATIC.slice(0, -4) + '0000'), 'INVALID_CRC')
    expectPixError(() => parsePix(BCB_STATIC.replace('Fulano', 'Fulana')), 'INVALID_CRC')
  })

  it('rejects malformed payloads', () => {
    expectPixError(() => parsePix(''), 'INVALID_FORMAT')
    expectPixError(() => parsePix('hello world'), 'INVALID_FORMAT')
    expectPixError(() => parsePix(BCB_STATIC.slice(0, -1)), 'INVALID_FORMAT')
    expectPixError(() => parsePix(123 as unknown as string), 'INVALID_FORMAT')
    expectPixError(() => parsePix(withValidCrc('5802BR' + BCB_STATIC)), 'INVALID_FORMAT')
    expectPixError(() => parsePix(withValidCrc(BCB_STATIC.replace('000201', '000202'))), 'INVALID_FIELD')
  })

  it('rejects EMV QR codes without a Pix account', () => {
    const code = withValidCrc(BCB_STATIC.replace('br.gov.bcb.pix', 'br.com.foo.pay'))
    expectPixError(() => parsePix(code), 'NOT_PIX')
  })

  it('rejects missing mandatory fields', () => {
    const code = withValidCrc(BCB_STATIC.replace('5913Fulano de Tal', ''))
    expectPixError(() => parsePix(code), 'MISSING_FIELD')
  })

  it('rejects an invalid amount or point of initiation method', () => {
    const amount = withValidCrc(BCB_STATIC.replace('5802BR', '54041,005802BR'))
    expectPixError(() => parsePix(amount), 'INVALID_FIELD')
    const poi = withValidCrc(BCB_STATIC.replace('000201', '000201010213'))
    expectPixError(() => parsePix(poi), 'INVALID_FIELD')
  })

  it('reports BR Codes without txid', () => {
    const code = withValidCrc(BCB_STATIC.replace('62070503***', ''))
    expect(parsePix(code).txid).toBeUndefined()
  })
})

describe('safeParsePix and isValidPix', () => {
  it('never throw for invalid input', () => {
    const result = safeParsePix('not a pix code')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBeInstanceOf(PixError)
    expect(isValidPix('not a pix code')).toBe(false)
  })

  it('return the parsed data for valid input', () => {
    const result = safeParsePix(BCB_DYNAMIC)
    expect(result.success && result.data.type).toBe('dynamic')
    expect(isValidPix(BCB_STATIC)).toBe(true)
  })
})
