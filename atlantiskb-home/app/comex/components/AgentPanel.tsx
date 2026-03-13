'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

interface AgentPanelProps {
  lastSyncDate: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: string[]
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

export default function AgentPanel({ lastSyncDate }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingTick, setThinkingTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    if (!isStreaming) return
    const timer = window.setInterval(() => {
      setThinkingTick((prev) => (prev + 1) % 4)
    }, 320)
    return () => window.clearInterval(timer)
  }, [isStreaming])

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
    setIsStreaming(true)
    setMessages((prev) => [...prev, userMessage, assistantMessage])

    try {
      const res = await fetch('/comex/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history }),
      })

      if (!res.ok) {
        const fallbackMessage = 'Unable to get agent response'
        let diagnosticMessage: string | null = null

        try {
          const bodyText = await res.text()
          const parsedError = JSON.parse(bodyText) as {
            stage?: string
            error?: string
            detail?: string
          }

          const stage = typeof parsedError.stage === 'string' ? parsedError.stage : ''
          const errorMessage = typeof parsedError.error === 'string' ? parsedError.error : ''
          const detailMessage = typeof parsedError.detail === 'string' ? parsedError.detail : ''
          const reason = [errorMessage, detailMessage].filter(Boolean).join(' ')

          if (reason) {
            const stageLabel = stage || 'unknown'
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
      setIsStreaming(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendPrompt(input)
  }

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        padding: 16,
        marginTop: 20,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>COMEX Agent</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Last synced settlement data: {lastSyncDate}
        </p>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg)',
          minHeight: 260,
          maxHeight: 420,
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((message) => {
            const isAssistantThinking = isStreaming && message.role === 'assistant' && !message.content

            return (
              <div
                key={message.id}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: message.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                  color: message.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: message.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  borderRadius: 8,
                  padding: '8px 10px',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.45,
                  fontSize: 13,
                }}
              >
                {isAssistantThinking ? thinkingLabel : message.content}

                {message.role === 'assistant' && message.sources.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                      Sources ({message.sources.length})
                    </summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {message.sources.map((source, index) => {
                        const link = toLink(source)
                        return (
                          <li key={`${source}-${index}`} style={{ marginBottom: 4 }}>
                            {link.href ? (
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)' }}
                              >
                                {link.label}
                              </a>
                            ) : (
                              <span>{link.label}</span>
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
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
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

      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--accent)' }}>
        Not investment advice.
      </p>

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--accent)' }}>
          {error}
        </p>
      )}
    </section>
  )
}
