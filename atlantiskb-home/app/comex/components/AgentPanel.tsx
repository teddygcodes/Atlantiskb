'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'

interface AgentPanelProps {
  lastSyncDate: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: string[]
}

interface NewsSyncSourceResult {
  source: string
  fetched: number
  relevant: number
  inserted: number
  skipped: number
  errored: number
  errors?: string[]
}

interface NewsSyncResponse {
  ok: boolean
  message?: string
  totals?: {
    inserted?: number
  }
  results?: NewsSyncSourceResult[]
}

const STARTER_CHIPS = [
  'What moved copper prices this week?',
  'Summarize the latest aluminum outlook.',
  'Any notable COMEX-related supply risks?',
]

const SOURCES_BLOCK_REGEX = /\[SOURCES\]([\s\S]*?)\[\/SOURCES\]/i

function parseEventText(dataLine: string): string {
  if (!dataLine || dataLine === '[DONE]') return ''

  try {
    const parsed = JSON.parse(dataLine) as {
      type?: string
      delta?: { type?: string; text?: string }
      text?: string
      completion?: string
    }

    if (typeof parsed.delta?.text === 'string') return parsed.delta.text
    if (parsed.type === 'content_block_delta' && typeof parsed.delta?.text === 'string') {
      return parsed.delta.text
    }
    if (typeof parsed.text === 'string') return parsed.text
    if (typeof parsed.completion === 'string') return parsed.completion
  } catch {
    return ''
  }

  return ''
}

function extractSources(raw: string): { visible: string; sources: string[] } {
  const match = raw.match(SOURCES_BLOCK_REGEX)
  if (!match) {
    return { visible: raw.trim(), sources: [] }
  }

  const block = match[1] ?? ''
  const lines = block
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

  const visible = raw.replace(SOURCES_BLOCK_REGEX, '').trim()
  return { visible, sources: lines }
}

function toLink(source: string): { href: string; label: string } {
  const markdownMatch = source.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)$/i)
  if (markdownMatch) {
    return { label: markdownMatch[1], href: markdownMatch[2] }
  }

  const plainUrlMatch = source.match(/https?:\/\/\S+/i)
  if (plainUrlMatch) {
    return { label: source, href: plainUrlMatch[0] }
  }

  return { label: source, href: '' }
}

function renderInlineBold(text: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g)

  return segments.map((segment, index) => {
    const boldMatch = segment.match(/^\*\*([^*]+)\*\*$/)
    if (!boldMatch) {
      return <span key={`text-${index}`}>{segment}</span>
    }

    return (
      <strong key={`bold-${index}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
        {boldMatch[1]}
      </strong>
    )
  })
}

function isHeadingLike(line: string): boolean {
  return /^#{1,2}\s+/.test(line) || /^\*\*[^*]{2,80}:\*\*$/.test(line) || /^[A-Z][^\n:]{1,80}:$/.test(line)
}

function renderAssistantContent(content: string): ReactNode {
  const blocks = content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length === 0) {
    return null
  }

  return blocks.map((block, blockIndex) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const listLines = lines.filter((line) => /^[-*]\s+/.test(line))
    if (listLines.length === lines.length) {
      return (
        <ul key={`list-${blockIndex}`} style={{ margin: '2px 0', paddingLeft: 16, color: 'var(--text-primary)' }}>
          {listLines.map((line, lineIndex) => (
            <li key={`item-${blockIndex}-${lineIndex}`} style={{ margin: '1px 0', lineHeight: 1.4 }}>
              {renderInlineBold(line.replace(/^[-*]\s+/, ''))}
            </li>
          ))}
        </ul>
      )
    }

    if (lines.length === 1 && isHeadingLike(lines[0])) {
      const normalizedHeading = lines[0].replace(/^#{1,2}\s+/, '').replace(/^\*\*|\*\*$/g, '')
      return (
        <p
          key={`heading-${blockIndex}`}
          style={{ margin: '4px 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}
        >
          {renderInlineBold(normalizedHeading)}
        </p>
      )
    }

    return (
      <p key={`paragraph-${blockIndex}`} style={{ margin: '2px 0', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {renderInlineBold(lines.join(' '))}
      </p>
    )
  })
}

export default function AgentPanel({ lastSyncDate }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingTick, setThinkingTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [supportRequestId, setSupportRequestId] = useState<string | null>(null)
  const [isNewsSyncing, setIsNewsSyncing] = useState(false)
  const [newsSyncError, setNewsSyncError] = useState<string | null>(null)
  const [newsSyncResult, setNewsSyncResult] = useState<NewsSyncResponse | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)
  const flushTimeoutRef = useRef<number | null>(null)

  function updateNearBottom() {
    const container = messagesContainerRef.current
    if (!container) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    nearBottomRef.current = distanceFromBottom <= 80
  }

  function scrollMessagesToBottom() {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    nearBottomRef.current = true
  }

  useEffect(() => {
    if (!isStreaming) return
    const timer = window.setInterval(() => {
      setThinkingTick((prev) => (prev + 1) % 4)
    }, 320)
    return () => window.clearInterval(timer)
  }, [isStreaming])

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
    }
  }, [])

  const thinkingLabel = useMemo(() => {
    return `Thinking${'.'.repeat(thinkingTick)}`
  }, [thinkingTick])

  async function sendPrompt(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed || isStreaming) return

    const history = messages
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content.trim().length > 0)

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: trimmed,
      sources: [],
    }

    const assistantId = `${Date.now()}-assistant`
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      sources: [],
    }

    setInput('')
    setError(null)
    setSupportRequestId(null)
    setIsStreaming(true)
    setMessages((prev) => [...prev, userMessage, assistantMessage])

    if (nearBottomRef.current) {
      requestAnimationFrame(scrollMessagesToBottom)
    }

    try {
      const res = await fetch('/comex/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history }),
      })

      if (!res.ok) {
        const fallbackMessage = 'Unable to get agent response'
        const requestIdFromHeader = res.headers.get('x-request-id') || ''
        if (requestIdFromHeader) {
          setSupportRequestId(requestIdFromHeader)
        }

        let diagnosticMessage: string | null = null

        try {
          const bodyText = await res.text()
          const parsedError = JSON.parse(bodyText) as {
            stage?: string
            error?: string
            detail?: string
            code?: string
            requestId?: string
          }

          const stage = typeof parsedError.stage === 'string' ? parsedError.stage : ''
          const errorMessage = typeof parsedError.error === 'string' ? parsedError.error : ''
          const detailMessage = typeof parsedError.detail === 'string' ? parsedError.detail : ''
          const code = typeof parsedError.code === 'string' ? parsedError.code : ''
          const requestIdFromBody = typeof parsedError.requestId === 'string' ? parsedError.requestId : ''
          const requestId = requestIdFromBody || res.headers.get('x-request-id') || ''
          const reason = [errorMessage, detailMessage].filter(Boolean).join(' ')

          if (requestId) {
            setSupportRequestId(requestId)
          }

          if (reason) {
            const stageLabel = stage || code || 'unknown'
            diagnosticMessage = `Agent error [${stageLabel}]: ${reason}`
          }
        } catch {
          // Fall through to generic message when body parsing fails.
        }

        throw new Error(diagnosticMessage ?? fallbackMessage)
      }

      if (!res.body) {
        throw new Error('Unable to get agent response')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantRaw = ''

      const flushAssistantUpdate = () => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: assistantRaw,
                }
              : msg,
          ),
        )

        if (nearBottomRef.current) {
          scrollMessagesToBottom()
        }
      }

      const scheduleAssistantFlush = () => {
        if (flushTimeoutRef.current !== null) return

        flushTimeoutRef.current = window.setTimeout(() => {
          flushTimeoutRef.current = null
          flushAssistantUpdate()
        }, 60)
      }

      const flushAssistantNow = () => {
        if (flushTimeoutRef.current !== null) {
          window.clearTimeout(flushTimeoutRef.current)
          flushTimeoutRef.current = null
        }
        flushAssistantUpdate()
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let boundaryIndex = buffer.indexOf('\n\n')
        while (boundaryIndex !== -1) {
          const eventChunk = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)

          const lines = eventChunk
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)

          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const dataLine = line.replace(/^data:\s*/, '')
            const nextText = parseEventText(dataLine)
            if (!nextText) continue

            assistantRaw += nextText
            scheduleAssistantFlush()
          }

          boundaryIndex = buffer.indexOf('\n\n')
        }
      }

      if (buffer.trim()) {
        const fallbackLines = buffer
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))

        for (const line of fallbackLines) {
          const dataLine = line.replace(/^data:\s*/, '')
          const nextText = parseEventText(dataLine)
          if (!nextText) continue
          assistantRaw += nextText
        }
      }

      flushAssistantNow()

      const parsed = extractSources(assistantRaw)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: parsed.visible,
                sources: parsed.sources,
              }
            : msg,
        ),
      )
    } catch (streamError) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Sorry, I could not complete that response. Please try again.',
                sources: [],
              }
            : msg,
        ),
      )
      setError(streamError instanceof Error ? streamError.message : 'Unknown error')
    } finally {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      setIsStreaming(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendPrompt(input)
  }

  async function handleNewsSync() {
    if (isNewsSyncing) return

    setIsNewsSyncing(true)
    setNewsSyncError(null)

    try {
      const res = await fetch('/comex/api/news/sync')
      const json = (await res.json()) as NewsSyncResponse

      if (!res.ok) {
        throw new Error(json.message ?? 'News sync request failed')
      }

      setNewsSyncResult(json)
    } catch (syncError) {
      setNewsSyncError(syncError instanceof Error ? syncError.message : 'News sync failed')
    } finally {
      setIsNewsSyncing(false)
    }
  }

  const sourceErrors = (newsSyncResult?.results ?? [])
    .filter((result) => (result.errors ?? []).length > 0)
    .map((result) => ({
      source: result.source,
      errors: result.errors ?? [],
    }))

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        padding: 22,
      }}
    >
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>COMEX Agent</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Last synced settlement data: {lastSyncDate}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleNewsSync()}
          disabled={isNewsSyncing}
          style={{
            border: 'none',
            borderRadius: 6,
            background: isNewsSyncing ? 'var(--text-muted)' : 'var(--accent)',
            color: '#fff',
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: isNewsSyncing ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {isNewsSyncing ? 'Syncing News…' : 'Sync News'}
        </button>
      </div>

      {isNewsSyncing && (
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
          Running news/article ingestion sync…
        </p>
      )}

      {newsSyncError && (
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--accent)' }}>
          News sync error: {newsSyncError}
        </p>
      )}

      {newsSyncResult && (
        <div
          style={{
            marginBottom: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg)',
            padding: '8px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Status:</strong>{' '}
            {newsSyncResult.ok ? 'sync_completed' : newsSyncResult.message ?? 'sync_failed'}
            {' · '}
            <strong style={{ color: 'var(--text-primary)' }}>totals.inserted:</strong>{' '}
            {newsSyncResult.totals?.inserted ?? 0}
          </div>

          {(newsSyncResult.results ?? []).length > 0 && (
            <div style={{ display: 'grid', gap: 3 }}>
              {newsSyncResult.results?.map((result) => (
                <div key={result.source}>
                  <strong style={{ color: 'var(--text-primary)' }}>{result.source}:</strong> fetched {result.fetched} · relevant{' '}
                  {result.relevant} · inserted {result.inserted} · skipped {result.skipped} · errored {result.errored}
                </div>
              ))}
            </div>
          )}

          {sourceErrors.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Source errors:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {sourceErrors.flatMap((source) =>
                  source.errors.map((message, index) => (
                    <li key={`${source.source}-${index}`}>
                      {source.source}: {message}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={updateNearBottom}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg)',
          minHeight: 320,
          maxHeight: 520,
          overflowY: 'auto',
          padding: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isStreaming}
                onClick={() => void sendPrompt(chip)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  background: 'var(--surface)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((message) => {
            const isAssistantThinking = isStreaming && message.role === 'assistant' && !message.content

            return (
              <div
                key={message.id}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  background: message.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                  color: message.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: message.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  borderRadius: 8,
                  padding: '7px 10px',
                  lineHeight: 1.4,
                  fontSize: 13,
                }}
              >
                {isAssistantThinking
                  ? thinkingLabel
                  : message.role === 'assistant'
                    ? renderAssistantContent(message.content)
                    : message.content}

                {message.role === 'assistant' && message.sources.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary
                      style={{
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        listStylePosition: 'inside',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '3px 8px',
                      }}
                    >
                      Sources ({message.sources.length})
                    </summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
                      {message.sources.map((source, index) => {
                        const link = toLink(source)
                        return (
                          <li key={`${source}-${index}`} style={{ margin: 0, lineHeight: 1.35 }}>
                            {link.href ? (
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              >
                                {link.label}
                              </a>
                            ) : (
                              <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{link.label}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about COMEX trends..."
          disabled={isStreaming}
          style={{
            flex: 1,
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '9px 10px',
            fontSize: 13,
            background: 'var(--surface)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          style={{
            border: 'none',
            borderRadius: 6,
            background: isStreaming || !input.trim() ? 'var(--text-muted)' : 'var(--accent)',
            color: '#fff',
            padding: '9px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isStreaming ? 'Streaming…' : 'Ask'}
        </button>
      </form>

      <p style={{ margin: '9px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
        Not investment advice.
      </p>


      {error && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          {error}
        </p>
      )}

      {supportRequestId && (
        <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
          If you contact support, include request ID: <code>{supportRequestId}</code>
        </p>
      )}
    </section>
  )
}
