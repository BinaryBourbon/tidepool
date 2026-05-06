import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.agentRun.findUnique({ where: { id: params.id } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!run.aodConversationId) {
    return NextResponse.json({ error: 'Run has no AoD conversation' }, { status: 400 })
  }
  if (run.status !== 'running') {
    return NextResponse.json({ error: 'Run is not active' }, { status: 400 })
  }

  const body = await request.json()
  if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const aodBaseUrl = process.env.AOD_BASE_URL!
  const aodToken = process.env.AOD_TOKEN!

  const res = await fetch(
    `${aodBaseUrl}/api/conversations/${run.aodConversationId}/prompts`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aodToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: body.prompt.trim() }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: `AoD follow-up failed: ${res.status} ${text}` },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
