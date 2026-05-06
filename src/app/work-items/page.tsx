import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const STATE_BADGE: Record<string, string> = {
  plan: 'bg-blue-900 text-blue-200',
  executing: 'bg-yellow-900 text-yellow-200',
  shipped: 'bg-green-900 text-green-200',
  done: 'bg-gray-700 text-gray-300',
}

export default async function WorkItemsPage() {
  const items = await prisma.workItem.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Work Items</h1>
        <Link
          href="/work-items/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-medium"
        >
          New Work Item
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No work items yet.{' '}
          <Link href="/work-items/new" className="text-indigo-400 hover:underline">
            Create one.
          </Link>
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="pb-3 pr-6 font-medium">Title</th>
              <th className="pb-3 pr-6 font-medium">Repo</th>
              <th className="pb-3 pr-6 font-medium">State</th>
              <th className="pb-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-900/40">
                <td className="py-3 pr-6">
                  <Link
                    href={`/work-items/${item.id}`}
                    className="text-indigo-400 hover:underline"
                  >
                    {item.title}
                  </Link>
                </td>
                <td className="py-3 pr-6 text-gray-400 font-mono text-xs">{item.githubRepo}</td>
                <td className="py-3 pr-6">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATE_BADGE[item.state] ?? 'bg-gray-700 text-gray-300'}`}
                  >
                    {item.state}
                  </span>
                </td>
                <td className="py-3 text-gray-500 text-xs">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
