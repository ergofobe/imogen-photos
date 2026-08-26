import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Opaque bearer tokens. The prefix is for humans reading logs; the entropy is what
 * matters. Nothing about a token is derivable from its stored form.
 */
export function generateToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Compares two same-length hex digests without leaking position through timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input).digest('base64url')
}
