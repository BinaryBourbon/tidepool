import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const workItem = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!workItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!['shipped', 'done'].includes(workItem.state)) {
    return NextResponse.json(
      { error: `Work item is in '${workItem.state}' state, must be 'shipped' or 'done'` },
      { status: 400 }
    )
  }

  if (workItem.state === 'done') {
    return NextResponse.json(workItem)
  }

  const updated = await prisma.workItem.update({
    where: { id: params.id },
    data: { state: 'done' },
  })

  return NextResponse.json(updated)
}
