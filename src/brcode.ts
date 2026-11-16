import { formatCents, toCents } from './amount.js'
import { crc16Hex } from './crc16.js'
import { decodeFields, emvLength, encodeField, encodeFields, findField, type EmvField } from './emv.js'
import { PixError } from './errors.js'
import { detectPixKeyType, normalizePixKey, type PixKeyType } from './keys.js'
import { isAnsText, sanitizeText } from './text.js'

/** Globally Unique Identifier of the Pix arrangement (reverse DNS, case-insensitive). */
export const PIX_GUI = 'br.gov.bcb.pix'

/** Limits from the EMV QRCPS and the BCB "Manual de Padrões para Iniciação do Pix". */
export const LIMITS = {
  merchantName: 25,
  merchantCity: 15,
  postalCode: 10,
  txid: 25,
  url: 77,
  template: 99,
} as const

interface CommonOptions {
  /** Merchant name (field 59), up to 25 characters. Payer apps show the name registered in the DICT instead. */
  merchantName: string
  /** Merchant city (field 60), up to 15 characters. */
  merchantCity: string
  /** Postal code (field 61), e.g. a CEP. Optional. */
  postalCode?: string
  /** Merchant Category Code (field 52). Defaults to `'0000'` (not informed). */
  merchantCategoryCode?: string
  /**
   * Remove accents and characters outside printable ASCII from merchant name, city and
   * description. Defaults to `true`. When `false`, such characters cause an error instead.
   */
  sanitize?: boolean
  /** Truncate merchant name, city and description that are too long instead of throwing. Defaults to `false`. */
  truncate?: boolean
}

/** Options for a static BR Code (key-based, reusable, "QR Code estático"). */
export interface StaticPixOptions extends CommonOptions {
  /** Pix key. User-typed formats are accepted and normalized (see `validatePixKey`). */
  key: string
  /** Key type, to disambiguate an 11-digit CPF from a phone number written without `+55`. */
  keyType?: PixKeyType
  /** Amount in reais (field 54): `10.5`, `'10.50'` or `'10,50'`. Omit to let the payer type it. */
  amount?: number | string
  /** Amount in cents, as an alternative to `amount`. */
  amountInCents?: number
  /** Transaction ID (field 62-05): up to 25 letters and digits. Defaults to `'***'` (none). */
  txid?: string
  /** Free text shown to the payer ("infoAdicional", field 26-02). Shares the 99-character template with the key. */
  description?: string
  /** ISPB (8 digits) of the withdrawal service facilitator (field 26-03). Marks the BR Code as a Pix Saque. */
  fss?: string
  /** Mark the BR Code as single-use (field 01 = `'12'`). Defaults to `false` (field omitted). */
  singleUse?: boolean
  /** Pix Automático recurrence location (field 80-25), producing a composite BR Code ("QR Code composto"). */
  recurrenceUrl?: string
}

/** Options for a dynamic BR Code (URL-based, "QR Code dinâmico"), e.g. from a `cob`/`cobv` created via API Pix. */
export interface DynamicPixOptions extends CommonOptions {
  /** Location of the charge payload (field 26-25), with or without `https://`. Max 77 characters without it. */
  url: string
  /** Mark the BR Code as single-use (field 01 = `'12'`). Defaults to `true`, as in the BCB example. */
  singleUse?: boolean
  /** Pix Automático recurrence location (field 80-25), producing a composite BR Code. Must share the host with `url`. */
  recurrenceUrl?: string
}

/** Options for a composite BR Code carrying only Pix Automático recurrence parameters. */
export interface RecurrencePixOptions extends CommonOptions {
  /** Location of the recurrence parameters (field 80-25), with or without `https://`. */
  recurrenceUrl: string
  /** Transaction ID (field 62-05). Defaults to `'***'`. */
  txid?: string
}

interface ParsedPixBase {
  /**
   * `static`: key-based. `dynamic`: payment data comes from `url`.
   * `recurrence`: composite BR Code with only Pix Automático recurrence parameters.
   */
  type: 'static' | 'dynamic' | 'recurrence'
  /** Whether this is a composite BR Code ("QR Code composto"), i.e. has a `recurrenceUrl`. */
  composite: boolean
  /** Field 00, always `'01'`. */
  payloadFormatIndicator: string
  /** Field 01: `'11'` (reusable) or `'12'` (single use), when present. */
  pointOfInitiationMethod?: string
  /** Whether field 01 is `'12'`, i.e. the BR Code must not be paid more than once. */
  singleUse: boolean
  /** ID of the Pix merchant account template (usually `'26'`). */
  merchantAccountId: string
  /** Pix key (field 26-01), present in static BR Codes. */
  key?: string
  /** Type of `key`, inferred from its shape. */
  keyType?: PixKeyType
  /** "infoAdicional" (field 26-02). */
  description?: string
  /** ISPB of the withdrawal service facilitator (field 26-03, Pix Saque). */
  fss?: string
  /** Location of the charge payload (field 26-25), without protocol, present in dynamic BR Codes. */
  url?: string
  /** Location of the Pix Automático recurrence parameters (field 80-99 / 25), without protocol. */
  recurrenceUrl?: string
  /** Field 52. */
  merchantCategoryCode: string
  /** Field 53, `'986'` for BRL. */
  transactionCurrency: string
  /** Field 54 in reais. In dynamic BR Codes the payer must use the amount from the URL payload instead. */
  amount?: number
  /** Field 54 in cents. */
  amountInCents?: number
  /** Field 58, `'BR'`. */
  countryCode: string
  /** Field 59. */
  merchantName: string
  /** Field 60. */
  merchantCity: string
  /** Field 61. */
  postalCode?: string
  /** Field 62-05. `'***'` means none. */
  txid?: string
  /** Field 63, as found in the payload. */
  crc: string
  /** Every decoded field, for anything not mapped above. */
  fields: EmvField[]
}

/** A parsed static BR Code. */
export interface ParsedStaticPix extends ParsedPixBase {
  type: 'static'
  key: string
}

/** A parsed dynamic BR Code. */
export interface ParsedDynamicPix extends ParsedPixBase {
  type: 'dynamic'
  url: string
}

/** A parsed composite BR Code that only carries recurrence parameters. */
export interface ParsedRecurrencePix extends ParsedPixBase {
  type: 'recurrence'
  recurrenceUrl: string
}

/** Result of {@link parsePix}. Narrow it with `type`. */
export type ParsedPix = ParsedStaticPix | ParsedDynamicPix | ParsedRecurrencePix

/** Result of {@link safeParsePix}. */
export type SafeParsePixResult =
  | { success: true; data: ParsedPix }
  | { success: false; error: PixError }

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

function requireString(value: unknown, option: string): string {
  if (typeof value !== 'string') {
    throw new PixError('INVALID_OPTION', `Option "${option}" must be a string.`, option)
  }
  return value
}

function prepareText(
  value: unknown,
  option: string,
  maxLength: number,
  options: CommonOptions,
): string {
  const raw = requireString(value, option)
  let text = options.sanitize === false ? raw.trim() : sanitizeText(raw)
  if (!isAnsText(text)) {
    throw new PixError(
      'INVALID_FIELD',
      `Option "${option}" has characters outside printable ASCII. Remove them or enable "sanitize".`,
      option,
    )
  }
  if (text === '') {
    throw new PixError('MISSING_FIELD', `Option "${option}" is required.`, option)
  }
  if (text.length > maxLength) {
    if (!options.truncate) {
      throw new PixError(
        'FIELD_TOO_LONG',
        `Option "${option}" has ${text.length} characters; the maximum is ${maxLength}. Shorten it or enable "truncate".`,
        option,
      )
    }
    text = text.slice(0, maxLength).trimEnd()
  }
  return text
}

function prepareCommon(options: CommonOptions): Array<[string, string | undefined]> {
  if (options === null || typeof options !== 'object') {
    throw new PixError('INVALID_OPTION', 'Options must be an object.')
  }
  const mcc = options.merchantCategoryCode ?? '0000'
  if (typeof mcc !== 'string' || !/^\d{4}$/.test(mcc)) {
    throw new PixError(
      'INVALID_FIELD',
      'Option "merchantCategoryCode" must have exactly 4 digits.',
      'merchantCategoryCode',
    )
  }
  const name = prepareText(options.merchantName, 'merchantName', LIMITS.merchantName, options)
  const city = prepareText(options.merchantCity, 'merchantCity', LIMITS.merchantCity, options)
  let postalCode: string | undefined
  if (options.postalCode !== undefined) {
    postalCode = requireString(options.postalCode, 'postalCode').replace(/[\s.-]/g, '')
    if (!/^[0-9A-Za-z]{1,10}$/.test(postalCode)) {
      throw new PixError(
        'INVALID_FIELD',
        'Option "postalCode" must have 1 to 10 letters or digits.',
        'postalCode',
      )
    }
  }
  return [
    ['52', mcc],
    ['53', '986'],
    ['54', undefined], // placeholder, filled by callers to keep ascending order
    ['58', 'BR'],
    ['59', name],
    ['60', city],
    ['61', postalCode],
  ]
}

function prepareTxid(value: string | undefined): string {
  if (value === undefined) return '***'
  const txid = requireString(value, 'txid').trim()
  if (txid === '***') return txid
  if (!/^[a-zA-Z0-9]{1,25}$/.test(txid)) {
    throw new PixError(
      'INVALID_FIELD',
      'Option "txid" must have 1 to 25 letters (a-z, A-Z) or digits, or be "***".',
      'txid',
    )
  }
  return txid
}

function prepareUrl(value: unknown, option: string): string {
  const url = requireString(value, option)
    .trim()
    .replace(/^https:\/\//i, '')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    throw new PixError(
      'INVALID_FIELD',
      `Option "${option}" must be an HTTPS location; write it without the protocol prefix.`,
      option,
    )
  }
  if (!/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+(:\d{1,5})?\/[\x21-\x7e]+$/.test(url)) {
    throw new PixError(
      'INVALID_FIELD',
      `Option "${option}" must look like "pix.example.com/qr/v2/<token>".`,
      option,
    )
  }
  if (url.length > LIMITS.url) {
    throw new PixError(
      'FIELD_TOO_LONG',
      `Option "${option}" has ${url.length} characters without "https://"; the maximum is ${LIMITS.url}.`,
      option,
    )
  }
  return url
}

function hostOf(url: string): string {
  return (url.split('/')[0] as string).toLowerCase()
}

function prepareAmount(options: StaticPixOptions): string | undefined {
  if (options.amount !== undefined && options.amountInCents !== undefined) {
    throw new PixError(
      'INVALID_OPTION',
      'Pass either "amount" or "amountInCents", not both.',
      'amount',
    )
  }
  if (options.amountInCents !== undefined) return formatCents(options.amountInCents)
  if (options.amount !== undefined) return formatCents(toCents(options.amount))
  return undefined
}

function recurrenceTemplate(recurrenceUrl: string | undefined): string | undefined {
  if (recurrenceUrl === undefined) return undefined
  return encodeFields([
    ['00', PIX_GUI],
    ['25', prepareUrl(recurrenceUrl, 'recurrenceUrl')],
  ])
}

function assemble(fields: Array<[string, string | undefined]>): string {
  const body = encodeFields(fields) + '6304'
  return body + crc16Hex(body)
}

/**
 * Creates a static BR Code ("Pix copia e cola") for a Pix key.
 *
 * @example
 * createStaticPix({
 *   key: '123e4567-e12b-12d1-a456-426655440000',
 *   merchantName: 'Fulano de Tal',
 *   merchantCity: 'BRASILIA',
 * })
 * // '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'
 */
export function createStaticPix(options: StaticPixOptions): string {
  const common = prepareCommon(options)
  const key = normalizePixKey(requireString(options.key, 'key'), options.keyType)
  let fss: string | undefined
  if (options.fss !== undefined) {
    fss = requireString(options.fss, 'fss').trim()
    if (!/^\d{8}$/.test(fss)) {
      throw new PixError('INVALID_FIELD', 'Option "fss" must be an 8-digit ISPB.', 'fss')
    }
  }

  const fixedLength = 4 + PIX_GUI.length + 4 + key.length + (fss ? 12 : 0)
  let description: string | undefined
  if (options.description !== undefined && requireString(options.description, 'description').trim() !== '') {
    const available = LIMITS.template - fixedLength - 4
    if (available < 1) {
      throw new PixError(
        'FIELD_TOO_LONG',
        'There is no room left for "description" in the merchant account template.',
        'description',
      )
    }
    const text = prepareText(options.description, 'description', Number.MAX_SAFE_INTEGER, {
      ...options,
      truncate: false,
    })
    if (text.length > available) {
      if (!options.truncate) {
        throw new PixError(
          'FIELD_TOO_LONG',
          `Option "description" has ${text.length} characters, but only ${available} fit next to this key. Shorten it or enable "truncate".`,
          'description',
        )
      }
      description = text.slice(0, available).trimEnd()
    } else {
      description = text
    }
  }

  const merchantAccount = encodeFields([
    ['00', PIX_GUI],
    ['01', key],
    ['02', description],
    ['03', fss],
  ])
  if (emvLength(merchantAccount) > LIMITS.template) {
    // Unreachable with the checks above; kept as a safety net.
    throw new PixError('FIELD_TOO_LONG', 'The merchant account template exceeds 99 characters.', '26')
  }

  setAmount(common, prepareAmount(options))
  return assemble([
    ['00', '01'],
    ['01', options.singleUse ? '12' : undefined],
    ['26', merchantAccount],
    ...common,
    ['62', encodeField('05', prepareTxid(options.txid))],
    ['80', recurrenceTemplate(options.recurrenceUrl)],
  ])
}

function setAmount(common: Array<[string, string | undefined]>, amount: string | undefined): void {
  const entry = common.find(([id]) => id === '54')
  if (entry) entry[1] = amount
}

/**
 * Creates a dynamic BR Code pointing to a charge location created through the API Pix
 * of your PSP. Amount and txid come from the location payload, so they are not included
 * (field 62-05 is `'***'`).
 *
 * @example
 * createDynamicPix({
 *   url: 'https://pix.example.com/8b3da2f39a4140d1a91abd93113bd441',
 *   merchantName: 'Fulano de Tal',
 *   merchantCity: 'BRASILIA',
 * })
 */
export function createDynamicPix(options: DynamicPixOptions): string {
  const common = prepareCommon(options)
  const url = prepareUrl(options.url, 'url')
  if (options.recurrenceUrl !== undefined) {
    const recurrenceUrl = prepareUrl(options.recurrenceUrl, 'recurrenceUrl')
    if (hostOf(recurrenceUrl) !== hostOf(url)) {
      throw new PixError(
        'INVALID_FIELD',
        'Options "url" and "recurrenceUrl" must have the same host (fqdnPspRecebedor).',
        'recurrenceUrl',
      )
    }
  }
  return assemble([
    ['00', '01'],
    ['01', options.singleUse === false ? undefined : '12'],
    [
      '26',
      encodeFields([
        ['00', PIX_GUI],
        ['25', url],
      ]),
    ],
    ...common,
    ['62', encodeField('05', '***')],
    ['80', recurrenceTemplate(options.recurrenceUrl)],
  ])
}

/**
 * Creates a composite BR Code ("QR Code composto") with only Pix Automático recurrence
 * parameters: the merchant account template carries just the Pix GUI.
 */
export function createRecurrencePix(options: RecurrencePixOptions): string {
  const common = prepareCommon(options)
  return assemble([
    ['00', '01'],
    ['26', encodeField('00', PIX_GUI)],
    ...common,
    ['62', encodeField('05', prepareTxid(options.txid))],
    ['80', recurrenceTemplate(requireString(options.recurrenceUrl, 'recurrenceUrl'))],
  ])
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

function isPixTemplate(field: EmvField): boolean {
  const gui = findField(field.children, '00')
  return gui !== undefined && gui.value.toLowerCase() === PIX_GUI
}

function required(fields: EmvField[], id: string, name: string): string {
  const field = findField(fields, id)
  if (!field) throw new PixError('MISSING_FIELD', `Mandatory field ${id} (${name}) is missing.`, id)
  return field.value
}

/**
 * Parses and validates a Pix BR Code ("Pix copia e cola" or QR code content).
 *
 * Checks the structure, the CRC16 and the mandatory fields. The key is reported as found;
 * call `validatePixKey(result.key)` if you also want to verify it.
 *
 * @throws {PixError} with code `INVALID_FORMAT`, `INVALID_CRC`, `NOT_PIX`, `MISSING_FIELD` or `INVALID_FIELD`.
 */
export function parsePix(code: string): ParsedPix {
  if (typeof code !== 'string') {
    throw new PixError('INVALID_FORMAT', 'The BR Code must be a string.')
  }
  const payload = code.trim()
  if (payload === '') throw new PixError('INVALID_FORMAT', 'The BR Code is empty.')

  const fields = decodeFields(payload)
  const first = fields[0]
  if (!first || first.id !== '00') {
    throw new PixError('INVALID_FORMAT', 'A BR Code must start with field 00 (Payload Format Indicator).', '00')
  }
  if (first.value !== '01') {
    throw new PixError('INVALID_FIELD', `Unsupported Payload Format Indicator "${first.value}".`, '00')
  }
  const last = fields[fields.length - 1] as EmvField
  if (last.id !== '63') {
    throw new PixError('INVALID_FORMAT', 'A BR Code must end with field 63 (CRC16).', '63')
  }
  if (!/^[0-9A-Fa-f]{4}$/.test(last.value)) {
    throw new PixError('INVALID_FORMAT', 'Field 63 (CRC16) must have 4 hexadecimal digits.', '63')
  }
  const expected = crc16Hex(payload.slice(0, -4))
  if (last.value.toUpperCase() !== expected) {
    throw new PixError(
      'INVALID_CRC',
      `Invalid CRC16: the payload says ${last.value}, but its content hashes to ${expected}.`,
      '63',
    )
  }

  const account = fields.find((f) => Number(f.id) >= 26 && Number(f.id) <= 51 && isPixTemplate(f))
  if (!account) {
    throw new PixError('NOT_PIX', 'No Pix merchant account (GUI br.gov.bcb.pix) found in fields 26-51.')
  }
  const recurrence = fields.find((f) => Number(f.id) >= 80 && Number(f.id) <= 99 && isPixTemplate(f))
  const recurrenceUrl = findField(recurrence?.children, '25')?.value

  const key = findField(account.children, '01')?.value
  const url = findField(account.children, '25')?.value
  const description = findField(account.children, '02')?.value
  const fss = findField(account.children, '03')?.value

  let type: ParsedPix['type']
  if (url !== undefined) type = 'dynamic'
  else if (key !== undefined) type = 'static'
  else if (recurrenceUrl !== undefined) type = 'recurrence'
  else {
    throw new PixError(
      'MISSING_FIELD',
      `The Pix merchant account (field ${account.id}) has neither a key (01) nor a URL (25).`,
      account.id,
    )
  }

  const pointOfInitiationMethod = findField(fields, '01')?.value
  if (pointOfInitiationMethod !== undefined && !/^1[12]$/.test(pointOfInitiationMethod)) {
    throw new PixError(
      'INVALID_FIELD',
      `Invalid Point of Initiation Method "${pointOfInitiationMethod}" (expected 11 or 12).`,
      '01',
    )
  }

  const result: ParsedPixBase = {
    type,
    composite: recurrenceUrl !== undefined,
    payloadFormatIndicator: first.value,
    singleUse: pointOfInitiationMethod === '12',
    merchantAccountId: account.id,
    merchantCategoryCode: required(fields, '52', 'Merchant Category Code'),
    transactionCurrency: required(fields, '53', 'Transaction Currency'),
    countryCode: required(fields, '58', 'Country Code'),
    merchantName: required(fields, '59', 'Merchant Name'),
    merchantCity: required(fields, '60', 'Merchant City'),
    crc: last.value,
    fields,
  }
  if (pointOfInitiationMethod !== undefined) result.pointOfInitiationMethod = pointOfInitiationMethod
  if (key !== undefined) {
    result.key = key
    const keyType = detectPixKeyType(key)
    if (keyType) result.keyType = keyType
  }
  if (description !== undefined) result.description = description
  if (fss !== undefined) result.fss = fss
  if (url !== undefined) result.url = url
  if (recurrenceUrl !== undefined) result.recurrenceUrl = recurrenceUrl

  const amount = findField(fields, '54')?.value
  if (amount !== undefined) {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || amount.length > 13) {
      throw new PixError('INVALID_FIELD', `Invalid Transaction Amount "${amount}".`, '54')
    }
    const [reais, fraction = ''] = amount.split('.')
    result.amountInCents = Number(reais) * 100 + Number(fraction.padEnd(2, '0'))
    result.amount = result.amountInCents / 100
  }
  const postalCode = findField(fields, '61')?.value
  if (postalCode !== undefined) result.postalCode = postalCode
  const additional = findField(fields, '62')
  const txid = findField(additional?.children, '05')?.value
  if (txid !== undefined) result.txid = txid

  return result as ParsedPix
}

/** Like {@link parsePix}, but returns `{ success: false, error }` instead of throwing. */
export function safeParsePix(code: string): SafeParsePixResult {
  try {
    return { success: true, data: parsePix(code) }
  } catch (error) {
    if (error instanceof PixError) return { success: false, error }
    throw error
  }
}

/** Whether the string is a valid Pix BR Code (structure, CRC16 and mandatory fields). */
export function isValidPix(code: string): boolean {
  return safeParsePix(code).success
}

/** Adds the `https://` prefix to a location found in a BR Code (`url` or `recurrenceUrl`). */
export function toHttpsUrl(location: string): string {
  return /^https:\/\//i.test(location) ? location : `https://${location}`
}
