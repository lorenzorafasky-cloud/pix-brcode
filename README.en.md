# pix-brcode

[![npm](https://img.shields.io/npm/v/@lorenzo-rafasky/pix-brcode.svg)](https://www.npmjs.com/package/@lorenzo-rafasky/pix-brcode)
[![CI](https://github.com/lorenzorafasky-cloud/pix-brcode/actions/workflows/ci.yml/badge.svg)](https://github.com/lorenzorafasky-cloud/pix-brcode/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@lorenzo-rafasky/pix-brcode.svg)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

[🇧🇷 Português](README.md) · **🇺🇸 English**

Generate and parse **Pix BR Codes** ("Pix copia e cola", the payload behind Brazil's instant payment QR codes), validate **Pix keys** and render the **QR code** — in TypeScript, with zero dependencies.

```ts
import { createStaticPix, toQRCodeSVG } from '@lorenzo-rafasky/pix-brcode'

const code = createStaticPix({
  key: 'fulano@example.com',
  merchantName: 'Fulano de Tal',
  merchantCity: 'Brasília',
  amount: 10.5,
})
// 00020126400014br.gov.bcb.pix0118fulano@example.com520400005303986540510.505802BR5913Fulano de Tal6008Brasilia62070503***63046BE8

const svg = toQRCodeSVG(code, { width: 256 })
```

## Why this library

- **Follows the Central Bank spec.** Tested against every example in the BCB [Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/estabilidadefinanceira/pix) **version 2.10.0** (Aug 2026): static, dynamic and all three kinds of **Pix Automático composite QR codes**.
- **Generates and parses.** Build the code to get paid, or read a "copia e cola" string, with CRC16 and mandatory field checks.
- **Real Pix key validation.** CPF, CNPJ (including the new **alphanumeric CNPJ**), e-mail, mobile phone and random keys (EVP), accepting what users actually type (`529.982.247-25`, `(61) 91234-5678`...).
- **Built-in QR encoder.** Its own ISO/IEC 18004 encoder with SVG, data URL and terminal output. Tests decode the generated symbols with an independent reader.
- **Zero dependencies**, ~9 KB gzipped (QR encoder included), fully typed, runs on Node.js, browsers, Deno, Bun and edge runtimes.
- **Clear errors.** Nothing is silently rounded or cut: fractions of a cent, long names and invalid keys throw a `PixError` with a `code` and a message explaining the fix.

## Install

```bash
npm install @lorenzo-rafasky/pix-brcode
```

Requires Node.js 20.19+ (ESM package; `require('@lorenzo-rafasky/pix-brcode')` also works on those versions).

## Usage

### Static QR code (Pix key)

```ts
import { createStaticPix } from '@lorenzo-rafasky/pix-brcode'

const code = createStaticPix({
  key: '529.982.247-25',        // CPF, CNPJ, e-mail, phone or random key
  merchantName: 'Loja do João', // up to 25 characters (accents are removed)
  merchantCity: 'São Paulo',    // up to 15 characters
  amount: '49.90',              // optional: number, '49.90' or '49,90'
  txid: 'ORDER12345',           // optional: up to 25 letters/digits; default '***'
  description: 'Order 12345',   // optional: text shown to the payer (infoAdicional)
})
```

| Option | Field | Description |
| --- | --- | --- |
| `key` | 26-01 | Pix key. User-typed formats are normalized. |
| `keyType` | — | `'cpf' \| 'cnpj' \| 'email' \| 'phone' \| 'evp'`. Use `'phone'` for a phone written without `+55`. |
| `merchantName` | 59 | Receiver name (payer apps display the DICT name instead). |
| `merchantCity` | 60 | Receiver city. |
| `amount` / `amountInCents` | 54 | Amount in reais or cents. Omit to let the payer type it. |
| `txid` | 62-05 | Reconciliation ID. |
| `description` | 26-02 | Free text; shares the 99 characters of field 26 with the key. |
| `fss` | 26-03 | ISPB of the withdrawal facilitator (Pix Saque). |
| `singleUse` | 01 | `true` writes `12` (not reusable). |
| `recurrenceUrl` | 80-25 | Pix Automático recurrence location (composite QR). |
| `postalCode`, `merchantCategoryCode` | 61, 52 | Optional. MCC defaults to `0000`. |
| `sanitize` | — | Remove accents and non-ASCII characters (default `true`). |
| `truncate` | — | Cut long name, city and description instead of throwing (default `false`). |

### Dynamic QR code (API Pix location)

Create the charge (`cob`/`cobv`) through your PSP's API Pix and use the returned `location`:

```ts
import { createDynamicPix } from '@lorenzo-rafasky/pix-brcode'

const code = createDynamicPix({
  url: 'https://pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25', // with or without https://
  merchantName: 'Fulano de Tal',
  merchantCity: 'BRASILIA',
})
```

Amount and txid come from the location payload, so they are not part of a dynamic BR Code (the spec says to ignore them). Field 01 is `12` (single use), as in the BCB example; pass `singleUse: false` to omit it.

### Pix Automático (composite QR code)

```ts
import { createDynamicPix, createRecurrencePix, createStaticPix } from '@lorenzo-rafasky/pix-brcode'

const rec = 'pix.example.com/rec/2353c790eefb11eaadc10242ac120002'

createRecurrencePix({ recurrenceUrl: rec, merchantName: 'Fulano de Tal', merchantCity: 'BRASILIA' })
createStaticPix({ key: '...', amount: 100.5, recurrenceUrl: rec, merchantName: '...', merchantCity: '...' })
createDynamicPix({ url: '...', recurrenceUrl: rec, merchantName: '...', merchantCity: '...' }) // same host in both URLs
```

### Parse a "Pix copia e cola"

```ts
import { parsePix, safeParsePix } from '@lorenzo-rafasky/pix-brcode'

const pix = parsePix(code) // throws PixError when invalid (format, CRC, mandatory fields)

switch (pix.type) {
  case 'static':
    console.log(pix.key, pix.keyType, pix.amount, pix.txid)
    break
  case 'dynamic':
    console.log(pix.url) // fetch `https://${pix.url}` and verify the JWS
    break
  case 'recurrence':
    console.log(pix.recurrenceUrl)
    break
}

pix.composite // true when there is a recurrenceUrl (Pix Automático)
pix.fields    // every decoded EMV field, for anything not mapped above

const result = safeParsePix(input) // { success: true, data } | { success: false, error }
```

### Validate Pix keys

```ts
import { validatePixKey, isValidCPF, isValidCNPJ, formatPixKey } from '@lorenzo-rafasky/pix-brcode'

validatePixKey('529.982.247-25')            // { valid: true, type: 'cpf', key: '52998224725' }
validatePixKey('12.ABC.345/01DE-35')        // { valid: true, type: 'cnpj', key: '12ABC34501DE35' }
validatePixKey(' Fulano@Example.com ')      // { valid: true, type: 'email', key: 'fulano@example.com' }
validatePixKey('(61) 91234-5678')           // { valid: true, type: 'phone', key: '+5561912345678' }
validatePixKey('61912345678', 'phone')      // 11 digits mean CPF by default; pass the type for phones
validatePixKey('123.456.789-00')            // { valid: false, type: 'cpf', reason: 'Invalid CPF check digits. ...' }

isValidCPF('111.444.777-35')                // true
isValidCNPJ('11.222.333/0001-81')           // true
formatPixKey('+5561912345678')              // '+55 (61) 91234-5678'
```

### QR code

```ts
import { toQRCodeSVG, toQRCodeDataURL, encodeQRCode } from '@lorenzo-rafasky/pix-brcode'

const svg = toQRCodeSVG(code, { width: 256, margin: 4, darkColor: '#000', lightColor: '#fff' })

<img src={toQRCodeDataURL(code)} alt="Pix QR code" width={256} height={256} />

const qr = encodeQRCode(code, { errorCorrectionLevel: 'M' })
qr.modules[y][x] // true = dark module; draw it on a canvas, PDF, etc.
```

### Command line

```bash
npx @lorenzo-rafasky/pix-brcode create static --key fulano@example.com --name "Fulano de Tal" --city Brasilia --amount 10.50 --qr
npx @lorenzo-rafasky/pix-brcode parse "<copia e cola>"
npx @lorenzo-rafasky/pix-brcode qr "<copia e cola>" --svg > pix.svg
npx @lorenzo-rafasky/pix-brcode key "(61) 91234-5678"
```

## Errors

Every function throws `PixError` with a stable `code`: `INVALID_FORMAT`, `INVALID_CRC`, `NOT_PIX`, `MISSING_FIELD`, `INVALID_FIELD`, `FIELD_TOO_LONG`, `INVALID_KEY`, `INVALID_AMOUNT`, `INVALID_OPTION`, `DATA_TOO_LONG`. See the [Portuguese README](README.md#erros) for when each one happens.

## Notes

- **Out of scope:** creating charges in your PSP's API Pix, and fetching/verifying the signed (JWS) payload of dynamic QR codes.
- **Name and city** follow EMV, which only allows printable ASCII, so accents are removed. Payer apps show the name registered in the DICT, not field 59.
- **CPF vs phone:** without `keyType`, 11 digits are treated as a CPF; phones need `+55` or `keyType: 'phone'`.
- Independent project, not affiliated with Banco Central do Brasil. "Pix" is a trademark of the BCB.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
