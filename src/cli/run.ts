import { parseArgs } from 'node:util'
import { createDynamicPix, createStaticPix, parsePix } from '../brcode.js'
import { PixError } from '../errors.js'
import { formatPixKey, validatePixKey, type PixKeyType } from '../keys.js'
import { encodeQRCode, renderText, toQRCodeSVG } from '../qrcode.js'

export interface CliIO {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const HELP = `pix-brcode — Pix BR Code ("Pix copia e cola") toolkit

Usage:
  pix-brcode parse <code> [--fields]        Decode and validate a BR Code, print JSON
  pix-brcode qr <code> [--svg]              Print a BR Code as a QR code (terminal or SVG)
  pix-brcode key <key> [--type <type>]      Validate and normalize a Pix key
  pix-brcode create static  --key <key> --name <name> --city <city>
                            [--amount <reais>] [--txid <id>] [--description <text>]
                            [--key-type cpf|cnpj|email|phone|evp] [--qr | --svg]
  pix-brcode create dynamic --url <location> --name <name> --city <city> [--qr | --svg]

When <code> is omitted, it is read from standard input.

Examples:
  pix-brcode create static --key fulano@example.com --name "Fulano de Tal" --city Brasilia --amount 10.50 --qr
  pix-brcode parse "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"
`

const KEY_TYPES: readonly PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'evp']

function parseKeyType(value: string | undefined): PixKeyType | undefined {
  if (value === undefined) return undefined
  if (!(KEY_TYPES as readonly string[]).includes(value)) {
    throw new PixError('INVALID_OPTION', `Unknown key type "${value}". Use one of: ${KEY_TYPES.join(', ')}.`)
  }
  return value as PixKeyType
}

function printCode(code: string, values: { qr?: boolean; svg?: boolean }, io: CliIO): void {
  if (values.svg) {
    io.stdout(toQRCodeSVG(code) + '\n')
    return
  }
  io.stdout(code + '\n')
  if (values.qr) io.stdout('\n' + renderText(encodeQRCode(code)) + '\n')
}

/**
 * Runs the command line interface. Returns the process exit code.
 * Positional arguments after the command are joined with spaces, so unquoted BR Codes
 * containing single spaces (e.g. in the merchant name) still work.
 */
export function runCli(argv: readonly string[], io: CliIO): number {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        fields: { type: 'boolean' },
        svg: { type: 'boolean' },
        qr: { type: 'boolean' },
        type: { type: 'string' },
        key: { type: 'string' },
        'key-type': { type: 'string' },
        url: { type: 'string' },
        name: { type: 'string' },
        city: { type: 'string' },
        amount: { type: 'string' },
        txid: { type: 'string' },
        description: { type: 'string' },
      },
    })
    const [command, ...args] = positionals
    if (values.help || command === undefined || command === 'help') {
      io.stdout(HELP)
      return command === undefined && !values.help ? 1 : 0
    }

    switch (command) {
      case 'parse': {
        const parsed = parsePix(args.join(' '))
        const output: Record<string, unknown> = { ...parsed }
        if (!values.fields) delete output.fields
        io.stdout(JSON.stringify(output, null, 2) + '\n')
        return 0
      }
      case 'qr': {
        const code = args.join(' ').trim()
        parsePix(code) // refuse to render something that is not a valid BR Code
        io.stdout((values.svg ? toQRCodeSVG(code) : renderText(encodeQRCode(code))) + '\n')
        return 0
      }
      case 'key': {
        const result = validatePixKey(args.join(' '), parseKeyType(values.type))
        if (!result.valid) {
          io.stderr(`Invalid Pix key: ${result.reason}\n`)
          return 1
        }
        io.stdout(
          JSON.stringify({ ...result, formatted: formatPixKey(result.key, result.type) }, null, 2) + '\n',
        )
        return 0
      }
      case 'create': {
        const [kind] = args
        const merchant = { merchantName: values.name ?? '', merchantCity: values.city ?? '' }
        let code: string
        if (kind === 'static') {
          code = createStaticPix({
            ...merchant,
            key: values.key ?? '',
            keyType: parseKeyType(values['key-type']),
            amount: values.amount,
            txid: values.txid,
            description: values.description,
          })
        } else if (kind === 'dynamic') {
          code = createDynamicPix({ ...merchant, url: values.url ?? '' })
        } else {
          io.stderr('Use "create static" or "create dynamic". Run with --help for details.\n')
          return 1
        }
        printCode(code, { qr: values.qr ?? false, svg: values.svg ?? false }, io)
        return 0
      }
      default:
        io.stderr(`Unknown command "${command}". Run with --help for usage.\n`)
        return 1
    }
  } catch (error) {
    if (error instanceof PixError) {
      io.stderr(`Error (${error.code}): ${error.message}\n`)
      return 1
    }
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')) {
      io.stderr(`${error.message}\nRun with --help for usage.\n`)
      return 1
    }
    throw error
  }
}
