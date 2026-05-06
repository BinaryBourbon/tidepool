import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { detectPRForRun } from '@/lib/agent-runner'

const AOD_TERMINAL = new Set(['complete', 'failed', 'stopped', 'idle'])

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    include: { workItem: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Self-heal: if run is stuck in 'running' but AoD conversation is terminal,
  // update status and kick off PR detection. Fire-and-forget; don't block response.
  if (run.status === 'running' && run.aodConversationId) {
    const aodBaseUrl = process.env.AOD_BASE_URL
    const aodToken = process.env.AOD_TOKEN
    if (aodBaseUrl && aodToken) {
      fetch(`${aodBaseUrl}/api/conversations/${run.aodConversationId}`, {
        headers: { 'Authorization': `Bearer ${aodToken}` },
      })
        .then((r) => r.json())
        .then((convData) => {
          const aodStatus: string = convData.data?.status ?? convData.status ?? ''
          if (AOD_TERMINAL.has(aodStatus)) {
            const prismaStatus =
              aodStatus === 'complete' || aodStatus === 'idle' ? 'complete' : 'failed'
            return prisma.agentRun
              .update({
                where: { id: params.id },
                data: { status: prismaStatus, completedAt: new Date() },
              })
              .then(() => {
                if (prismaStatus === 'complete') {
                  detectPRForRun(params.id, run.workItemId).catch(() => {})
                }
              })
          }
        })
        .catch(() => {})
    }
  }

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
