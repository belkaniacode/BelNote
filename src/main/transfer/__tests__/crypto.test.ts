import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, BadPassphraseError, CorruptFileError } from '../crypto'

describe('transfer/crypto', () => {
  const pass = 'correct horse battery staple'
  const payload = Buffer.from(JSON.stringify({ hello: 'мир', notes: [1, 2, 3] }), 'utf8')

  it('round-trips: decrypt(encrypt(x)) === x', () => {
    const file = encrypt(payload, pass)
    const out = decrypt(file, pass)
    expect(out.equals(payload)).toBe(true)
  })

  it('produces a BLNT-magic envelope larger than the plaintext', () => {
    const file = encrypt(payload, pass)
    expect(file.subarray(0, 4).toString('ascii')).toBe('BLNT')
    expect(file.length).toBeGreaterThan(payload.length)
  })

  it('uses a fresh salt/iv each time (ciphertext differs for identical input)', () => {
    const a = encrypt(payload, pass)
    const b = encrypt(payload, pass)
    expect(a.equals(b)).toBe(false)
  })

  it('throws BadPassphraseError on the wrong passphrase', () => {
    const file = encrypt(payload, pass)
    expect(() => decrypt(file, 'wrong passphrase')).toThrow(BadPassphraseError)
  })

  it('throws BadPassphraseError when a ciphertext byte is flipped (GCM auth fails)', () => {
    const file = encrypt(payload, pass)
    file[file.length - 1] ^= 0xff // tamper with the last ciphertext byte
    expect(() => decrypt(file, pass)).toThrow(BadPassphraseError)
  })

  it('throws CorruptFileError on bad magic', () => {
    const file = encrypt(payload, pass)
    file[0] = 0x00 // break the "BLNT" magic
    expect(() => decrypt(file, pass)).toThrow(CorruptFileError)
  })

  it('throws CorruptFileError on a truncated file', () => {
    const file = encrypt(payload, pass)
    expect(() => decrypt(file.subarray(0, 10), pass)).toThrow(CorruptFileError)
  })
})
