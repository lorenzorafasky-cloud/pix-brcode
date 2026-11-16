# pix-brcode

[![npm](https://img.shields.io/npm/v/@lorenzo-rafasky/pix-brcode.svg)](https://www.npmjs.com/package/@lorenzo-rafasky/pix-brcode)
[![CI](https://github.com/lorenzorafasky-cloud/pix-brcode/actions/workflows/ci.yml/badge.svg)](https://github.com/lorenzorafasky-cloud/pix-brcode/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@lorenzo-rafasky/pix-brcode.svg)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

**🇧🇷 Português** · [🇺🇸 English](README.en.md)

Gere e leia **BR Codes do Pix** ("Pix copia e cola"), valide **chaves Pix** e desenhe o **QR Code** — em TypeScript, sem nenhuma dependência.

```ts
import { createStaticPix, toQRCodeSVG } from '@lorenzo-rafasky/pix-brcode'

const copiaECola = createStaticPix({
  key: 'fulano@example.com',
  merchantName: 'Fulano de Tal',
  merchantCity: 'Brasília',
  amount: 10.5,
})
// 00020126400014br.gov.bcb.pix0118fulano@example.com520400005303986540510.505802BR5913Fulano de Tal6008Brasilia62070503***63046BE8

const svg = toQRCodeSVG(copiaECola, { width: 256 })
```

## Por que esta biblioteca

- **Conforme o manual do Banco Central.** Testada contra todos os exemplos do [Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/estabilidadefinanceira/pix) **versão 2.10.0** (ago/2026): QR estático, dinâmico e os três tipos de **QR composto do Pix Automático**.
- **Gera e lê.** Monte o código para cobrar, ou leia um "copia e cola" recebido, com verificação de CRC16 e de campos obrigatórios.
- **Chaves Pix de verdade.** Valida e normaliza CPF, CNPJ (inclusive o **CNPJ alfanumérico**), e-mail, celular e chave aleatória (EVP), aceitando o que o usuário digita (`529.982.247-25`, `(61) 91234-5678`...).
- **QR Code embutido.** Codificador QR próprio (ISO/IEC 18004), com saída SVG, data URL e terminal. Os testes decodificam os QR gerados com um leitor independente.
- **Zero dependências**, ~9 KB gzip (tudo incluso, QR Code junto), tipos inclusos, funciona em Node.js, navegadores, Deno, Bun e edge (Cloudflare Workers, Vercel).
- **Erros claros.** Nada é arredondado ou cortado em silêncio: valores com fração de centavo, nomes longos e chaves inválidas geram um `PixError` com `code` e mensagem explicando o que corrigir.

## Instalação

```bash
npm install @lorenzo-rafasky/pix-brcode
```

Requer Node.js 20.19+ (pacote ESM; `require('@lorenzo-rafasky/pix-brcode')` também funciona nessas versões).

## Uso

### QR Code estático (com chave Pix)

```ts
import { createStaticPix } from '@lorenzo-rafasky/pix-brcode'

const code = createStaticPix({
  key: '529.982.247-25',        // CPF, CNPJ, e-mail, celular ou chave aleatória
  merchantName: 'Loja do João', // até 25 caracteres (acentos são removidos)
  merchantCity: 'São Paulo',    // até 15 caracteres
  amount: '49,90',              // opcional: number, '49.90' ou '49,90'
  txid: 'PEDIDO12345',          // opcional: até 25 letras/dígitos; padrão '***'
  description: 'Pedido 12345',  // opcional: texto mostrado ao pagador (infoAdicional)
})
```

| Opção | Campo | Descrição |
| --- | --- | --- |
| `key` | 26-01 | Chave Pix. Formatos digitados são normalizados. |
| `keyType` | — | `'cpf' \| 'cnpj' \| 'email' \| 'phone' \| 'evp'`. Use `'phone'` para celular escrito sem `+55`. |
| `merchantName` | 59 | Nome do recebedor (o app do pagador mostra o nome do DICT). |
| `merchantCity` | 60 | Cidade do recebedor. |
| `amount` / `amountInCents` | 54 | Valor em reais ou em centavos. Omita para o pagador digitar. |
| `txid` | 62-05 | Identificador para conciliação. |
| `description` | 26-02 | Texto livre; divide os 99 caracteres do campo 26 com a chave. |
| `fss` | 26-03 | ISPB do facilitador de serviço de saque (Pix Saque). |
| `singleUse` | 01 | `true` grava `12` (não reutilizável). |
| `recurrenceUrl` | 80-25 | Location de recorrência do Pix Automático (QR composto). |
| `postalCode`, `merchantCategoryCode` | 61, 52 | Opcionais. MCC padrão `0000`. |
| `sanitize` | — | Remove acentos e caracteres fora do ASCII (padrão `true`). |
| `truncate` | — | Corta nome, cidade e descrição longos em vez de lançar erro (padrão `false`). |

### QR Code dinâmico (location da API Pix)

Crie a cobrança (`cob`/`cobv`) na API Pix do seu PSP e use a `location` retornada:

```ts
import { createDynamicPix } from '@lorenzo-rafasky/pix-brcode'

const code = createDynamicPix({
  url: 'https://pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25', // com ou sem https://
  merchantName: 'Fulano de Tal',
  merchantCity: 'BRASILIA',
})
```

Valor e txid vêm do payload da URL, por isso não fazem parte do BR Code dinâmico (o manual manda ignorá-los). O campo 01 sai como `12` (uso único), como no exemplo do BCB; passe `singleUse: false` para omiti-lo.

### Pix Automático (QR Code composto)

```ts
import { createDynamicPix, createRecurrencePix, createStaticPix } from '@lorenzo-rafasky/pix-brcode'

const rec = 'pix.example.com/rec/2353c790eefb11eaadc10242ac120002'

createRecurrencePix({ recurrenceUrl: rec, merchantName: 'Fulano de Tal', merchantCity: 'BRASILIA' })
createStaticPix({ key: '...', amount: 100.5, recurrenceUrl: rec, merchantName: '...', merchantCity: '...' })
createDynamicPix({ url: '...', recurrenceUrl: rec, merchantName: '...', merchantCity: '...' }) // mesmo host nas duas URLs
```

### Ler um "Pix copia e cola"

```ts
import { parsePix, safeParsePix } from '@lorenzo-rafasky/pix-brcode'

const pix = parsePix(code) // lança PixError se inválido (formato, CRC, campos obrigatórios)

switch (pix.type) {
  case 'static':
    console.log(pix.key, pix.keyType, pix.amount, pix.txid)
    break
  case 'dynamic':
    console.log(pix.url) // busque o payload em `https://${pix.url}` e valide o JWS
    break
  case 'recurrence':
    console.log(pix.recurrenceUrl)
    break
}

pix.composite // true se houver recurrenceUrl (Pix Automático)
pix.fields    // todos os campos EMV decodificados, para o que não estiver mapeado

const result = safeParsePix(input) // { success: true, data } | { success: false, error }
```

### Validar chaves Pix

```ts
import { validatePixKey, isValidCPF, isValidCNPJ, formatPixKey } from '@lorenzo-rafasky/pix-brcode'

validatePixKey('529.982.247-25')            // { valid: true, type: 'cpf', key: '52998224725' }
validatePixKey('12.ABC.345/01DE-35')        // { valid: true, type: 'cnpj', key: '12ABC34501DE35' }
validatePixKey(' Fulano@Example.com ')      // { valid: true, type: 'email', key: 'fulano@example.com' }
validatePixKey('(61) 91234-5678')           // { valid: true, type: 'phone', key: '+5561912345678' }
validatePixKey('61912345678', 'phone')      // 11 dígitos são CPF por padrão; informe o tipo para celular
validatePixKey('123.456.789-00')            // { valid: false, type: 'cpf', reason: 'Invalid CPF check digits. ...' }

isValidCPF('111.444.777-35')                // true
isValidCNPJ('11.222.333/0001-81')           // true
formatPixKey('+5561912345678')              // '+55 (61) 91234-5678'
```

### QR Code

```ts
import { toQRCodeSVG, toQRCodeDataURL, encodeQRCode } from '@lorenzo-rafasky/pix-brcode'

// SVG (string)
const svg = toQRCodeSVG(code, { width: 256, margin: 4, darkColor: '#000', lightColor: '#fff' })

// <img> no navegador / React
<img src={toQRCodeDataURL(code)} alt="QR Code Pix" width={256} height={256} />

// Matriz de módulos, para desenhar em canvas, PDF etc.
const qr = encodeQRCode(code, { errorCorrectionLevel: 'M' })
qr.modules[y][x] // true = módulo escuro
```

Desenhando num `<canvas>`:

```ts
const qr = encodeQRCode(code)
const scale = 8, margin = 4
canvas.width = canvas.height = (qr.size + margin * 2) * scale
const ctx = canvas.getContext('2d')!
ctx.fillStyle = '#fff'
ctx.fillRect(0, 0, canvas.width, canvas.height)
ctx.fillStyle = '#000'
qr.modules.forEach((row, y) => row.forEach((dark, x) => {
  if (dark) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale)
}))
```

### Linha de comando

```bash
npx @lorenzo-rafasky/pix-brcode create static --key fulano@example.com --name "Fulano de Tal" --city Brasilia --amount 10.50 --qr
npx @lorenzo-rafasky/pix-brcode parse "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"
npx @lorenzo-rafasky/pix-brcode qr "<copia e cola>" --svg > pix.svg
npx @lorenzo-rafasky/pix-brcode key "(61) 91234-5678"
```

## Erros

Todas as funções lançam `PixError`, com `code` estável para tratamento:

| `code` | Quando |
| --- | --- |
| `INVALID_FORMAT` | Não é um payload EMV válido (estrutura, campo 00 ou 63). |
| `INVALID_CRC` | O CRC16 não confere — o código foi alterado ou copiado pela metade. |
| `NOT_PIX` | É um QR EMV, mas não tem conta Pix (`br.gov.bcb.pix`). |
| `MISSING_FIELD` | Falta um campo obrigatório. |
| `INVALID_FIELD` | Campo com valor inválido (txid, URL, MCC...). |
| `FIELD_TOO_LONG` | Valor não cabe no campo (use `truncate: true` se quiser cortar). |
| `INVALID_KEY` | Chave Pix inválida. |
| `INVALID_AMOUNT` | Valor zero, negativo, com fração de centavo ou grande demais. |
| `INVALID_OPTION` | Opção com tipo errado. |
| `DATA_TOO_LONG` | Conteúdo não cabe no QR Code com as opções dadas. |

```ts
try {
  parsePix(input)
} catch (error) {
  if (error instanceof PixError && error.code === 'INVALID_CRC') {
    // peça para o usuário copiar o código de novo
  }
}
```

## API

| Função | Descrição |
| --- | --- |
| `createStaticPix(options)` | BR Code estático (chave Pix). |
| `createDynamicPix(options)` | BR Code dinâmico (location). |
| `createRecurrencePix(options)` | QR composto só com recorrência (Pix Automático). |
| `parsePix(code)` / `safeParsePix(code)` / `isValidPix(code)` | Leitura e validação. |
| `validatePixKey(key, type?)` / `normalizePixKey` / `isValidPixKey` / `detectPixKeyType` / `formatPixKey` | Chaves Pix. |
| `isValidCPF(value)` / `isValidCNPJ(value)` | Dígitos verificadores (CNPJ numérico e alfanumérico). |
| `encodeQRCode(text, options?)` / `toQRCodeSVG` / `toQRCodeDataURL` / `renderSVG` / `renderText` | QR Code. |
| `crc16(input)` / `crc16Hex(input)` | CRC-16/CCITT-FALSE do campo 63. |
| `encodeField` / `encodeFields` / `decodeFields` | TLV EMV de baixo nível. |
| `formatAmount` / `formatCents` / `toCents` / `sanitizeText` / `toHttpsUrl` | Utilitários. |

Todas as opções e retornos estão documentados nos tipos (TSDoc) — o editor mostra tudo.

## Observações

- **O que esta biblioteca não faz:** criar cobranças na API Pix do seu PSP, nem buscar e validar a assinatura (JWS) do payload de QR Codes dinâmicos. Ela cuida do BR Code; a integração com o PSP é sua.
- **Nome e cidade:** o manual segue o EMV, que só aceita ASCII imprimível. Por isso acentos são removidos (`São Paulo` → `Sao Paulo`). O app do pagador mostra o nome cadastrado no DICT, não o campo 59.
- **CPF × celular:** `61912345678` pode ser os dois. Sem `keyType`, 11 dígitos são tratados como CPF; celulares precisam de `+55` ou `keyType: 'phone'`.
- **Chaves de celular:** no Brasil, apenas celulares (9 dígitos começando com 9) e DDDs existentes.
- Projeto independente, sem vínculo com o Banco Central do Brasil. "Pix" é marca do BCB.

## Desenvolvimento

```bash
npm install
npm test          # vitest
npm run typecheck
npm run build     # gera dist/
```

Contribuições são bem-vindas — veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE)
