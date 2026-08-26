import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { imogen } from '../../lib/client.ts'

/**
 * How the server behaves, changed without restarting it.
 *
 * Each of these had an environment variable as its only control, which meant editing
 * a compose file and bouncing the server to let one person sign up. What is set here
 * wins; a deployment that sets nothing keeps doing exactly what it did.
 */
export function AdminSettings() {
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => imogen.admin.settings(),
  })

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof imogen.admin.updateSettings>[0]) =>
      imogen.admin.updateSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(['admin', 'settings'], next)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  if (isPending || !data) return <div className="h-40 animate-pulse rounded-xl bg-sunken" />

  return (
    <div className="space-y-8">
      <header>
        <h2 className="heading-display text-xl">Server</h2>
        <p className="mt-1 text-sm text-muted">These take effect immediately, for everybody.</p>
      </header>

      <Toggle
        label="Anyone can sign up"
        help="With this off, the only way in is an invitation. Invitations keep working either way."
        checked={data.allowSignup}
        disabled={save.isPending}
        onChange={(allowSignup) => save.mutate({ allowSignup })}
      />

      <Toggle
        label="Group faces"
        help="Looks for faces in your photographs and groups them. Vaulted photos are never scanned. Turning it on downloads the recognition models."
        checked={data.facesEnabled}
        disabled={save.isPending}
        onChange={(facesEnabled) => save.mutate({ facesEnabled })}
      />

      <RetentionField
        days={data.trashRetentionDays}
        disabled={save.isPending}
        onSave={(trashRetentionDays) => save.mutate({ trashRetentionDays })}
      />

      {save.isError && (
        <p className="text-sm text-red-500">
          {save.error instanceof Error ? save.error.message : 'That did not save'}
        </p>
      )}
    </div>
  )
}

function Toggle({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string
  help: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-safelight"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{help}</span>
      </span>
    </label>
  )
}

function RetentionField({
  days,
  disabled,
  onSave,
}: {
  days: number
  disabled: boolean
  onSave: (days: number) => void
}) {
  const [value, setValue] = useState(String(days))
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 365

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (valid && parsed !== days) onSave(parsed)
      }}
      className="rounded-xl border border-line p-4"
    >
      <p className="text-sm font-medium">How long the trash keeps things</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        After this, a deleted photograph and its file are destroyed and cannot be brought back.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24 rounded-lg border border-line bg-paper px-3 py-1.5 text-center font-mono text-[13px] outline-none focus:border-safelight"
        />
        <span className="text-sm text-muted">days</span>
        <button
          type="submit"
          disabled={disabled || !valid || parsed === days}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  )
}
