/**
 * Encodes a string as UTF-8 bytes. Lone surrogates become U+FFFD, like `TextEncoder`.
 * Implemented here so the library runs anywhere without relying on DOM or Node typings.
 */
export function utf8Encode(input: string): Uint8Array {
  const out: number[] = []
  for (const char of input) {
    let cp = char.codePointAt(0) as number
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd
    if (cp < 0x80) {
      out.push(cp)
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return Uint8Array.from(out)
}
