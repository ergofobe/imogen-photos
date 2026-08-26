/**
 * Where a provider keeps the page someone edits their own name and email on.
 *
 * OIDC discovery does not standardise this, so it is guessed from the shape of the
 * issuer for the two providers a home lab is most likely to run, and an administrator
 * can always set it outright.
 */
export function deriveAccountUrl(issuer: string, configured?: string): string | null {
  if (configured) return configured

  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    return null
  }

  // Authentik: https://auth.example.com/application/o/<slug>/
  if (url.pathname.includes('/application/o/')) {
    return new URL('/if/user/', url.origin).toString()
  }

  // Keycloak: https://auth.example.com/realms/<realm>
  const realm = url.pathname.match(/^(.*\/realms\/[^/]+)\/?$/)
  if (realm) {
    return new URL(`${realm[1]}/account`, url.origin).toString()
  }

  return url.origin + '/'
}
