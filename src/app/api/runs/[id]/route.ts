import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    include: { workItem: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const streamLog = run.streamLog as Array<{ t: number; data: string }>
  return NextResponse.json({
    id: run.id,
    workItemId: run.workItemId,
    status: run.status,
    prompt: run.prompt,
    aodConversationId: run.aodConversationId,
    streamLogLength: streamLog.length,
    githubPrNumber: run.githubPrNumber,
    githubRepo: run.workItem.githubRepo,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.agentRun.findUnique({ where: { id: params.id } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (run.aodConversationId && run.status === 'running') {
    const aodBaseUrl = process.env.AOD_BASE_URL!
    const aodToken = process.env.AOD_TOKEN!
    try {
      await fetch(`${aodBaseUrl}/api/conversations/${run.aodConversationId}/terminate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aodToken}` },
      })
    } catch {
      // best effort
    }
  }

  await prisma.agentRun.update({
    where: { id: params.id },
    data: { status: 'cancelled', completedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
