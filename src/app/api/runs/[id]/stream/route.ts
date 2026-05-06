import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.agentRun.findUnique({ where: { id: params.id } })
  if (!run) {
    return new Response('Not found', { status: 404 })
  }

  // Last-Event-ID comes via header (native EventSource reconnect) or query param (manual reconnect)
  const lastEventIdHeader = request.headers.get('last-event-id')
  const lastEventIdParam = request.nextUrl.searchParams.get('lastEventId')
  const rawId = lastEventIdHeader ?? lastEventIdParam
  const lastEventId = rawId !== null ? parseInt(rawId, 10) : -1

  const aodBaseUrl = process.env.AOD_BASE_URL!
  const aodToken = process.env.AOD_TOKEN!

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: string, id?: number) {
        let msg = ''
        if (id !== undefined) msg += `id: ${id}\n`
        msg += `data: ${data}\n\n`
        controller.enqueue(encoder.encode(msg))
      }

      // Replay stored log from last-event-id+1
      const storedLog = (run.streamLog as Array<{ t: number; data: string }>) ?? []
      const replayFrom = lastEventId + 1
      for (let i = replayFrom; i < storedLog.length; i++) {
        send(storedLog[i].data, i)
      }

      // If terminal state, drain and close
      if (['complete', 'failed', 'cancelled'].includes(run.status)) {
        // For completed runs, try to stream remaining from AoD with wait=false
        if (run.aodConversationId && run.status === 'complete') {
          try {
            const aodRes = await fetch(
              `${aodBaseUrl}/api/conversations/${run.aodConversationId}/stream?wait=false`,
              {
                headers: { 'Authorization': `Bearer ${aodToken}` },
              }
            )
            if (aodRes.ok && aodRes.body) {
              const reader = aodRes.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''
              let idx = storedLog.length
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
                      // Persist to stream_log
                      const currentRun = await prisma.agentRun.findUnique({ where: { id: params.id } })
                      const log = (currentRun?.streamLog as Array<{ t: number; data: string }>) ?? []
                      log.push({ t: Date.now(), data })
                      await prisma.agentRun.update({
                        where: { id: params.id },
                        data: { streamLog: log },
                      })
                      send(data, idx++)
                    }
                  }
                }
              }
            }
          } catch {
            // best effort drain
          }
        }
        controller.close()
        return
      }

      // Live proxy for running conversation
      if (!run.aodConversationId) {
        controller.close()
        return
      }

      try {
        const aodRes = await fetch(
          `${aodBaseUrl}/api/conversations/${run.aodConversationId}/stream?wait=true`,
          {
            headers: { 'Authorization': `Bearer ${aodToken}` },
            signal: request.signal,
          }
        )

        if (!aodRes.ok || !aodRes.body) {
          send(JSON.stringify({ error: 'AoD stream unavailable' }))
          controller.close()
          return
        }

        const reader = aodRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let idx = storedLog.length

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
                // Persist event to stream_log
                try {
                  const currentRun = await prisma.agentRun.findUnique({ where: { id: params.id } })
                  const log = (currentRun?.streamLog as Array<{ t: number; data: string }>) ?? []
                  log.push({ t: Date.now(), data })
                  await prisma.agentRun.update({
                    where: { id: params.id },
                    data: { streamLog: log },
                  })
                } catch {
                  // best effort persist
                }
                send(data, idx++)
              }
            }
          }
        }
      } catch (err: unknown) {
        // Client disconnected or AoD stream ended — not an error
        if (err instanceof Error && err.name !== 'AbortError') {
          send(JSON.stringify({ error: 'Stream error' }))
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
