import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ExecuteView from './ExecuteView'
import EnableFlagPanel from './EnableFlagPanel'
import FollowUpView from './FollowUpView'

export const dynamic = 'force-dynamic'

const STATE_BADGE: Record<string, string> = {
  plan: 'bg-blue-900 text-blue-200',
  executing: 'bg-yellow-900 text-yellow-200',
  shipped: 'bg-green-900 text-green-200',
  done: 'bg-gray-700 text-gray-300',
}

export default async function WorkItemPage({ params }: { params: { id: string } }) {
  const item = await prisma.workItem.findUnique({
    where: { id: params.id },
    include: {
      agentRuns: {
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
      pullRequests: {
        orderBy: { openedAt: 'desc' },
      },
    },
  })
  if (!item) notFound()

  const latestRun = item.agentRuns[0] ?? null
  const initialActiveRun =
    latestRun &&
    (['running', 'pending'].includes(latestRun.status) || latestRun.githubPrNumber !== null)
      ? {
          id: latestRun.id,
          status: latestRun.status,
          githubPrNumber: latestRun.githubPrNumber,
          githubRepo: item.githubRepo,
        }
      : null

  const hasMergedPr = item.pullRequests.some((pr) => pr.state === 'merged')
  const isExecutePhase = item.state === 'plan' || item.state === 'executing'
  const isFollowUpPhase = item.state === 'shipped' || item.state === 'done'

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/work-items" className="text-gray-500 text-sm hover:text-gray-300">
          ← Work Items
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8">
        <h1 className="text-2xl font-semibold leading-tight">{item.title}</h1>
        <span
          className={`shrink-0 inline-block px-3 py-1 rounded text-sm font-medium ${
            STATE_BADGE[item.state] ?? 'bg-gray-700 text-gray-300'
          }`}
        >
          {item.state}
        </span>
      </div>

      <dl className="space-y-5">
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            GitHub Repo
          </dt>
          <dd className="text-sm font-mono text-gray-300">{item.githubRepo}</dd>
        </div>

        {item.githubBranch && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Branch
            </dt>
            <dd className="text-sm font-mono text-gray-300">{item.githubBranch}</dd>
          </div>
        )}

        {item.description && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Description
            </dt>
            <dd className="text-sm text-gray-300 whitespace-pre-wrap">{item.description}</dd>
          </div>
        )}

        {item.featureFlagName && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Feature Flag
            </dt>
            <dd className="text-sm font-mono text-gray-300">{item.featureFlagName}</dd>
          </div>
        )}

        {item.acceptanceMetric && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Acceptance Metric
            </dt>
            <dd className="text-sm text-gray-300">{item.acceptanceMetric}</dd>
          </div>
        )}

        {item.ownerHandles.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Owners
            </dt>
            <dd className="flex gap-2 flex-wrap">
              {item.ownerHandles.map((handle) => (
                <span
                  key={handle}
                  className="text-sm font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded"
                >
                  @{handle}
                </span>
              ))}
            </dd>
          </div>
        )}

        {item.shippedAt && (
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Shipped
            </dt>
            <dd className="text-sm text-gray-300">
              {new Date(item.shippedAt).toLocaleString()}
              {item.posthogRolloutPct !== null && (
                <span className="ml-2 text-gray-500">({item.posthogRolloutPct}% rollout)</span>
              )}
            </dd>
          </div>
        )}

        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Slug</dt>
          <dd className="text-sm font-mono text-gray-500">{item.slug}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Created
          </dt>
          <dd className="text-sm text-gray-500">{new Date(item.createdAt).toLocaleString()}</dd>
        </div>
      </dl>

      {/* Execute phase: prompt input + live stream */}
      {isExecutePhase && (
        <ExecuteView
          workItemId={item.id}
          githubRepo={item.githubRepo}
          initialActiveRun={initialActiveRun}
        />
      )}

      {/* Enable flag panel: shown in executing state once a PR is merged */}
      {item.state === 'executing' && (
        <EnableFlagPanel
          workItemId={item.id}
          featureFlagName={item.featureFlagName}
          hasMergedPr={hasMergedPr}
        />
      )}

      {/* Follow-up phase: Screen 5 (success) or Screen 6 (anomaly) */}
      {isFollowUpPhase && (
        <FollowUpView
          workItemId={item.id}
          workItemTitle={item.title}
          isDone={item.state === 'done'}
        />
      )}
    </div>
  )
}
