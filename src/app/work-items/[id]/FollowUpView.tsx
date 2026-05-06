'use client'

import { useEffect, useState } from 'react'

interface PullRequestData {
  githubPrNumber: number
  githubRepo: string
  authorHandle: string | null
  mergedAt: string | null
  additions: number | null
  deletions: number | null
}

interface WorkItemData {
  id: string
  title: string
  featureFlagName: string | null
  acceptanceMetric: string | null
  baselineMetricValue: number | null
  posthogRolloutPct: number | null
  shippedAt: string | null
  state: string
}

interface FollowUpData {
  id: string
  checkedAt: string
  posthogAfterValue: number | null
  posthogDelta: number | null
  metricPassed: boolean | null
  honeycombErrorRateOk: boolean | null
  honeycombLatencyOk: boolean | null
  anomalyDetected: boolean
  posthogDataAvailable: boolean
  honeycombDataAvailable: boolean
  fromCache: boolean
  workItem: WorkItemData
  pullRequest: PullRequestData | null
}

interface FollowUpViewProps {
  workItemId: string
  workItemTitle: string
  isDone: boolean
}

export default function FollowUpView({ workItemId, workItemTitle, isDone }: FollowUpViewProps) {
  const [data, setData] = useState<FollowUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [markingDone, setMarkingDone] = useState(false)
  const [done, setDone] = useState(isDone)
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackDone, setRollbackDone] = useState(false)

  useEffect(() => {
    fetch(`/api/work-items/${workItemId}/follow-up`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d.error ?? 'Failed'))
        return r.json() as Promise<FollowUpData>
      })
      .then(setData)
      .catch((e: unknown) =>
        setFetchError(typeof e === 'string' ? e : 'Failed to load follow-up data')
      )
      .finally(() => setLoading(false))
  }, [workItemId])

  async function handleMarkDone() {
    setMarkingDone(true)
    try {
      const res = await fetch(`/api/work-items/${workItemId}/done`, { method: 'POST' })
      if (res.ok) setDone(true)
    } finally {
      setMarkingDone(false)
    }
  }

  async function handleRollBack() {
    setRollingBack(true)
    try {
      const res = await fetch(`/api/work-items/${workItemId}/roll-back-flag`, { method: 'POST' })
      if (res.ok) setRollbackDone(true)
    } finally {
      setRollingBack(false)
    }
  }

  function fmtPct(v: number | null): string {
    if (v === null) return 'N/A'
    return `${(v * 100).toFixed(1)}%`
  }

  function fmtDelta(v: number | null): string {
    if (v === null) return 'N/A'
    const pp = (v * 100).toFixed(1)
    return v >= 0 ? `+${pp}pp` : `${pp}pp`
  }

  if (loading) {
    return (
      <div className="mt-10 border border-gray-700 rounded-lg p-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Follow-up</h2>
        <p className="text-sm text-gray-500">Loading follow-up data…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="mt-10 border border-gray-700 rounded-lg p-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Follow-up</h2>
        <p className="text-sm text-red-400">{fetchError}</p>
      </div>
    )
  }

  if (!data) return null

  const isAnomaly = data.anomalyDetected

  return (
    <div className="mt-10 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Follow-up</h2>
        <div className="flex items-center gap-3">
          {data.fromCache && (
            <span className="text-xs text-gray-600">
              cached · {new Date(data.checkedAt).toLocaleTimeString()}
            </span>
          )}
          {isAnomaly ? (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-200">
              Anomaly
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-200">
              Looks good
            </span>
          )}
        </div>
      </div>

      {/* Funnel widget */}
      <div className="border border-gray-700 rounded-lg p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Funnel metric
        </h3>
        {!data.posthogDataAvailable ? (
          <p className="text-sm text-gray-500">
            No PostHog data available.{' '}
            <span className="text-gray-600">
              Set <code className="font-mono">POSTHOG_TOKEN</code> and{' '}
              <code className="font-mono">POSTHOG_PROJECT_ID</code> in the Render dashboard.
            </span>
          </p>
        ) : (
          <div className="flex items-center gap-8 flex-wrap">
            <div className="text-center">
              <div className="text-2xl font-mono font-semibold text-gray-200">
                {fmtPct(data.workItem.baselineMetricValue)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Before</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-mono font-semibold ${
                  data.posthogDelta !== null && data.posthogDelta >= 0
                    ? 'text-green-300'
                    : 'text-red-300'
                }`}
              >
                {fmtDelta(data.posthogDelta)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Δ Delta</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-mono font-semibold text-gray-200">
                {fmtPct(data.posthogAfterValue)}
              </div>
              <div className="text-xs text-gray-500 mt-1">After</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              {data.workItem.acceptanceMetric && (
                <div className="text-xs text-gray-500 max-w-32 text-center">
                  {data.workItem.acceptanceMetric}
                </div>
              )}
              {data.metricPassed === null ? (
                <span className="text-xs text-gray-600">target unparseable</span>
              ) : data.metricPassed ? (
                <span className="text-green-400 text-xl">✓</span>
              ) : (
                <span className="text-red-400 text-xl">✗</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* What shipped panel */}
      {data.pullRequest && (
        <div className="border border-gray-700 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            What shipped
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-4">
              <dt className="text-gray-500 w-20 shrink-0">PR</dt>
              <dd>
                <a
                  href={`https://github.com/${data.pullRequest.githubRepo}/pull/${data.pullRequest.githubPrNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline"
                >
                  #{data.pullRequest.githubPrNumber} ↗
                </a>
              </dd>
            </div>
            {data.pullRequest.authorHandle && (
              <div className="flex gap-4">
                <dt className="text-gray-500 w-20 shrink-0">Author</dt>
                <dd className="font-mono text-gray-300">@{data.pullRequest.authorHandle}</dd>
              </div>
            )}
            {data.pullRequest.mergedAt && (
              <div className="flex gap-4">
                <dt className="text-gray-500 w-20 shrink-0">Merged</dt>
                <dd className="text-gray-300">
                  {new Date(data.pullRequest.mergedAt).toLocaleString()}
                </dd>
              </div>
            )}
            {(data.pullRequest.additions !== null || data.pullRequest.deletions !== null) && (
              <div className="flex gap-4">
                <dt className="text-gray-500 w-20 shrink-0">Diff</dt>
                <dd className="font-mono">
                  <span className="text-green-400">+{data.pullRequest.additions ?? 0}</span>
                  {' / '}
                  <span className="text-red-400">-{data.pullRequest.deletions ?? 0}</span>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Signals panel */}
      <div className="border border-gray-700 rounded-lg p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Signals (since ship)
        </h3>
        {!data.honeycombDataAvailable ? (
          <p className="text-sm text-gray-500">
            No Honeycomb data available.{' '}
            <span className="text-gray-600">
              Set <code className="font-mono">HONEYCOMB_KEY</code> and{' '}
              <code className="font-mono">HONEYCOMB_DATASET</code> in the Render dashboard.
            </span>
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span
                className={data.honeycombErrorRateOk !== false ? 'text-green-400' : 'text-red-400'}
              >
                {data.honeycombErrorRateOk !== false ? '✓' : '✗'}
              </span>
              <span className="text-gray-300">
                Error rate{' '}
                {data.honeycombErrorRateOk !== false ? '\u2264 1%' : '> 1%'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={data.honeycombLatencyOk !== false ? 'text-green-400' : 'text-red-400'}
              >
                {data.honeycombLatencyOk !== false ? '✓' : '✗'}
              </span>
              <span className="text-gray-300">
                p99 latency{' '}
                {data.honeycombLatencyOk !== false ? '\u2264 2000ms' : '> 2000ms'}
              </span>
            </div>
            {!isAnomaly && (
              <p className="text-green-400 text-xs mt-2">No anomalies detected.</p>
            )}
          </div>
        )}
      </div>

      {/* Anomaly panel (Screen 6) */}
      {isAnomaly && (
        <div className="border border-red-800 bg-red-950/20 rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider">
            Anomaly detected
          </h3>
          {data.metricPassed === false && (
            <p className="text-sm text-red-300">Metric did not meet target.</p>
          )}
          {(data.honeycombErrorRateOk === false || data.honeycombLatencyOk === false) && (
            <p className="text-sm text-red-300">Signals regression detected.</p>
          )}

          {/* Graph traversal pre-populated hop: PostHog event → GitHub PR */}
          {(data.workItem.featureFlagName || data.pullRequest) && (
            <div className="border border-red-900/50 rounded p-3 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Investigation path</p>
              <div className="flex items-center gap-2 flex-wrap">
                {data.workItem.featureFlagName && (
                  <span className="font-mono text-xs text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded">
                    PostHog · {data.workItem.featureFlagName}
                  </span>
                )}
                {data.workItem.featureFlagName && data.pullRequest && (
                  <span className="text-gray-600">→</span>
                )}
                {data.pullRequest && (
                  <a
                    href={`https://github.com/${data.pullRequest.githubRepo}/pull/${data.pullRequest.githubPrNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded hover:underline"
                  >
                    GitHub PR #{data.pullRequest.githubPrNumber} ↗
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap pt-1">
            <a
              href={`/work-items/new?title=${encodeURIComponent('Follow-up: ' + workItemTitle)}`}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium text-white"
            >
              Create follow-on work item
            </a>
            {data.workItem.featureFlagName && !rollbackDone && (
              <button
                onClick={handleRollBack}
                disabled={rollingBack}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded text-sm font-medium text-white"
              >
                {rollingBack ? 'Rolling back…' : 'Roll back flag'}
              </button>
            )}
            {rollbackDone && (
              <span className="text-sm text-red-300">✓ Flag rolled back</span>
            )}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
        {!done ? (
          <button
            onClick={handleMarkDone}
            disabled={markingDone}
            className="mt-4 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded text-sm font-medium text-white"
          >
            {markingDone ? 'Marking done…' : 'Mark as Done'}
          </button>
        ) : (
          <span className="mt-4 text-sm text-gray-500">✓ Marked as done</span>
        )}
        {!isAnomaly && data.workItem.featureFlagName && (
          <a
            href="https://us.posthog.com/feature_flags"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-sm text-indigo-400 hover:text-indigo-200 underline"
          >
            Increase rollout in PostHog ↗
          </a>
        )}
      </div>
    </div>
  )
}
