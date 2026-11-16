import { PixError } from './errors.js'

/** A decoded EMV data object (ID + length + value). Templates also carry their decoded `children`. */
export interface EmvField {
  /** Two-digit field ID, e.g. `'26'`. */
  id: string
  /** Raw value. For templates this is the encoded children. */
  value: string
  /** Decoded sub-fields, present only for templates (IDs 26-51, 62, 64 and 80-99). */
  children?: EmvField[]
}

const ID_PATTERN = /^\d{2}$/

/** Number of characters as counted by the EMV length indicator (Unicode code points). */
export function emvLength(value: string): number {
  let count = 0
  for (const _ of value) count++
  return count
}

/**
 * Encodes one EMV data object: two-digit ID, two-digit length and value.
 *
 * @example encodeField('59', 'Fulano de Tal') // '5913Fulano de Tal'
 */
export function encodeField(id: string, value: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new PixError('INVALID_OPTION', `EMV field ID must have two digits, got "${id}".`, id)
  }
  const length = emvLength(value)
  if (length === 0) {
    throw new PixError('INVALID_FIELD', `EMV field ${id} cannot be empty.`, id)
  }
  if (length > 99) {
    throw new PixError(
      'FIELD_TOO_LONG',
      `EMV field ${id} has ${length} characters; the maximum is 99.`,
      id,
    )
  }
  return id + String(length).padStart(2, '0') + value
}

/** Encodes several data objects, skipping entries whose value is `undefined`. */
export function encodeFields(fields: ReadonlyArray<readonly [string, string | undefined]>): string {
  let out = ''
  for (const [id, value] of fields) {
    if (value !== undefined) out += encodeField(id, value)
  }
  return out
}

/** Whether data objects with this ID are templates (contain nested data objects). */
export function isTemplateId(id: string): boolean {
  const n = Number(id)
  return (n >= 26 && n <= 51) || n === 62 || n === 64 || (n >= 80 && n <= 99)
}

/**
 * Decodes a sequence of EMV data objects. Templates are decoded recursively when their
 * content is itself a valid sequence of data objects.
 *
 * @throws {PixError} `INVALID_FORMAT` when the input is not a well-formed sequence.
 */
export function decodeFields(input: string): EmvField[] {
  return decodeChars(Array.from(input), 0, true)
}

function decodeChars(chars: string[], depth: number, strict: true): EmvField[]
function decodeChars(chars: string[], depth: number, strict: false): EmvField[] | undefined
function decodeChars(chars: string[], depth: number, strict: boolean): EmvField[] | undefined {
  const fields: EmvField[] = []
  let pos = 0
  while (pos < chars.length) {
    if (pos + 4 > chars.length) {
      if (!strict) return undefined
      throw new PixError('INVALID_FORMAT', `Truncated EMV data object at position ${pos}.`)
    }
    const id = chars.slice(pos, pos + 2).join('')
    const lengthText = chars.slice(pos + 2, pos + 4).join('')
    if (!ID_PATTERN.test(id) || !ID_PATTERN.test(lengthText)) {
      if (!strict) return undefined
      throw new PixError(
        'INVALID_FORMAT',
        `Invalid EMV data object header "${id}${lengthText}" at position ${pos}.`,
      )
    }
    const length = Number(lengthText)
    const start = pos + 4
    const end = start + length
    if (length === 0 || end > chars.length) {
      if (!strict) return undefined
      throw new PixError(
        'INVALID_FORMAT',
        `EMV field ${id} at position ${pos} declares length ${length}, but ${
          chars.length - start
        } characters remain.`,
        id,
      )
    }
    const valueChars = chars.slice(start, end)
    const field: EmvField = { id, value: valueChars.join('') }
    if (depth === 0 && isTemplateId(id)) {
      const children = decodeChars(valueChars, depth + 1, false)
      if (children) field.children = children
    }
    fields.push(field)
    pos = end
  }
  return fields
}

/** Returns the first field with the given ID. */
export function findField(fields: readonly EmvField[] | undefined, id: string): EmvField | undefined {
  return fields?.find((f) => f.id === id)
}
