'use client'

import { useEffect, useRef, useState } from 'react'

interface RunState {
  id: string
  status: string
  githubPrNumber: number | null
  githubRepo: string
}

interface ExecuteViewProps {
  workItemId: string
  githubRepo: string
  initialActiveRun: RunState | null
}

export default function ExecuteView({
  workItemId,
  githubRepo,
  initialActiveRun,
}: ExecuteViewProps) {
  const [activeRun, setActiveRun] = useState<RunState | null>(initialActiveRun)
  const [prompt, setPrompt] = useState('')
  const [followUpPrompt, setFollowUpPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [streamLines, setStreamLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const lastEventIdRef = useRef<number>(-1)

  // Connect SSE when we have an active run
  useEffect(() => {
    if (!activeRun) return
    if (activeRun.status === 'cancelled') return

    const connect = () => {
      const url = `/api/runs/${activeRun.id}/stream`
      const es = new EventSource(
        lastEventIdRef.current >= 0
          ? `${url}?lastEventId=${lastEventIdRef.current}`
          : url
      )
      esRef.current = es

      es.onmessage = (e) => {
        const data = e.data
        if (e.lastEventId) {
          lastEventIdRef.current = parseInt(e.lastEventId, 10)
        }
        setStreamLines((prev) => [...prev, data])
        // Auto-scroll
        requestAnimationFrame(() => {
          if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight
          }
        })
      }

      es.onerror = () => {
        es.close()
      }
    }

    connect()

    return () => {
      esRef.current?.close()
    }
  }, [activeRun?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll run status for PR detection
  useEffect(() => {
    if (!activeRun) return
    if (activeRun.githubPrNumber) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${activeRun.id}`)
        if (!res.ok) return
        const data = await res.json()
        setActiveRun((prev) => prev ? { ...prev, status: data.status, githubPrNumber: data.githubPrNumber } : prev)
        if (['complete', 'failed', 'cancelled'].includes(data.status)) {
          clearInterval(interval)
          esRef.current?.close()
        }
      } catch {
        // ignore
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [activeRun?.id, activeRun?.githubPrNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${workItemId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to start agent run')
        return
      }
      const data = await res.json()
      setActiveRun({
        id: data.runId,
        status: 'running',
        githubPrNumber: null,
        githubRepo,
      })
      setStreamLines([])
      lastEventIdRef.current = -1
      setPrompt('')
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault()
    if (!followUpPrompt.trim() || !activeRun || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/runs/${activeRun.id}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: followUpPrompt.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to send follow-up')
        return
      }
      setFollowUpPrompt('')
      // Resume SSE if not already connected
      if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
        setActiveRun((prev) => prev ? { ...prev, status: 'running' } : prev)
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!activeRun) return
    try {
      await fetch(`/api/runs/${activeRun.id}`, { method: 'DELETE' })
      esRef.current?.close()
      setActiveRun((prev) => prev ? { ...prev, status: 'cancelled' } : prev)
    } catch {
      setError('Cancel failed')
    }
  }

  const statusColor: Record<string, string> = {
    running: 'bg-yellow-900 text-yellow-200',
    complete: 'bg-green-900 text-green-200',
    failed: 'bg-red-900 text-red-200',
    cancelled: 'bg-gray-700 text-gray-400',
    pending: 'bg-blue-900 text-blue-200',
  }

  // 2a — Prompt input (no active run)
  if (!activeRun) {
    return (
      <div className="mt-10 border border-gray-700 rounded-lg p-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Execute
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the change"
            rows={5}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !prompt.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium text-white"
            >
              {submitting ? 'Starting…' : 'Run agent →'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // 2b / 2c — Active run (streaming + follow-up + PR banner)
  return (
    <div className="mt-10 space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-mono">{activeRun.id.slice(0, 8)}</span>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor[activeRun.status] ?? 'bg-gray-700 text-gray-300'}`}
          >
            {activeRun.status}
          </span>
        </div>
        {activeRun.status === 'running' && (
          <button
            onClick={handleCancel}
            className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-1"
          >
            Cancel
          </button>
        )}
      </div>

      {/* PR banner */}
      {activeRun.githubPrNumber && (
        <div className="border border-green-800 bg-green-950 rounded-lg p-4 flex items-center justify-between">
          <span className="text-green-300 text-sm">
            PR #{activeRun.githubPrNumber} opened by agent
          </span>
          <a
            href={`https://github.com/${activeRun.githubRepo}/pull/${activeRun.githubPrNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:text-green-200 text-sm font-medium"
          >
            View on GitHub ↗
          </a>
        </div>
      )}

      {/* Stream output */}
      <div
        ref={streamRef}
        className="bg-gray-950 border border-gray-800 rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs text-gray-300 whitespace-pre-wrap"
      >
        {streamLines.length === 0 ? (
          <span className="text-gray-600">Waiting for agent output…</span>
        ) : (
          streamLines.map((line, i) => {
            // Try to parse JSON for nicer display, fall back to raw
            let display = line
            try {
              const parsed = JSON.parse(line)
              if (typeof parsed === 'object' && parsed !== null) {
                display = parsed.text ?? parsed.content ?? parsed.message ?? line
              }
            } catch {
              // raw line
            }
            return (
              <div key={i} className="mb-0.5">
                {display}
              </div>
            )
          })
        )}
      </div>

      {/* Follow-up prompt */}
      {(activeRun.status === 'running' || activeRun.status === 'complete') && (
        <div className="border border-gray-700 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Follow-up prompt
          </h3>
          <form onSubmit={handleFollowUp} className="space-y-3">
            <textarea
              value={followUpPrompt}
              onChange={(e) => setFollowUpPrompt(e.target.value)}
              placeholder="Send a follow-up instruction…"
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !followUpPrompt.trim() || activeRun.status !== 'running'}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm font-medium text-white"
              >
                {submitting ? 'Sending…' : 'Send follow-up →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Start new run */}
      {['complete', 'failed', 'cancelled'].includes(activeRun.status) && (
        <button
          onClick={() => {
            esRef.current?.close()
            setActiveRun(null)
            setStreamLines([])
            lastEventIdRef.current = -1
          }}
          className="text-sm text-gray-500 hover:text-gray-300 underline"
        >
          ← Start a new run
        </button>
      )}
    </div>
  )
}
