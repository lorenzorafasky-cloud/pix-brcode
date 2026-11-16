import { describe, expect, it } from 'vitest'
import { HELP, runCli } from '../src/cli/run.js'
import { parsePix } from '../src/index.js'
import { BCB_EVP, BCB_STATIC, BCB_URL } from './vectors.js'

function run(...argv: string[]): { code: number; stdout: string; stderr: string } {
  let stdout = ''
  let stderr = ''
  const code = runCli(argv, {
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
  })
  return { code, stdout, stderr }
}

describe('cli', () => {
  it('prints help', () => {
    expect(run('--help')).toEqual({ code: 0, stdout: HELP, stderr: '' })
    expect(run().code).toBe(1)
  })

  it('parses a BR Code', () => {
    const result = run('parse', BCB_STATIC)
    expect(result.code).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json).toMatchObject({ type: 'static', key: BCB_EVP, merchantName: 'Fulano de Tal' })
    expect(json.fields).toBeUndefined()
    expect(JSON.parse(run('parse', BCB_STATIC, '--fields').stdout).fields).toHaveLength(9)
  })

  it('accepts an unquoted BR Code split on spaces', () => {
    const result = run('parse', ...BCB_STATIC.split(' '))
    expect(JSON.parse(result.stdout).merchantName).toBe('Fulano de Tal')
  })

  it('creates static and dynamic BR Codes', () => {
    const created = run('create', 'static', '--key', BCB_EVP, '--name', 'Fulano de Tal', '--city', 'BRASILIA')
    expect(created).toEqual({ code: 0, stdout: `${BCB_STATIC}\n`, stderr: '' })

    const withAmount = run(
      'create', 'static', '--key', '(61) 91234-5678', '--key-type', 'phone',
      '--name', 'Fulano', '--city', 'Brasilia', '--amount', '10,50', '--txid', 'ABC123',
    )
    expect(parsePix(withAmount.stdout)).toMatchObject({ key: '+5561912345678', amount: 10.5, txid: 'ABC123' })

    const dynamic = run('create', 'dynamic', '--url', BCB_URL, '--name', 'Fulano de Tal', '--city', 'BRASILIA')
    expect(parsePix(dynamic.stdout).type).toBe('dynamic')
  })

  it('prints QR codes', () => {
    const withQr = run('create', 'static', '--key', BCB_EVP, '--name', 'Fulano de Tal', '--city', 'BRASILIA', '--qr')
    expect(withQr.stdout.startsWith(`${BCB_STATIC}\n\n`)).toBe(true)
    expect(withQr.stdout).toContain('█')
    expect(run('qr', BCB_STATIC).stdout).toContain('▀')
    expect(run('qr', BCB_STATIC, '--svg').stdout.startsWith('<svg')).toBe(true)
  })

  it('validates keys', () => {
    const ok = run('key', '529.982.247-25')
    expect(JSON.parse(ok.stdout)).toEqual({ valid: true, type: 'cpf', key: '52998224725', formatted: '529.982.247-25' })
    const bad = run('key', '123.456.789-00')
    expect(bad.code).toBe(1)
    expect(bad.stderr).toMatch(/check digits/)
  })

  it('reports errors with exit code 1', () => {
    expect(run('parse', 'garbage')).toMatchObject({ code: 1, stderr: expect.stringMatching(/INVALID_FORMAT/) })
    expect(run('qr', 'garbage').code).toBe(1)
    expect(run('create', 'static', '--name', 'x', '--city', 'y').stderr).toMatch(/INVALID_KEY/)
    expect(run('create', 'other').code).toBe(1)
    expect(run('frobnicate').stderr).toMatch(/Unknown command/)
    expect(run('parse', '--nope').stderr).toMatch(/Unknown option/)
    expect(run('key', 'x', '--type', 'pix').stderr).toMatch(/Unknown key type/)
  })
})
