import { createContext, useContext, useMemo } from 'react'

export type AssetVariant = 'thumbnail' | 'preview' | 'original'

/**
 * Where a photograph's bytes come from.
 *
 * The library serves them from `/api/v1/assets`, which requires a session. A public
 * share serves the same bytes from `/api/v1/share/<slug>`, which requires only the
 * slug and refuses anything the link does not cover.
 *
 * Tiles and the viewer are the same components in both places, so the URL cannot be
 * baked into them: on a shared page a library URL is a 401, which is a page that
 * renders perfectly with every image missing.
 */
type AssetUrls = {
  url: (assetId: string, variant: AssetVariant) => string
  /** Null when this context has no download to offer, or the link forbids it. */
  downloadUrl: ((assetId: string) => string) | null
}

const LIBRARY: AssetUrls = {
  url: (assetId, variant) => `/api/v1/assets/${assetId}/${variant}`,
  downloadUrl: (assetId) => `/api/v1/assets/${assetId}/download`,
}

const AssetUrlContext = createContext<AssetUrls>(LIBRARY)

export function useAssetUrls(): AssetUrls {
  return useContext(AssetUrlContext)
}

/** Wraps a public share so everything inside asks for bytes through the slug. */
export function ShareAssetUrls({
  slug,
  allowDownload,
  children,
}: {
  slug: string
  allowDownload: boolean
  children: React.ReactNode
}) {
  const value = useMemo<AssetUrls>(
    () => ({
      url: (assetId, variant) => `/api/v1/share/${slug}/assets/${assetId}/${variant}`,
      downloadUrl: allowDownload
        ? (assetId) => `/api/v1/share/${slug}/assets/${assetId}/original`
        : null,
    }),
    [slug, allowDownload],
  )

  return <AssetUrlContext.Provider value={value}>{children}</AssetUrlContext.Provider>
}
