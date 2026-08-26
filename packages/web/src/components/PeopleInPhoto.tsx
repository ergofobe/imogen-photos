import type { DetectedFace } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { imogen } from '../lib/client.ts'

/**
 * Who is in this photograph.
 *
 * Shown inside the details panel, alongside the other things that are true about the
 * photo. An unnamed face is offered as something to name here rather than only on the
 * People page — the moment you are looking at someone is the moment you know who they
 * are, and sending you elsewhere to say so loses that.
 */
export function PeopleInPhoto({
  assetId,
  onNavigate,
}: {
  assetId: string
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [namingFace, setNamingFace] = useState<string | null>(null)
  const [name, setName] = useState('')

  const { data: status } = useQuery({
    queryKey: ['face-status'],
    queryFn: () => imogen.people.status(),
    staleTime: 60_000,
  })

  const { data: faces } = useQuery({
    queryKey: ['faces', assetId],
    queryFn: () => imogen.people.facesIn(assetId),
    enabled: status?.enabled === true,
  })

  const rename = useMutation({
    mutationFn: ({ personId, value }: { personId: string; value: string }) =>
      imogen.people.update(personId, { name: value }),
    onSuccess: () => {
      setNamingFace(null)
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['faces', assetId] })
      void queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })

  // Nothing to say when the feature is off, or when nobody is in the picture.
  if (!status?.enabled || !faces || faces.length === 0) return null

  const goToPerson = (personId: string) => {
    onNavigate()
    navigate(`/people/${personId}`)
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h3 className="label-micro mb-3 text-white/45">{faces.length === 1 ? 'Person' : 'People'}</h3>

      <ul className="flex flex-wrap gap-2">
        {faces.map((face) => (
          <li key={face.id}>
            {namingFace === face.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (face.personId && name.trim()) {
                    rename.mutate({ personId: face.personId, value: name.trim() })
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <FaceThumbnail face={face} />
                <input
                  ref={(node) => node?.focus()}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Their name"
                  className="w-32 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white outline-none placeholder:text-white/40 focus:border-safelight"
                />
                <button
                  type="submit"
                  className="rounded-md bg-white/15 px-2 py-1 text-xs text-white hover:bg-white/25"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setNamingFace(null)}
                  aria-label="Cancel"
                  className="px-1 text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </form>
            ) : face.personName ? (
              <button
                type="button"
                onClick={() => face.personId && goToPerson(face.personId)}
                className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm text-white transition hover:bg-white/20"
              >
                <FaceThumbnail face={face} />
                {face.personName}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNamingFace(face.id)
                  setName('')
                }}
                className="flex items-center gap-2 rounded-full border border-dashed border-white/25 py-1 pl-1 pr-3 text-sm text-white/60 transition hover:border-white/50 hover:text-white"
              >
                <FaceThumbnail face={face} />
                Add a name
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FaceThumbnail({ face }: { face: DetectedFace }) {
  return (
    <img
      src={`/api/v1/people/thumbnail/${face.id}`}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      className="h-6 w-6 shrink-0 rounded-full object-cover"
    />
  )
}
