import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const item = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.workItem.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.acceptanceMetric !== undefined) data.acceptanceMetric = body.acceptanceMetric
  if (body.githubRepo !== undefined) data.githubRepo = body.githubRepo
  if (body.featureFlagName !== undefined) data.featureFlagName = body.featureFlagName

  const updated = await prisma.workItem.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}
