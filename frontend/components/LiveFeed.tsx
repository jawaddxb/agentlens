'use client'

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AgentEvent {
  id: number
  agent_id: number
  trace_id: string
  event_type: string
  data: Record<string, any>
  timestamp: string
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  llm_call: '#2dd4a8',
  tool_call: '#6366f1',
  error: '#d4432d',
  escalation: '#d4a82d',
  user_message: '#8b5cf6',
  agent_response: '#2dd48e',
}

function getEventColor(type: string): string {
  return EVENT_TYPE_COLORS[type] || '#888888'
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '--:--:--'
  }
}

function summarizeData(data: Record<string, any>): string {
  if (!data || Object.keys(data).length === 0) return ''

  const parts: string[] = []

  if (data.tool) parts.push(`tool:${data.tool}`)
  if (data.model) parts.push(`model:${data.model}`)
  if (data.tokens) parts.push(`${data.tokens}tok`)
  if (data.latency_ms) parts.push(`${data.latency_ms}ms`)
  if (data.error) parts.push(String(data.error).slice(0, 40))
  if (data.message) parts.push(String(data.message).slice(0, 40))

  if (parts.length === 0) {
    const firstKey = Object.keys(data)[0]
    const val = data[firstKey]
    parts.push(
      `${firstKey}: ${typeof val === 'object' ? JSON.stringify(val).slice(0, 30) : String(val).slice(0, 30)}`
    )
  }

  return parts.join(' | ')
}

export default function LiveFeed({ events }: { events: AgentEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new events
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current
      // Only auto-scroll if user is near the bottom
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [events])

  const displayEvents = (events || []).slice(-50)

  if (!displayEvents.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No events yet</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[400px] overflow-y-auto rounded-xl border border-border bg-surface"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Live Feed
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted">
          {displayEvents.length} events
        </span>
      </div>

      <AnimatePresence initial={false}>
        {displayEvents.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-3 border-b border-border/50 px-4 py-2.5 transition-colors hover:bg-surface2/50"
          >
            {/* Timestamp */}
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {formatTime(event.timestamp)}
            </span>

            {/* Agent ID */}
            <span className="shrink-0 font-mono text-[11px] text-accent">
              agent:{event.agent_id}
            </span>

            {/* Arrow + Event type */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-[10px] text-muted">&rarr;</span>
              <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium"
                style={{
                  color: getEventColor(event.event_type),
                  backgroundColor: `${getEventColor(event.event_type)}15`,
                }}
              >
                {event.event_type}
              </span>
            </span>

            {/* Data summary */}
            <span className="min-w-0 truncate font-mono text-[10px] text-muted/80">
              {summarizeData(event.data)}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
