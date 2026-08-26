import type { User } from '@imogen/shared'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { Shell } from './components/Shell.tsx'
import { UploadDrawer } from './components/UploadDrawer.tsx'
import { imogen } from './lib/client.ts'
import { AlbumDetail } from './routes/AlbumDetail.tsx'
import { Albums } from './routes/Albums.tsx'
import { Login } from './routes/Login.tsx'
import { People } from './routes/People.tsx'
import { PersonDetail } from './routes/PersonDetail.tsx'
import { Settings } from './routes/Settings.tsx'
import { SharedAlbum } from './routes/SharedAlbum.tsx'
import { Timeline } from './routes/Timeline.tsx'
import { VaultRoute } from './routes/VaultRoute.tsx'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Photos do not change behind your back, so refetching on every focus is noise.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: (failureCount, error) =>
        !(
          error instanceof Error &&
          'status' in error &&
          (error as { status: number }).status < 500
        ) && failureCount < 2,
    },
  },
})

function App() {
  const location = useLocation()
  const [uploading, setUploading] = useState(false)

  const {
    data: user,
    isPending,
    refetch,
  } = useQuery<User | null>({
    queryKey: ['me'],
    queryFn: () => imogen.auth.me().catch(() => null),
    retry: false,
  })

  // Public routes resolve before the session check, so a shared link never bounces
  // a visitor to a sign-in screen they have no business seeing.
  if (location.pathname.startsWith('/share/')) {
    return (
      <Routes>
        <Route path="/share/:slug" element={<SharedAlbum />} />
      </Routes>
    )
  }

  if (isPending) return <div className="min-h-dvh bg-paper" />

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onSignedIn={() => void refetch()} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Shell user={user} onUpload={() => setUploading(true)}>
      <Routes>
        <Route
          path="/"
          element={
            <Timeline
              title="Photos"
              empty={{
                headline: 'Your library is empty',
                body: 'Add photos and they will appear here, newest first, grouped by the day they were taken.',
              }}
            />
          }
        />
        <Route
          path="/favourites"
          element={
            <Timeline
              title="Favourites"
              query={{ favorite: true }}
              empty={{
                headline: 'No favourites yet',
                body: 'Press F while viewing a photo, or use the heart, to keep it here.',
              }}
            />
          }
        />
        <Route
          path="/trash"
          element={
            <Timeline
              title="Trash"
              query={{ trashed: true }}
              mode="trash"
              empty={{
                headline: 'Trash is empty',
                body: 'Deleted photos wait here before they are removed for good.',
              }}
            />
          }
        />
        <Route path="/albums" element={<Albums />} />
        <Route path="/albums/:id" element={<AlbumDetail />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<PersonDetail />} />
        <Route path="/vault" element={<VaultRoute />} />
        <Route path="/settings" element={<Settings user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <UploadDrawer open={uploading} onClose={() => setUploading(false)} />
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
