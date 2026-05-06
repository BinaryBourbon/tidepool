import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tidepool',
  description: 'Workspace replacing the IDE',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-gray-800 px-6 py-4">
          <a
            href="/work-items"
            className="text-xl font-semibold tracking-tight text-white hover:text-gray-200"
          >
            Tidepool
          </a>
        </header>
        <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
      </body>
    </html>
  )
}
