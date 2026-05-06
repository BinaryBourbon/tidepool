/**
 * PostHog API client for Tidepool.
 *
 * v0 funnel limitation: exact funnel event names are not stored in the data
 * model. We use $pageview as a generic proxy for both funnel steps. The
 * flag-cohort filter (Approach A) scopes results to flag-exposed users, so
 * the delta signal is meaningful even with this proxy event. Exact funnel
 * event names are a future configuration surface.
 */

const POSTHOG_BASE = 'https://us.posthog.com'

function projectId() {
  return process.env.POSTHOG_PROJECT_ID
}
function token() {
  return process.env.POSTHOG_TOKEN
}

// Generic two-step funnel using $pageview as proxy event (v0 limitation — see file header)
function buildFunnelSeries() {
  return [
    { kind: 'EventsNode', event: '$pageview' },
    { kind: 'EventsNode', event: '$pageview' },
  ]
}

/**
 * Query baseline conversion rate: 30 days before now.
 * Returns a 0–1 fraction, or null if PostHog is not configured / returns no data.
 */
export async function queryBaselineConversionRate(): Promise<number | null> {
  const pid = projectId()
  const tok = token()
  if (!pid || !tok) return null

  const body = {
    query: {
      kind: 'FunnelsQuery',
      series: buildFunnelSeries(),
      dateRange: { date_from: '-30d', date_to: null },
      filterTestAccounts: true,
    },
  }

  try {
    const res = await fetch(`${POSTHOG_BASE}/api/projects/${pid}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[posthog] Baseline query failed:', res.status)
      return null
    }
    const data = await res.json()
    return extractConversionRate(data.results)
  } catch (err) {
    console.warn('[posthog] Baseline query error:', err)
    return null
  }
}

export interface FunnelAfterResult {
  rate: number
  raw: unknown
}

/**
 * Query after-ship conversion rate scoped to flag-exposed users (Approach A).
 * date_from = shippedAt, explicitDate = true to avoid rounding to day boundary.
 */
export async function queryAfterConversionRate(
  featureFlagName: string,
  shippedAt: Date
): Promise<FunnelAfterResult | null> {
  const pid = projectId()
  const tok = token()
  if (!pid || !tok) return null

  const body = {
    query: {
      kind: 'FunnelsQuery',
      series: buildFunnelSeries(),
      dateRange: {
        date_from: shippedAt.toISOString(),
        date_to: null,
        explicitDate: true,
      },
      properties: [
        {
          type: 'feature',
          key: featureFlagName,
          operator: 'exact',
          value: 'true',
        },
      ],
      filterTestAccounts: true,
    },
  }

  try {
    const res = await fetch(`${POSTHOG_BASE}/api/projects/${pid}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[posthog] After query failed:', res.status)
      return null
    }
    const data = await res.json()
    const rate = extractConversionRate(data.results)
    return rate !== null ? { rate, raw: data } : { rate: 0, raw: data }
  } catch (err) {
    console.warn('[posthog] After query error:', err)
    return null
  }
}

/**
 * Enable a PostHog feature flag by key at the given rollout percentage.
 * Looks up the flag ID first, then PATCHes it.
 */
export async function enableFeatureFlag(flagKey: string, rolloutPct: number): Promise<void> {
  const pid = projectId()
  const tok = token()
  if (!pid || !tok) throw new Error('PostHog not configured (POSTHOG_TOKEN / POSTHOG_PROJECT_ID)')

  const flagId = await lookupFlagId(pid, tok, flagKey)

  const patchRes = await fetch(
    `${POSTHOG_BASE}/api/projects/${pid}/feature_flags/${flagId}/`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: true, rollout_percentage: rolloutPct }),
    }
  )
  if (!patchRes.ok) {
    const txt = await patchRes.text()
    throw new Error(`PostHog flag enable failed: ${patchRes.status} ${txt}`)
  }
}

/**
 * Disable a PostHog feature flag by key (roll back).
 */
export async function disableFeatureFlag(flagKey: string): Promise<void> {
  const pid = projectId()
  const tok = token()
  if (!pid || !tok) throw new Error('PostHog not configured (POSTHOG_TOKEN / POSTHOG_PROJECT_ID)')

  const flagId = await lookupFlagId(pid, tok, flagKey)

  const patchRes = await fetch(
    `${POSTHOG_BASE}/api/projects/${pid}/feature_flags/${flagId}/`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    }
  )
  if (!patchRes.ok) {
    const txt = await patchRes.text()
    throw new Error(`PostHog flag disable failed: ${patchRes.status} ${txt}`)
  }
}

async function lookupFlagId(pid: string, tok: string, flagKey: string): Promise<number> {
  const listRes = await fetch(
    `${POSTHOG_BASE}/api/projects/${pid}/feature_flags/?key=${encodeURIComponent(flagKey)}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  )
  if (!listRes.ok) throw new Error(`PostHog flag lookup failed: ${listRes.status}`)
  const listData = await listRes.json()
  const flag = listData.results?.[0]
  if (!flag) throw new Error(`Feature flag '${flagKey}' not found in PostHog`)
  return flag.id as number
}

function extractConversionRate(results: unknown): number | null {
  if (!Array.isArray(results) || results.length < 2) return null
  const first = results[0] as { count?: number }
  const last = results[results.length - 1] as { count?: number }
  if (!first.count || first.count === 0) return null
  return (last.count ?? 0) / first.count
}
