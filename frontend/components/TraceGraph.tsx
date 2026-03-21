'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'

interface AgentEvent {
  id: number
  agent_id: number
  trace_id: string
  event_type: string
  data: Record<string, any>
  timestamp: string
}

interface Trace {
  id: string
  agent_id: number
  events: AgentEvent[]
  start_time: string
  end_time: string
  duration_ms: number
  status: string
}

const EVENT_COLORS: Record<string, string> = {
  llm_call: '#2dd4a8',
  tool_call: '#6366f1',
  user_message: '#8b5cf6',
  error: '#d4432d',
  agent_response: '#2dd48e',
}

const NODE_RADIUS = 20
const VERTICAL_SPACING = 80
const PADDING = { top: 40, right: 60, bottom: 40, left: 60 }

function getEventColor(eventType: string): string {
  return EVENT_COLORS[eventType] || '#888888'
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface TooltipData {
  event: AgentEvent
  x: number
  y: number
}

export default function TraceGraph({ trace }: { trace: Trace }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [visibleNodes, setVisibleNodes] = useState(0)

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      const events = trace?.events ?? []
      const height = Math.max(
        300,
        events.length * VERTICAL_SPACING + PADDING.top + PADDING.bottom
      )
      setDimensions({ width, height })
    }
  }, [trace])

  useEffect(() => {
    updateDimensions()
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => updateDimensions())
    observer.observe(container)
    return () => observer.disconnect()
  }, [updateDimensions])

  useEffect(() => {
    const events = trace?.events ?? []
    if (events.length === 0) return

    let timer: ReturnType<typeof setTimeout>
    let count = 0

    const reveal = () => {
      count++
      setVisibleNodes(count)
      if (count < events.length) {
        timer = setTimeout(reveal, 100)
      }
    }
    reveal()

    return () => clearTimeout(timer)
  }, [trace])

  useEffect(() => {
    if (!svgRef.current || !trace?.events?.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { width, height } = dimensions
    const events = trace.events

    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    const defs = svg.append('defs')

    // Drop shadow filter
    const filter = defs
      .append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')

    filter
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '3')
      .attr('result', 'blur')

    filter
      .append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d)

    const centerX = width / 2

    // Draw edges
    const edgeGroup = svg.append('g').attr('class', 'edges')

    for (let i = 0; i < events.length - 1; i++) {
      if (i >= visibleNodes - 1) break

      const y1 = PADDING.top + i * VERTICAL_SPACING + NODE_RADIUS
      const y2 = PADDING.top + (i + 1) * VERTICAL_SPACING - NODE_RADIUS

      const t1 = new Date(events[i].timestamp).getTime()
      const t2 = new Date(events[i + 1].timestamp).getTime()
      const latency = Math.max(0, t2 - t1)

      // Curved connector with visible color
      const midY = (y1 + y2) / 2
      edgeGroup
        .append('path')
        .attr('d', `M ${centerX} ${y1} C ${centerX} ${midY}, ${centerX} ${midY}, ${centerX} ${y2}`)
        .attr('stroke', getEventColor(events[i].event_type))
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.4)
        .attr('fill', 'none')

      // Arrow marker at end
      edgeGroup
        .append('polygon')
        .attr('points', `${centerX - 4},${y2 - 6} ${centerX + 4},${y2 - 6} ${centerX},${y2}`)
        .attr('fill', getEventColor(events[i].event_type))
        .attr('opacity', 0.5)

      if (latency > 0) {
        edgeGroup
          .append('text')
          .attr('x', centerX + 30)
          .attr('y', (y1 + y2) / 2 + 4)
          .attr('fill', '#888888')
          .attr('font-family', "'JetBrains Mono', monospace")
          .attr('font-size', '10px')
          .text(formatLatency(latency))
      }
    }

    // Draw nodes
    const nodeGroup = svg.append('g').attr('class', 'nodes')

    for (let i = 0; i < Math.min(events.length, visibleNodes); i++) {
      const event = events[i]
      const cy = PADDING.top + i * VERTICAL_SPACING
      const color = getEventColor(event.event_type)

      const g = nodeGroup
        .append('g')
        .attr('transform', `translate(${centerX}, ${cy})`)
        .style('cursor', 'pointer')

      // Glow circle
      g.append('circle')
        .attr('r', NODE_RADIUS + 4)
        .attr('fill', color)
        .attr('opacity', 0.1)

      // Main circle
      g.append('circle')
        .attr('r', NODE_RADIUS)
        .attr('fill', '#1a1a1a')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('filter', 'url(#node-glow)')

      // Inner dot
      g.append('circle').attr('r', 4).attr('fill', color)

      // Label
      g.append('text')
        .attr('x', NODE_RADIUS + 16)
        .attr('y', 1)
        .attr('fill', '#eaeaea')
        .attr('font-family', "'JetBrains Mono', monospace")
        .attr('font-size', '12px')
        .attr('dominant-baseline', 'middle')
        .text(event.event_type)

      // Step number
      g.append('text')
        .attr('x', -(NODE_RADIUS + 16))
        .attr('y', 1)
        .attr('fill', '#888888')
        .attr('font-family', "'JetBrains Mono', monospace")
        .attr('font-size', '10px')
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text(`#${i + 1}`)

      // Hover interaction
      g.on('mouseenter', function (mouseEvent) {
        d3.select(this).select('circle:nth-child(2)').attr('stroke-width', 3)
        const rect = svgRef.current!.getBoundingClientRect()
        setTooltip({
          event,
          x: mouseEvent.clientX - rect.left,
          y: mouseEvent.clientY - rect.top,
        })
      }).on('mouseleave', function () {
        d3.select(this).select('circle:nth-child(2)').attr('stroke-width', 2)
        setTooltip(null)
      })
    }
  }, [trace, dimensions, visibleNodes])

  if (!trace?.events?.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No events in this trace</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} className="w-full" />
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-border bg-surface2 p-3 shadow-xl"
            style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
          >
            <div className="mb-1 font-mono text-xs text-accent">
              {tooltip.event.event_type}
            </div>
            <div className="mb-1 font-mono text-[10px] text-muted">
              {new Date(tooltip.event.timestamp).toLocaleTimeString()}
            </div>
            {Object.entries(tooltip.event.data || {})
              .slice(0, 4)
              .map(([key, val]) => (
                <div key={key} className="font-mono text-[10px] text-text">
                  <span className="text-muted">{key}:</span>{' '}
                  {typeof val === 'object' ? JSON.stringify(val).slice(0, 60) : String(val).slice(0, 60)}
                </div>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
