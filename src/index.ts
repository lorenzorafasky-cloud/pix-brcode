export {
  createDynamicPix,
  createRecurrencePix,
  createStaticPix,
  isValidPix,
  LIMITS,
  parsePix,
  PIX_GUI,
  safeParsePix,
  toHttpsUrl,
} from './brcode.js'
export type {
  DynamicPixOptions,
  ParsedDynamicPix,
  ParsedPix,
  ParsedRecurrencePix,
  ParsedStaticPix,
  RecurrencePixOptions,
  SafeParsePixResult,
  StaticPixOptions,
} from './brcode.js'

export {
  detectPixKeyType,
  formatPixKey,
  isValidCNPJ,
  isValidCPF,
  isValidPixKey,
  MAX_EMAIL_KEY_LENGTH,
  normalizePixKey,
  validatePixKey,
} from './keys.js'
export type { PixKeyType, PixKeyValidation } from './keys.js'

export { encodeQRCode, renderSVG, renderText, toQRCodeDataURL, toQRCodeSVG } from './qrcode.js'
export type { ErrorCorrectionLevel, QRCode, QRCodeOptions, QRCodeSVGOptions } from './qrcode.js'

export { formatAmount, formatCents, MAX_AMOUNT_IN_CENTS, toCents } from './amount.js'
export { crc16, crc16Hex } from './crc16.js'
export { decodeFields, encodeField, encodeFields } from './emv.js'
export type { EmvField } from './emv.js'
export { PixError } from './errors.js'
export type { PixErrorCode } from './errors.js'
export { sanitizeText } from './text.js'
