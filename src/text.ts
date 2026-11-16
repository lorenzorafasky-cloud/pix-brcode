/**
 * Converts free text to the EMV "ans" character set (printable ASCII, 0x20-0x7E):
 * removes accents (`São João` → `Sao Joao`), drops any other character outside the set,
 * collapses repeated spaces and trims.
 *
 * Merchant name, merchant city and `infoAdicional` are passed through this function by default,
 * because many payer apps reject or garble non-ASCII text.
 */
export function sanitizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Whether every character is printable ASCII (the EMV "ans" set). */
export function isAnsText(input: string): boolean {
  return /^[\x20-\x7e]*$/.test(input)
}
