import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slug'

export async function GET() {
  const items = await prisma.workItem.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!body.githubRepo || typeof body.githubRepo !== 'string' || !body.githubRepo.trim()) {
    return NextResponse.json({ error: 'githubRepo is required' }, { status: 400 })
  }

  const baseSlug = slugify(body.title.trim())
  let slug = baseSlug
  let suffix = 0
  while (await prisma.workItem.findUnique({ where: { slug } })) {
    suffix++
    slug = `${baseSlug}-${suffix}`
  }

  const item = await prisma.workItem.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      slug,
      ownerHandles: Array.isArray(body.ownerHandles) ? body.ownerHandles : [],
      featureFlagName: body.featureFlagName?.trim() || null,
      acceptanceMetric: body.acceptanceMetric?.trim() || null,
      githubRepo: body.githubRepo.trim(),
    },
  })
  return NextResponse.json(item, { status: 201 })
}
