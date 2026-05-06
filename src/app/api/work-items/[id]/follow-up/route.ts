import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queryAfterConversionRate } from '@/lib/posthog'
import { queryHoneycombSinceShip } from '@/lib/honeycomb'

export const dynamic = 'force-dynamic'

const CACHE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const workItem = await prisma.workItem.findUnique({
    where: { id: params.id },
    include: {
      pullRequests: {
        orderBy: { openedAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!workItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!['shipped', 'done'].includes(workItem.state)) {
    return NextResponse.json(
      { error: `Work item is in '${workItem.state}' state, must be 'shipped' or 'done'` },
      { status: 400 }
    )
  }

  // Serve cached result if < 5 minutes old
  const recentCheck = await prisma.followUpCheck.findFirst({
    where: { workItemId: params.id },
    orderBy: { checkedAt: 'desc' },
  })
  if (recentCheck && Date.now() - recentCheck.checkedAt.getTime() < CACHE_WINDOW_MS) {
    return NextResponse.json({
      ...serializeCheck(recentCheck),
      workItem: serializeWorkItem(workItem),
      pullRequest: workItem.pullRequests[0] ?? null,
      posthogDataAvailable: !!(process.env.POSTHOG_TOKEN && process.env.POSTHOG_PROJECT_ID),
      honeycombDataAvailable: !!(process.env.HONEYCOMB_KEY && process.env.HONEYCOMB_DATASET),
      fromCache: true,
    })
  }

  // 1. Query PostHog after value
  let posthogAfterValue: number | null = null
  let rawPosthogResponse: unknown = null
  if (workItem.featureFlagName && workItem.shippedAt) {
    const result = await queryAfterConversionRate(workItem.featureFlagName, workItem.shippedAt)
    if (result) {
      posthogAfterValue = result.rate
      rawPosthogResponse = result.raw
    }
  }

  // 2. Compute delta (after - baseline); both are 0-1 fractions
  const posthogDelta =
    posthogAfterValue !== null && workItem.baselineMetricValue !== null
      ? posthogAfterValue - workItem.baselineMetricValue
      : null

  // 3. Parse acceptance metric (best-effort)
  const metricPassed = parseAcceptanceMetric(workItem.acceptanceMetric, posthogDelta)

  // 4. Query Honeycomb
  let honeycombErrorRateOk: boolean | null = null
  let honeycombLatencyOk: boolean | null = null
  let honeycombDataAvailable = false
  let rawHoneycombResponse: unknown = null

  if (workItem.shippedAt) {
    const hc = await queryHoneycombSinceShip(workItem.shippedAt)
    honeycombErrorRateOk = hc.errorRateOk
    honeycombLatencyOk = hc.latencyOk
    honeycombDataAvailable = hc.dataAvailable
    rawHoneycombResponse = hc.raw
  }

  // 5. anomaly_detected = metric failed OR either Honeycomb signal bad
  const anomalyDetected =
    metricPassed === false ||
    honeycombErrorRateOk === false ||
    honeycombLatencyOk === false

  // 6. Persist follow_up_checks row
  const check = await prisma.followUpCheck.create({
    data: {
      workItemId: params.id,
      posthogAfterValue,
      posthogDelta,
      metricPassed,
      honeycombErrorRateOk,
      honeycombLatencyOk,
      anomalyDetected,
      rawPosthogResponse: rawPosthogResponse ?? undefined,
      rawHoneycombResponse: rawHoneycombResponse ?? undefined,
    },
  })

  return NextResponse.json({
    ...serializeCheck(check),
    workItem: serializeWorkItem(workItem),
    pullRequest: workItem.pullRequests[0] ?? null,
    posthogDataAvailable: !!(process.env.POSTHOG_TOKEN && process.env.POSTHOG_PROJECT_ID),
    honeycombDataAvailable,
    fromCache: false,
  })
}

/**
 * Best-effort parse of acceptance metric string.
 * Recognises patterns like "+5%", "+5pp", "+5.5%", "+5.5pp".
 * Treats the number as percentage points (e.g. "+5%" = delta ≥ 0.05).
 * Returns null if unparseable — UI shows raw delta without pass/fail.
 */
function parseAcceptanceMetric(
  acceptanceMetric: string | null,
  posthogDelta: number | null
): boolean | null {
  if (!acceptanceMetric || posthogDelta === null) return null
  const match = acceptanceMetric.match(/\+\s*(\d+(?:\.\d+)?)\s*(%|pp)/i)
  if (!match) return null
  const target = parseFloat(match[1])
  if (isNaN(target)) return null
  return posthogDelta >= target / 100
}

function serializeCheck(check: {
  id: string
  workItemId: string
  checkedAt: Date
  posthogAfterValue: number | null
  posthogDelta: number | null
  metricPassed: boolean | null
  honeycombErrorRateOk: boolean | null
  honeycombLatencyOk: boolean | null
  anomalyDetected: boolean
}) {
  return {
    id: check.id,
    workItemId: check.workItemId,
    checkedAt: check.checkedAt.toISOString(),
    posthogAfterValue: check.posthogAfterValue,
    posthogDelta: check.posthogDelta,
    metricPassed: check.metricPassed,
    honeycombErrorRateOk: check.honeycombErrorRateOk,
    honeycombLatencyOk: check.honeycombLatencyOk,
    anomalyDetected: check.anomalyDetected,
  }
}

function serializeWorkItem(workItem: {
  id: string
  title: string
  featureFlagName: string | null
  acceptanceMetric: string | null
  baselineMetricValue: number | null
  posthogRolloutPct: number | null
  shippedAt: Date | null
  state: string
}) {
  return {
    id: workItem.id,
    title: workItem.title,
    featureFlagName: workItem.featureFlagName,
    acceptanceMetric: workItem.acceptanceMetric,
    baselineMetricValue: workItem.baselineMetricValue,
    posthogRolloutPct: workItem.posthogRolloutPct,
    shippedAt: workItem.shippedAt?.toISOString() ?? null,
    state: workItem.state,
  }
}
