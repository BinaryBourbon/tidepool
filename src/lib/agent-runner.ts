/**
 * Background agent runner: streams AoD output to stream_log, polls for
 * terminal status, then triggers PR detection.
 *
 * Called fire-and-forget from POST /api/work-items/[id]/runs.
 * On Render free tier the process may be recycled; the SSE route handles
 * reconnection via Last-Event-ID replay from stream_log.
 */

import { prisma } from './prisma'

const AOD_BASE_URL = () => process.env.AOD_BASE_URL!
const AOD_TOKEN = () => process.env.AOD_TOKEN!
const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN!

const TERMINAL_STATUSES = new Set(['complete', 'failed', 'stopped'])

export function startBackgroundRunner(
  runId: string,
  aodConversationId: string,
  workItemId: string
): void {
  // Fire and forget — intentionally not awaited
  runBackground(runId, aodConversationId, workItemId).catch((err) => {
    console.error('[agent-runner] Unhandled error:', err)
  })
}

async function runBackground(
  runId: string,
  aodConversationId: string,
  workItemId: string
): Promise<void> {
  // 1. Stream AoD output to stream_log
  await streamToLog(runId, aodConversationId)

  // 2. Poll for terminal status
  const terminalStatus = await pollUntilTerminal(runId, aodConversationId)

  // 3. Update run status
  const prismaStatus = terminalStatus === 'complete' ? 'complete'
    : terminalStatus === 'failed' ? 'failed'
    : 'failed' // stopped → failed for Tidepool purposes

  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: prismaStatus,
      completedAt: new Date(),
    },
  })

  // 4. PR detection if completed
  if (prismaStatus === 'complete') {
    await detectPR(runId, workItemId)
  }
}

async function streamToLog(runId: string, aodConversationId: string): Promise<void> {
  try {
    const res = await fetch(
      `${AOD_BASE_URL()}/api/conversations/${aodConversationId}/stream?wait=true`,
      {
        headers: { 'Authorization': `Bearer ${AOD_TOKEN()}` },
      }
    )
    if (!res.ok || !res.body) {
      console.warn('[agent-runner] AoD stream unavailable:', res.status)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data) {
            try {
              const current = await prisma.agentRun.findUnique({ where: { id: runId } })
              const log = (current?.streamLog as Array<{ t: number; data: string }>) ?? []
              log.push({ t: Date.now(), data })
              await prisma.agentRun.update({
                where: { id: runId },
                data: { streamLog: log },
              })
            } catch (err) {
              console.error('[agent-runner] Failed to persist stream event:', err)
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[agent-runner] Stream read error:', err)
  }
}

async function pollUntilTerminal(
  runId: string,
  aodConversationId: string
): Promise<string> {
  const maxAttempts = 120 // 5s * 120 = 10 minutes
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000)

    // Check if already cancelled by user
    const run = await prisma.agentRun.findUnique({ where: { id: runId } })
    if (run?.status === 'cancelled') return 'cancelled'

    try {
      const res = await fetch(
        `${AOD_BASE_URL()}/api/conversations/${aodConversationId}`,
        { headers: { 'Authorization': `Bearer ${AOD_TOKEN()}` } }
      )
      if (!res.ok) continue

      const json = await res.json()
      const status: string = json.data?.status ?? json.status ?? ''
      if (TERMINAL_STATUSES.has(status)) {
        return status
      }
    } catch (err) {
      console.warn('[agent-runner] Status poll error:', err)
    }
  }
  // Timed out — mark failed
  return 'failed'
}

async function detectPR(runId: string, workItemId: string): Promise<void> {
  const workItem = await prisma.workItem.findUnique({ where: { id: workItemId } })
  if (!workItem?.githubBranch || !workItem?.githubRepo) {
    console.warn('[agent-runner] Work item missing githubBranch or githubRepo — skipping PR detection')
    return
  }

  const [owner] = workItem.githubRepo.split('/')
  const branch = workItem.githubBranch
  const repo = workItem.githubRepo
  const url = `https://api.github.com/repos/${repo}/pulls?head=${owner}:${branch}&state=open`

  const maxAttempts = 12 // 10s * 12 = 2 minutes
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(10000)

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN()}`,
          'Accept': 'application/vnd.github+json',
        },
      })
      if (!res.ok) {
        console.warn('[agent-runner] GitHub PR poll failed:', res.status)
        continue
      }
      const prs: GithubPR[] = await res.json()
      if (prs.length > 0) {
        const pr = prs[0]

        // Insert pull_requests row if not already present
        const existing = await prisma.pullRequest.findFirst({
          where: { workItemId, githubPrNumber: pr.number, githubRepo: repo },
        })
        if (!existing) {
          await prisma.pullRequest.create({
            data: {
              workItemId,
              githubPrNumber: pr.number,
              githubRepo: repo,
              title: pr.title,
              state: pr.state,
              headBranch: pr.head.ref,
              baseBranch: pr.base.ref,
              authorHandle: pr.user?.login ?? null,
              additions: pr.additions ?? null,
              deletions: pr.deletions ?? null,
              openedAt: new Date(pr.created_at),
              mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            },
          })
        }

        // Update agent run with PR number
        await prisma.agentRun.update({
          where: { id: runId },
          data: { githubPrNumber: pr.number },
        })

        console.log(`[agent-runner] PR detected: #${pr.number}`)
        return
      }
    } catch (err) {
      console.warn('[agent-runner] PR detection error:', err)
    }
  }

  console.warn('[agent-runner] No PR detected after 2 minutes for run', runId)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GithubPR {
  number: number
  title: string
  state: string
  head: { ref: string }
  base: { ref: string }
  user?: { login: string }
  additions?: number
  deletions?: number
  created_at: string
  merged_at?: string | null
}
