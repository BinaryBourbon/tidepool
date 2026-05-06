import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startBackgroundRunner } from '@/lib/agent-runner'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const workItem = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!workItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const aodBaseUrl = process.env.AOD_BASE_URL!
  const aodToken = process.env.AOD_TOKEN!
  const aodAgentId = process.env.AOD_AGENT_ID!
  const aodVaultId = process.env.AOD_VAULT_ID!

  // Insert pending run
  const run = await prisma.agentRun.create({
    data: {
      workItemId: params.id,
      prompt: body.prompt.trim(),
      status: 'pending',
    },
  })

  // Dispatch to AoD
  let aodConversationId: string
  try {
    const res = await fetch(`${aodBaseUrl}/api/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aodToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: aodAgentId,
        vault_id: aodVaultId,
        prompt: body.prompt.trim(),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'failed' },
      })
      return NextResponse.json(
        { error: `AoD dispatch failed: ${res.status} ${text}` },
        { status: 502 }
      )
    }
    const data = await res.json()
    aodConversationId = data.data?.id ?? data.id
  } catch {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'failed' },
    })
    return NextResponse.json({ error: 'AoD dispatch error' }, { status: 502 })
  }

  // Update run with conversation ID and running status
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      aodConversationId,
      status: 'running',
    },
  })

  // Update work item state to executing if still in plan
  if (workItem.state === 'plan') {
    await prisma.workItem.update({
      where: { id: params.id },
      data: { state: 'executing' },
    })
  }

  // Kick off background stream reader + status poller (fire and forget)
  startBackgroundRunner(run.id, aodConversationId, params.id)

  return NextResponse.json({ runId: run.id, aodConversationId }, { status: 201 })
}
