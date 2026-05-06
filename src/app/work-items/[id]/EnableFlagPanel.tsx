'use client'

import { useState } from 'react'

interface EnableFlagPanelProps {
  workItemId: string
  featureFlagName: string | null
  hasMergedPr: boolean
}

export default function EnableFlagPanel({
  workItemId,
  featureFlagName,
  hasMergedPr,
}: EnableFlagPanelProps) {
  const [rolloutPct, setRolloutPct] = useState(10)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shipped, setShipped] = useState(false)

  if (!hasMergedPr) return null

  if (shipped) {
    return (
      <div className="mt-8 border border-green-800 bg-green-950/40 rounded-lg p-5">
        <p className="text-green-300 text-sm">
          Feature flag enabled at {rolloutPct}% rollout. Work item is now{' '}
          <strong>shipped</strong>.{' '}
          <a href="." className="underline text-green-400 hover:text-green-200">
            Refresh to view Follow-up →
          </a>
        </p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${workItemId}/enable-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPct }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to enable feature flag')
        return
      }
      setShipped(true)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-8 border border-indigo-800 rounded-lg p-5">
      <h2 className="text-sm font-medium text-indigo-300 uppercase tracking-wider mb-1">
        Enable Feature Flag
      </h2>
      {featureFlagName && (
        <p className="text-xs text-gray-500 font-mono mb-4">{featureFlagName}</p>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rollout %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={rolloutPct}
            onChange={(e) => setRolloutPct(Math.round(Number(e.target.value)))}
            className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium text-white"
        >
          {submitting ? 'Enabling…' : 'Enable feature flag →'}
        </button>
      </form>
      {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
    </div>
  )
}
