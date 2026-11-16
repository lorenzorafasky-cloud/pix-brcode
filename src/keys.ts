import { PixError } from './errors.js'

/** The five Pix key types defined by the DICT. `evp` is the random key ("chave aleatória"). */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp'

/** Result of {@link validatePixKey}. On success, `key` is the canonical form used in BR Codes. */
export type PixKeyValidation =
  | { valid: true; type: PixKeyType; key: string }
  | { valid: false; type: PixKeyType | undefined; reason: string }

/** Maximum length of an e-mail Pix key (DICT). */
export const MAX_EMAIL_KEY_LENGTH = 77

const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/
const E164_PATTERN = /^\+[1-9]\d{1,14}$/
const CNPJ_PATTERN = /^[0-9A-Z]{12}\d{2}$/

/** Valid Brazilian area codes (DDD). */
const BRAZIL_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function stripDocumentPunctuation(value: string): string {
  return value.trim().replace(/[.\-/\s]/g, '')
}

/**
 * Validates a CPF (11 digits, with or without `.`/`-` punctuation), including check digits.
 *
 * @example isValidCPF('529.982.247-25') // true
 */
export function isValidCPF(value: string): boolean {
  const cpf = stripDocumentPunctuation(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digits = Array.from(cpf, Number)
  for (const length of [9, 10]) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += (digits[i] as number) * (length + 1 - i)
    const check = ((sum * 10) % 11) % 10
    if (check !== digits[length]) return false
  }
  return true
}

/**
 * Validates a CNPJ, numeric (`11.222.333/0001-81`) or alphanumeric (`12.ABC.345/01DE-35`,
 * in use since July 2026), including check digits. Letters are case-insensitive.
 */
export function isValidCNPJ(value: string): boolean {
  const cnpj = stripDocumentPunctuation(value).toUpperCase()
  if (!CNPJ_PATTERN.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  // Each character is worth its ASCII code minus 48, so digits keep their value and A = 17.
  const values = Array.from(cnpj, (c) => c.charCodeAt(0) - 48)
  for (const length of [12, 13]) {
    let sum = 0
    for (let i = 0; i < length; i++) {
      const weight = ((length - 1 - i) % 8) + 2
      sum += (values[i] as number) * weight
    }
    const remainder = sum % 11
    const check = remainder < 2 ? 0 : 11 - remainder
    if (check !== values[length]) return false
  }
  return true
}

/**
 * Detects the type of a key already in canonical form (as found inside a BR Code), looking only
 * at its shape. Use {@link validatePixKey} to also verify check digits and normalize user input.
 */
export function detectPixKeyType(key: string): PixKeyType | undefined {
  if (EVP_PATTERN.test(key)) return 'evp'
  if (key.includes('@')) return 'email'
  if (key.startsWith('+')) return 'phone'
  if (/^\d{11}$/.test(key)) return 'cpf'
  if (CNPJ_PATTERN.test(key)) return 'cnpj'
  return undefined
}

function normalizeCPF(input: string): PixKeyValidation {
  const cpf = stripDocumentPunctuation(input)
  if (!/^\d{11}$/.test(cpf)) {
    return { valid: false, type: 'cpf', reason: 'A CPF key must have 11 digits.' }
  }
  if (!isValidCPF(cpf)) {
    return { valid: false, type: 'cpf', reason: 'Invalid CPF check digits.' }
  }
  return { valid: true, type: 'cpf', key: cpf }
}

function normalizeCNPJ(input: string): PixKeyValidation {
  const cnpj = stripDocumentPunctuation(input).toUpperCase()
  if (!CNPJ_PATTERN.test(cnpj)) {
    return {
      valid: false,
      type: 'cnpj',
      reason: 'A CNPJ key must have 14 characters: 12 letters or digits followed by 2 digits.',
    }
  }
  if (!isValidCNPJ(cnpj)) {
    return { valid: false, type: 'cnpj', reason: 'Invalid CNPJ check digits.' }
  }
  return { valid: true, type: 'cnpj', key: cnpj }
}

function normalizeEmail(input: string): PixKeyValidation {
  const email = input.trim().toLowerCase()
  if (email.length > MAX_EMAIL_KEY_LENGTH) {
    return {
      valid: false,
      type: 'email',
      reason: `An e-mail key can have at most ${MAX_EMAIL_KEY_LENGTH} characters.`,
    }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { valid: false, type: 'email', reason: 'Invalid e-mail address.' }
  }
  return { valid: true, type: 'email', key: email }
}

function normalizePhone(input: string): PixKeyValidation {
  const trimmed = input.trim()
  let phone: string
  if (trimmed.startsWith('+')) {
    phone = '+' + onlyDigits(trimmed)
  } else {
    // Without a country code, assume a Brazilian number: DDD + 8 or 9 digits, or 55 + DDD + number.
    const digits = onlyDigits(trimmed)
    phone = (digits.length >= 12 && digits.startsWith('55') ? '+' : '+55') + digits
  }
  if (!E164_PATTERN.test(phone)) {
    return {
      valid: false,
      type: 'phone',
      reason: 'A phone key must be in international format, e.g. +5561912345678.',
    }
  }
  if (phone.startsWith('+55')) {
    const national = phone.slice(3)
    if (!/^\d{2}9\d{8}$/.test(national)) {
      return {
        valid: false,
        type: 'phone',
        reason:
          'A Brazilian phone key must be a mobile number: +55, a 2-digit area code and 9 digits starting with 9.',
      }
    }
    if (!BRAZIL_AREA_CODES.has(Number(national.slice(0, 2)))) {
      return {
        valid: false,
        type: 'phone',
        reason: `Invalid Brazilian area code (DDD) ${national.slice(0, 2)}.`,
      }
    }
  }
  return { valid: true, type: 'phone', key: phone }
}

function normalizeEvp(input: string): PixKeyValidation {
  const evp = input.trim().toLowerCase()
  if (!EVP_PATTERN.test(evp)) {
    return {
      valid: false,
      type: 'evp',
      reason: 'A random key (EVP) must be a UUID such as 123e4567-e12b-12d1-a456-426655440000.',
    }
  }
  return { valid: true, type: 'evp', key: evp }
}

const NORMALIZERS: Record<PixKeyType, (input: string) => PixKeyValidation> = {
  cpf: normalizeCPF,
  cnpj: normalizeCNPJ,
  email: normalizeEmail,
  phone: normalizePhone,
  evp: normalizeEvp,
}

/**
 * Validates a Pix key and returns its canonical form (the format the DICT and BR Codes use).
 *
 * Accepts user-typed input: CPF/CNPJ with punctuation, e-mail in any case, phone with spaces,
 * dashes and parentheses. Without `type`, the type is inferred; because an 11-digit number may
 * be either a CPF or a phone number without country code, it is treated as a CPF — pass
 * `type: 'phone'` (or include `+55`) for phone numbers.
 *
 * @example validatePixKey('529.982.247-25') // { valid: true, type: 'cpf', key: '52998224725' }
 * @example validatePixKey('(61) 91234-5678', 'phone') // { valid: true, type: 'phone', key: '+5561912345678' }
 */
export function validatePixKey(input: string, type?: PixKeyType): PixKeyValidation {
  if (typeof input !== 'string' || input.trim() === '') {
    return { valid: false, type, reason: 'The Pix key is empty.' }
  }
  if (type !== undefined) {
    const normalize = NORMALIZERS[type]
    if (!normalize) return { valid: false, type: undefined, reason: `Unknown key type "${type}".` }
    return normalize(input)
  }
  const trimmed = input.trim()
  if (trimmed.includes('@')) return normalizeEmail(trimmed)
  if (EVP_PATTERN.test(trimmed.toLowerCase())) return normalizeEvp(trimmed)
  if (trimmed.startsWith('+')) return normalizePhone(trimmed)
  const document = stripDocumentPunctuation(trimmed)
  if (/^\d{11}$/.test(document)) {
    const result = normalizeCPF(document)
    if (!result.valid) {
      result.reason += ' If this is a phone number, add the country code (+55) or pass type "phone".'
    }
    return result
  }
  if (/^[0-9A-Za-z]{12}\d{2}$/.test(document)) return normalizeCNPJ(document)
  if (/^[\d\s().-]+$/.test(trimmed) && onlyDigits(trimmed).length >= 10) {
    return normalizePhone(trimmed)
  }
  return { valid: false, type: undefined, reason: 'Unrecognized Pix key format.' }
}

/** Whether the input is a valid Pix key (optionally of the given type). */
export function isValidPixKey(input: string, type?: PixKeyType): boolean {
  return validatePixKey(input, type).valid
}

/**
 * Returns the canonical form of a Pix key.
 *
 * @throws {PixError} `INVALID_KEY` with the reason when the key is not valid.
 */
export function normalizePixKey(input: string, type?: PixKeyType): string {
  const result = validatePixKey(input, type)
  if (!result.valid) throw new PixError('INVALID_KEY', result.reason, 'key')
  return result.key
}

/**
 * Formats a canonical key for display: CPF `529.982.247-25`, CNPJ `11.222.333/0001-81`,
 * Brazilian phone `+55 (61) 91234-5678`. Other keys are returned unchanged.
 */
export function formatPixKey(key: string, type: PixKeyType | undefined = detectPixKeyType(key)): string {
  if (type === 'cpf' && /^\d{11}$/.test(key)) {
    return key.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  if (type === 'cnpj' && CNPJ_PATTERN.test(key)) {
    return key.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
  }
  if (type === 'phone' && /^\+55\d{11}$/.test(key)) {
    return key.replace(/^\+55(\d{2})(\d{5})(\d{4})$/, '+55 ($1) $2-$3')
  }
  return key
}
