/**
 * Honeycomb API client for Tidepool.
 *
 * Defensible thresholds (v0 defaults, documented in PR description):
 *   error rate  > 1%    → honeycomb_error_rate_ok = false
 *   p99 latency > 2000ms → honeycomb_latency_ok    = false
 *
 * If HONEYCOMB_KEY or HONEYCOMB_DATASET is missing, or the API is unavailable,
 * both signals default to OK and raw is null — the Follow-up View shows
 * "No Honeycomb data available" rather than blocking.
 */

const HONEYCOMB_BASE = 'https://api.honeycomb.io'

const ERROR_RATE_THRESHOLD = 0.01  // > 1% error rate = not ok
const LATENCY_P99_THRESHOLD = 2000 // > 2000ms p99 latency = not ok
const POLL_INTERVAL_MS = 1000
const POLL_MAX_ATTEMPTS = 10

export interface HoneycombResult {
  errorRateOk: boolean
  latencyOk: boolean
  dataAvailable: boolean
  raw: unknown
}

export async function queryHoneycombSinceShip(shippedAt: Date): Promise<HoneycombResult> {
  const key = process.env.HONEYCOMB_KEY
  const dataset = process.env.HONEYCOMB_DATASET

  if (!key || !dataset) {
    return { errorRateOk: true, latencyOk: true, dataAvailable: false, raw: null }
  }

  const timeRangeSeconds = Math.floor((Date.now() - shippedAt.getTime()) / 1000)
  if (timeRangeSeconds <= 0) {
    return { errorRateOk: true, latencyOk: true, dataAvailable: false, raw: null }
  }

  try {
    const [errorResult, latencyResult] = await Promise.all([
      runQuery(key, dataset, {
        time_range: timeRangeSeconds,
        calculations: [
          { op: 'COUNT' },
          { op: 'RATE', column: 'error' },
        ],
        filters: [],
        granularity: 0,
      }),
      runQuery(key, dataset, {
        time_range: timeRangeSeconds,
        calculations: [{ op: 'P99', column: 'duration_ms' }],
        granularity: 0,
      }),
    ])

    const raw = { errorResult, latencyResult }

    const errorRate = extractMetric(errorResult, (key) => key.startsWith('RATE('))
    const p99 = extractMetric(latencyResult, (key) => key.startsWith('P99('))

    const errorRateOk = errorRate === null ? true : errorRate <= ERROR_RATE_THRESHOLD
    const latencyOk = p99 === null ? true : p99 <= LATENCY_P99_THRESHOLD

    return { errorRateOk, latencyOk, dataAvailable: true, raw }
  } catch (err) {
    console.warn('[honeycomb] Query error:', err)
    return { errorRateOk: true, latencyOk: true, dataAvailable: false, raw: null }
  }
}

async function runQuery(
  key: string,
  dataset: string,
  queryBody: Record<string, unknown>
): Promise<unknown> {
  const submitRes = await fetch(
    `${HONEYCOMB_BASE}/1/queries/${encodeURIComponent(dataset)}`,
    {
      method: 'POST',
      headers: {
        'X-Honeycomb-Team': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody),
    }
  )
  if (!submitRes.ok) {
    console.warn('[honeycomb] Query submit failed:', submitRes.status)
    return null
  }
  const { id: queryId } = (await submitRes.json()) as { id?: string }
  if (!queryId) return null

  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const resultRes = await fetch(`${HONEYCOMB_BASE}/1/query_results/${queryId}`, {
      headers: { 'X-Honeycomb-Team': key },
    })
    if (!resultRes.ok) continue
    const resultData = await resultRes.json()
    if (resultData.complete) return resultData
  }

  return null
}

function extractMetric(
  queryResult: unknown,
  keyMatcher: (k: string) => boolean
): number | null {
  if (!queryResult || typeof queryResult !== 'object') return null
  const r = queryResult as Record<string, unknown>
  const data = r.data as Record<string, unknown> | undefined
  const results = data?.results as Array<Record<string, unknown>> | undefined
  if (!results?.length) return null
  const row = results[0]
  const rowData = row.data as Record<string, number> | undefined
  if (!rowData) return null
  const matchedKey = Object.keys(rowData).find(keyMatcher)
  return matchedKey !== undefined ? rowData[matchedKey] : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
