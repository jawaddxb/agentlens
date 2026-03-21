'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface TemporalHeatmapProps {
  data: number[][] // 7 rows (Mon-Sun) x 24 cols (hours 0-23)
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PADDING = { top: 28, right: 16, bottom: 16, left: 40 }

export default function TemporalHeatmap({ data }: TemporalHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600 })
  const [tooltip, setTooltip] = useState<{
    value: number
    day: string
    hour: number
    x: number
    y: number
  } | null>(null)

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      setDimensions({ width })
    }
  }, [])

  useEffect(() => {
    updateDimensions()
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => updateDimensions())
    observer.observe(container)
    return () => observer.disconnect()
  }, [updateDimensions])

  useEffect(() => {
    if (!svgRef.current || !data?.length) return

    const { width: containerWidth } = dimensions

    const availWidth = containerWidth - PADDING.left - PADDING.right
    const cellSize = Math.max(4, Math.floor(availWidth / 24))
    const cellGap = 2

    const gridWidth = cellSize * 24
    const gridHeight = cellSize * 7
    const totalWidth = gridWidth + PADDING.left + PADDING.right
    const totalHeight = gridHeight + PADDING.top + PADDING.bottom

    // Flatten data to find extent
    const allValues = data.flat()
    const maxVal = d3.max(allValues) ?? 1

    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, maxVal])
      .range(['#1a1a1a', '#2dd4a8'])
      .interpolate(d3.interpolateRgb)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg
      .attr('width', totalWidth)
      .attr('height', totalHeight)
      .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)

    const g = svg.append('g').attr('transform', `translate(${PADDING.left}, ${PADDING.top})`)

    // Hour labels (top)
    g.selectAll('.hour-label')
      .data(d3.range(24))
      .enter()
      .append('text')
      .attr('x', (d) => d * cellSize + cellSize / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888888')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-size', Math.min(9, cellSize * 0.5) + 'px')
      .text((d) => (d % 3 === 0 ? String(d) : ''))

    // Day labels (left)
    g.selectAll('.day-label')
      .data(DAYS)
      .enter()
      .append('text')
      .attr('x', -8)
      .attr('y', (_, i) => i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#888888')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-size', Math.min(10, cellSize * 0.55) + 'px')
      .text((d) => d)

    // Cells
    for (let row = 0; row < Math.min(data.length, 7); row++) {
      const rowData = data[row] || []
      for (let col = 0; col < 24; col++) {
        const value = rowData[col] ?? 0

        g.append('rect')
          .attr('x', col * cellSize + cellGap / 2)
          .attr('y', row * cellSize + cellGap / 2)
          .attr('width', cellSize - cellGap)
          .attr('height', cellSize - cellGap)
          .attr('rx', 2)
          .attr('fill', colorScale(value))
          .attr('stroke', value > 0 ? colorScale(value) : 'transparent')
          .attr('stroke-width', 0.5)
          .attr('stroke-opacity', 0.3)
          .style('cursor', 'crosshair')
          .on('mouseenter', function (event) {
            d3.select(this)
              .attr('stroke', '#eaeaea')
              .attr('stroke-width', 1.5)
              .attr('stroke-opacity', 1)

            const rect = svgRef.current!.getBoundingClientRect()
            setTooltip({
              value,
              day: DAYS[row],
              hour: col,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            })
          })
          .on('mouseleave', function () {
            d3.select(this)
              .attr('stroke', value > 0 ? colorScale(value) : 'transparent')
              .attr('stroke-width', 0.5)
              .attr('stroke-opacity', 0.3)
            setTooltip(null)
          })
      }
    }
  }, [data, dimensions])

  if (!data?.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No heatmap data</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
    >
      <svg ref={svgRef} className="w-full" />
      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 px-1">
        <span className="text-[10px] font-mono" style={{ color: '#888888' }}>less</span>
        <div className="flex gap-0.5">
          {['#1c1c1c','#0e3628','#0d5040','#0d6e57','#0d8c6e','#2dd4a8'].map((c, i) => (
            <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span className="text-[10px] font-mono" style={{ color: '#888888' }}>more</span>
      </div>
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border border-[--border] bg-[--surface-2] px-3 py-2 shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <div className="font-mono text-[10px] text-[--muted]">
            {tooltip.day}, {String(tooltip.hour).padStart(2, '0')}:00
          </div>
          <div className="font-mono text-sm font-semibold text-[--accent]">
            {tooltip.value > 0 ? `${(tooltip.value * 100).toFixed(1)}% activity` : 'No activity'}
          </div>
        </div>
      )}
    </div>
  )
}
