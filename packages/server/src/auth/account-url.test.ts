import { describe, expect, test } from 'bun:test'
import { deriveAccountUrl } from './account-url.ts'

describe('finding where a provider keeps its account page', () => {
  test('uses an explicit setting when one is given', () => {
    expect(deriveAccountUrl('https://auth.example.com/realms/x', 'https://id.example.com/me')).toBe(
      'https://id.example.com/me',
    )
  })

  test('recognises an Authentik issuer', () => {
    expect(deriveAccountUrl('https://auth.example.com/application/o/imogen/')).toBe(
      'https://auth.example.com/if/user/',
    )
  })

  test('recognises a Keycloak realm issuer', () => {
    expect(deriveAccountUrl('https://auth.example.com/realms/main')).toBe(
      'https://auth.example.com/realms/main/account',
    )
  })

  test('handles a Keycloak issuer with a trailing slash', () => {
    expect(deriveAccountUrl('https://auth.example.com/realms/main/')).toBe(
      'https://auth.example.com/realms/main/account',
    )
  })

  test('falls back to the provider’s own origin', () => {
    expect(deriveAccountUrl('https://accounts.google.com')).toBe('https://accounts.google.com/')
  })

  test('returns nothing for an issuer it cannot parse', () => {
    expect(deriveAccountUrl('not a url')).toBeNull()
  })
})
