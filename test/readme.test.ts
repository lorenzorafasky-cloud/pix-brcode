import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createStaticPix, formatPixKey, isValidCNPJ, isValidCPF, validatePixKey } from '../src/index.js'

const readmes = ['README.md', 'README.en.md'].map((file) => [
  file,
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
])

describe('README examples', () => {
  const quickStart = createStaticPix({
    key: 'fulano@example.com',
    merchantName: 'Fulano de Tal',
    merchantCity: 'Brasília',
    amount: 10.5,
  })

  it.each(readmes)('%s shows the real output of the quick start', (_, text) => {
    expect(text).toContain(`// ${quickStart}`)
  })

  it('key examples return what the README says', () => {
    expect(validatePixKey('529.982.247-25')).toEqual({ valid: true, type: 'cpf', key: '52998224725' })
    expect(validatePixKey('12.ABC.345/01DE-35')).toEqual({ valid: true, type: 'cnpj', key: '12ABC34501DE35' })
    expect(validatePixKey(' Fulano@Example.com ')).toEqual({ valid: true, type: 'email', key: 'fulano@example.com' })
    expect(validatePixKey('(61) 91234-5678')).toEqual({ valid: true, type: 'phone', key: '+5561912345678' })
    expect(validatePixKey('61912345678', 'phone')).toMatchObject({ valid: true, key: '+5561912345678' })
    expect(validatePixKey('123.456.789-00')).toMatchObject({ valid: false, type: 'cpf' })
    expect(isValidCPF('111.444.777-35')).toBe(true)
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true)
    expect(formatPixKey('+5561912345678')).toBe('+55 (61) 91234-5678')
  })

  it('usage examples run', () => {
    expect(() =>
      createStaticPix({
        key: '529.982.247-25',
        merchantName: 'Loja do João',
        merchantCity: 'São Paulo',
        amount: '49,90',
        txid: 'PEDIDO12345',
        description: 'Pedido 12345',
      }),
    ).not.toThrow()
  })
})
