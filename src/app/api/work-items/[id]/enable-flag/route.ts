import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queryBaselineConversionRate, enableFeatureFlag } from '@/lib/posthog'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const workItem = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!workItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (workItem.state !== 'executing') {
    return NextResponse.json(
      { error: `Work item is in '${workItem.state}' state, must be 'executing'` },
      { status: 400 }
    )
  }

  const body = await request.json()
  const rawPct = typeof body.rolloutPct === 'number' ? body.rolloutPct : 10
  const rolloutPct = Math.round(Math.max(0, Math.min(100, rawPct)))

  // 1. Capture baseline metric (skip if already set)
  let baselineMetricValue: number | null = workItem.baselineMetricValue
  if (baselineMetricValue === null) {
    baselineMetricValue = await queryBaselineConversionRate()
  }

  // 2. Enable feature flag in PostHog (best-effort — don't block state transition)
  if (workItem.featureFlagName) {
    try {
      await enableFeatureFlag(workItem.featureFlagName, rolloutPct)
    } catch (err) {
      console.warn('[enable-flag] PostHog flag enable failed (non-fatal):', err)
    }
  }

  // 3. Transition state to shipped
  const updated = await prisma.workItem.update({
    where: { id: params.id },
    data: {
      state: 'shipped',
      shippedAt: new Date(),
      posthogRolloutPct: rolloutPct,
      ...(baselineMetricValue !== null ? { baselineMetricValue } : {}),
    },
  })

  return NextResponse.json(updated)
}
