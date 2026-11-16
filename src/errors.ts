/**
 * Machine-readable error codes thrown by this library.
 *
 * - `INVALID_FORMAT`: the input is not a well-formed EMV/BR Code payload.
 * - `INVALID_CRC`: the CRC16 checksum (field 63) does not match the payload.
 * - `NOT_PIX`: the payload is a valid EMV QR code but has no Pix merchant account template.
 * - `MISSING_FIELD`: a mandatory field is absent.
 * - `INVALID_FIELD`: a field has an invalid value.
 * - `FIELD_TOO_LONG`: a value does not fit in its field.
 * - `INVALID_KEY`: the Pix key is not valid.
 * - `INVALID_AMOUNT`: the transaction amount is not valid.
 * - `INVALID_OPTION`: an option passed to a function is not valid.
 * - `DATA_TOO_LONG`: the data does not fit in a QR code with the given options.
 */
export type PixErrorCode =
  | 'INVALID_FORMAT'
  | 'INVALID_CRC'
  | 'NOT_PIX'
  | 'MISSING_FIELD'
  | 'INVALID_FIELD'
  | 'FIELD_TOO_LONG'
  | 'INVALID_KEY'
  | 'INVALID_AMOUNT'
  | 'INVALID_OPTION'
  | 'DATA_TOO_LONG'

/** Error thrown by every function of this library. Check `code` to handle it programmatically. */
export class PixError extends Error {
  readonly code: PixErrorCode
  /** EMV field ID or option name related to the error, when there is one. */
  readonly field: string | undefined

  constructor(code: PixErrorCode, message: string, field?: string) {
    super(message)
    this.name = 'PixError'
    this.code = code
    this.field = field
  }
}
