import { PixError } from './errors.js'

/** Largest amount that fits in field 54 (13 characters): R$ 9.999.999.999,99. */
export const MAX_AMOUNT_IN_CENTS = 999_999_999_999

/**
 * Formats a positive amount in cents as used in field 54 (`'10.50'`).
 *
 * @throws {PixError} `INVALID_AMOUNT` when it is not a positive safe integer within range.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PixError(
      'INVALID_AMOUNT',
      `Amount in cents must be a positive integer, got ${String(cents)}.`,
      '54',
    )
  }
  if (cents > MAX_AMOUNT_IN_CENTS) {
    throw new PixError(
      'INVALID_AMOUNT',
      `Amount exceeds the 13-character limit of field 54 (max 9999999999.99).`,
      '54',
    )
  }
  const reais = Math.floor(cents / 100)
  const rest = cents % 100
  return `${reais}.${String(rest).padStart(2, '0')}`
}

/**
 * Converts an amount in reais to cents without silently rounding.
 *
 * Accepts numbers (`10.5`) and strings using `.` or `,` as decimal separator
 * (`'10.50'`, `'10,5'`, `'10'`). At most two decimal places are accepted; thousands separators
 * are not.
 *
 * @throws {PixError} `INVALID_AMOUNT`
 */
export function toCents(amount: number | string): number {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PixError('INVALID_AMOUNT', `Amount must be a positive number, got ${amount}.`, '54')
    }
    const cents = Math.round(amount * 100)
    // Tolerate binary floating point noise (0.1 + 0.2) but never round real fractions of a cent.
    if (Math.abs(cents / 100 - amount) > Number.EPSILON * Math.max(1, amount) * 8) {
      throw new PixError(
        'INVALID_AMOUNT',
        `Amount ${amount} has more than two decimal places.`,
        '54',
      )
    }
    return cents
  }
  if (typeof amount !== 'string') {
    throw new PixError('INVALID_AMOUNT', 'Amount must be a number or a string.', '54')
  }
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(amount.trim())
  if (!match) {
    throw new PixError(
      'INVALID_AMOUNT',
      `Invalid amount "${amount}". Use up to two decimal places and no thousands separator, e.g. "1234.56".`,
      '54',
    )
  }
  const reais = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const cents = reais * 100 + fraction
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PixError('INVALID_AMOUNT', `Amount must be greater than zero, got "${amount}".`, '54')
  }
  return cents
}

/**
 * Formats an amount in reais as used in field 54.
 *
 * @example formatAmount(10.5) // '10.50'
 * @example formatAmount('1234,5') // '1234.50'
 */
export function formatAmount(amount: number | string): string {
  return formatCents(toCents(amount))
}
