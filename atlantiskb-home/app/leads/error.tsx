'use client'

import { useEffect } from 'react'

type LeadsErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function LeadsError({ error, reset }: LeadsErrorProps) {
  useEffect(() => {
    // Keep UI messages generic; log full error details for debugging/monitoring.
    console.error('[leads] Route error boundary caught an error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-2xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="mt-3 max-w-md text-sm text-slate-600">
        We ran into a problem while loading this Leads page. Please try again in a moment.
      </p>

      {error.digest ? (
        <p className="mt-2 text-xs text-slate-500">Reference ID: {error.digest}</p>
      ) : null}

      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  )
}
