import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto'

/**
 * Passphrase-based encryption for BelNote data exports.
 *
 * Design (authenticated, tamper-proof, best-practice):
 *  - KDF:    scrypt (memory-hard) derives a 32-byte key from the passphrase + a random salt.
 *  - Cipher: AES-256-GCM — provides confidentiality AND integrity. A wrong passphrase or any
 *            flipped byte makes the GCM auth tag verification fail on decrypt, so the file
 *            cannot be read or silently altered without the passphrase.
 *  - Nonces: fresh random salt (16B) + IV (12B) per export.
 *
 * The whole thing is written to a single binary `.blnt` file as a self-describing envelope,
 * so the KDF params travel with the file (forward-compatible if we ever raise them):
 *
 *   magic "BLNT" (4) | formatVersion (1) | kdfId (1) |
 *   N (4 BE) | r (4 BE) | p (4 BE) | salt (16) | iv (12) | authTag (16) | ciphertext (rest)
 *
 * SECURITY: never log the passphrase or the derived key. Callers log sizes/counts only.
 */

const MAGIC = Buffer.from('BLNT', 'ascii')
const FORMAT_VERSION = 1
const KDF_SCRYPT = 1

// scrypt cost parameters. N must be a power of two; N=32768 (2^15) with r=8 is a solid
// interactive-desktop default. keyLen=32 → AES-256. maxmem is raised to fit N,r,p
// (rough requirement ≈ 128 * N * r bytes, plus headroom).
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SCRYPT_MAXMEM = 256 * SCRYPT_N * SCRYPT_R // ~64 MiB headroom over the 128*N*r requirement

const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
// magic(4) + version(1) + kdfId(1) + N(4) + r(4) + p(4) + salt + iv + tag
const HEADER_LEN = 4 + 1 + 1 + 4 + 4 + 4 + SALT_LEN + IV_LEN + TAG_LEN

/** Thrown when the passphrase is wrong (GCM auth failed on an otherwise well-formed file). */
export class BadPassphraseError extends Error {
  constructor() {
    super('bad_passphrase')
    this.name = 'BadPassphraseError'
  }
}

/** Thrown when the file is not a BelNote export or is structurally corrupt/truncated. */
export class CorruptFileError extends Error {
  constructor(message = 'corrupt_file') {
    super(message)
    this.name = 'CorruptFileError'
  }
}

function deriveKey(passphrase: string, salt: Buffer, N: number, r: number, p: number): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, KEY_LEN, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM
  })
}

/** Encrypt an arbitrary payload buffer into a self-describing `.blnt` envelope. */
export function encrypt(plaintext: Buffer, passphrase: string): Buffer {
  const started = Date.now()
  if (!passphrase) throw new Error('passphrase required')

  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = deriveKey(passphrase, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  key.fill(0) // best-effort wipe of the derived key

  const header = Buffer.alloc(HEADER_LEN - TAG_LEN)
  let o = 0
  MAGIC.copy(header, o); o += 4
  header.writeUInt8(FORMAT_VERSION, o); o += 1
  header.writeUInt8(KDF_SCRYPT, o); o += 1
  header.writeUInt32BE(SCRYPT_N, o); o += 4
  header.writeUInt32BE(SCRYPT_R, o); o += 4
  header.writeUInt32BE(SCRYPT_P, o); o += 4
  salt.copy(header, o); o += SALT_LEN
  iv.copy(header, o); o += IV_LEN

  const file = Buffer.concat([header, authTag, ciphertext])
  // eslint-disable-next-line no-console
  console.info(
    `[transfer] encrypt ok: plaintext=${plaintext.length}B file=${file.length}B in ${Date.now() - started}ms`
  )
  return file
}

/** Decrypt a `.blnt` envelope back to the original payload buffer. */
export function decrypt(file: Buffer, passphrase: string): Buffer {
  const started = Date.now()
  if (!Buffer.isBuffer(file) || file.length < HEADER_LEN) {
    throw new CorruptFileError('file too small')
  }
  if (!timingSafeEqual(file.subarray(0, 4), MAGIC)) {
    throw new CorruptFileError('bad magic (not a BelNote export)')
  }

  let o = 4
  const version = file.readUInt8(o); o += 1
  const kdfId = file.readUInt8(o); o += 1
  if (version !== FORMAT_VERSION) throw new CorruptFileError(`unsupported version ${version}`)
  if (kdfId !== KDF_SCRYPT) throw new CorruptFileError(`unsupported kdf ${kdfId}`)

  const N = file.readUInt32BE(o); o += 4
  const r = file.readUInt32BE(o); o += 4
  const p = file.readUInt32BE(o); o += 4
  const salt = file.subarray(o, o + SALT_LEN); o += SALT_LEN
  const iv = file.subarray(o, o + IV_LEN); o += IV_LEN
  const authTag = file.subarray(o, o + TAG_LEN); o += TAG_LEN
  const ciphertext = file.subarray(o)

  const key = deriveKey(passphrase, Buffer.from(salt), N, r, p)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    // eslint-disable-next-line no-console
    console.info(
      `[transfer] decrypt ok: file=${file.length}B plaintext=${plaintext.length}B in ${Date.now() - started}ms`
    )
    return plaintext
  } catch {
    // GCM final() throws when the tag doesn't verify → wrong passphrase or tampered bytes.
    // eslint-disable-next-line no-console
    console.warn('[transfer] decrypt failed: authentication tag mismatch')
    throw new BadPassphraseError()
  } finally {
    key.fill(0)
  }
}
