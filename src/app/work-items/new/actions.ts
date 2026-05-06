'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slug'

export async function createWorkItem(formData: FormData) {
  const title = (formData.get('title') as string | null)?.trim() ?? ''
  const githubRepo = (formData.get('githubRepo') as string | null)?.trim() ?? ''

  if (!title) throw new Error('Title is required')
  if (!githubRepo) throw new Error('GitHub repo is required')

  const baseSlug = slugify(title)
  let slug = baseSlug
  let suffix = 0
  while (await prisma.workItem.findUnique({ where: { slug } })) {
    suffix++
    slug = `${baseSlug}-${suffix}`
  }

  const ownerHandlesRaw = (formData.get('ownerHandles') as string | null) ?? ''
  const ownerHandles = ownerHandlesRaw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)

  const item = await prisma.workItem.create({
    data: {
      title,
      description: (formData.get('description') as string | null)?.trim() || null,
      slug,
      ownerHandles,
      featureFlagName: (formData.get('featureFlagName') as string | null)?.trim() || null,
      acceptanceMetric: (formData.get('acceptanceMetric') as string | null)?.trim() || null,
      githubRepo,
    },
  })

  redirect(`/work-items/${item.id}`)
}
