import Link from 'next/link'
import { createWorkItem } from './actions'

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 placeholder:text-gray-600'

export default function NewWorkItemPage() {
  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/work-items" className="text-gray-500 text-sm hover:text-gray-300">
          ← Work Items
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New Work Item</h1>
      </div>

      <form action={createWorkItem} className="space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input type="text" id="title" name="title" required className={inputClass} />
        </div>

        <div>
          <label htmlFor="githubRepo" className="block text-sm font-medium text-gray-300 mb-1">
            GitHub Repo <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="githubRepo"
            name="githubRepo"
            required
            placeholder="owner/repo"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea id="description" name="description" rows={4} className={inputClass} />
        </div>

        <div>
          <label
            htmlFor="featureFlagName"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Feature Flag Name
          </label>
          <input
            type="text"
            id="featureFlagName"
            name="featureFlagName"
            placeholder="e.g. checkout-v2"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label
            htmlFor="acceptanceMetric"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Acceptance Metric
          </label>
          <input
            type="text"
            id="acceptanceMetric"
            name="acceptanceMetric"
            placeholder="e.g. checkout funnel +5pp"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ownerHandles" className="block text-sm font-medium text-gray-300 mb-1">
            Owners{' '}
            <span className="text-gray-500 font-normal">(comma-separated GitHub handles)</span>
          </label>
          <input
            type="text"
            id="ownerHandles"
            name="ownerHandles"
            placeholder="alice, bob"
            className={inputClass}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded text-sm font-medium"
          >
            Create Work Item
          </button>
          <Link href="/work-items" className="text-gray-400 hover:text-gray-200 px-4 py-2 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
