import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

type ApiErrorDetail = { message?: string; status?: number }

export function ApiErrorToast() {
  const [error, setError] = useState<ApiErrorDetail | null>(null)

  useEffect(() => {
    let timeout: number | undefined
    const onApiError = (event: Event) => {
      const detail = (event as CustomEvent<ApiErrorDetail>).detail
      setError(detail?.message ? detail : { message: 'Something went wrong. Please try again.' })
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => setError(null), 8000)
    }

    window.addEventListener('club-admin:api-error', onApiError)
    return () => {
      window.removeEventListener('club-admin:api-error', onApiError)
      window.clearTimeout(timeout)
    }
  }, [])

  if (!error) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center sm:justify-end">
      <div role="alert" aria-live="assertive" className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-destructive/20 bg-background px-4 py-3.5 text-foreground shadow-xl">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{error.status ? `Request failed (${error.status})` : 'Connection problem'}</p>
          <p className="mt-1 leading-5 text-gray-800 text-sm">{error.message}</p>
        </div>
        <button type="button" aria-label="Dismiss error message" className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setError(null)}>
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  )
}
