import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-4xl font-bold text-gray-600 mb-4">404</p>
      <p className="text-gray-400 mb-6">This page doesn&apos;t exist.</p>
      <Link href="/work-items" className="text-indigo-400 hover:underline text-sm">
        ← Back to Work Items
      </Link>
    </div>
  )
}
