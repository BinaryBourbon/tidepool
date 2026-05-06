import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { disableFeatureFlag } from '@/lib/posthog'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const workItem = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!workItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!workItem.featureFlagName) {
    return NextResponse.json({ error: 'Work item has no feature flag' }, { status: 400 })
  }

  try {
    await disableFeatureFlag(workItem.featureFlagName)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ ok: true, flagKey: workItem.featureFlagName })
}
