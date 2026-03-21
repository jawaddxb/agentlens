'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface FingerprintNode {
  id: string
  label: string
  type: string
  frequency: number
}

interface FingerprintEdge {
  source: string
  target: string
  weight: number
  avg_sentiment: number
}

const TYPE_COLORS: Record<string, string> = {
  decision: '#2dd4a8',
  tool: '#6366f1',
  response: '#2dd48e',
  error: '#d4432d',
  escalation: '#d4a82d',
}

function getNodeColor(type: string): string {
  return TYPE_COLORS[type] || '#888888'
}

function sentimentColor(sentiment: number): string {
  if (sentiment <= 0.5) {
    const t = sentiment / 0.5
    return d3.interpolateRgb('#d4432d', '#d4a82d')(t)
  }
  const t = (sentiment - 0.5) / 0.5
  return d3.interpolateRgb('#d4a82d', '#2dd48e')(t)
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: string
  frequency: number
  radius: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  avg_sentiment: number
}

export default function FingerprintGraph({
  nodes,
  edges,
}: {
  nodes: FingerprintNode[]
  edges: FingerprintEdge[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 })
  const [tooltip, setTooltip] = useState<{
    node: FingerprintNode
    x: number
    y: number
  } | null>(null)

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const w = rect.width || 600
      const h = rect.height || 380
      setDimensions({ width: w, height: Math.max(h, 320) })
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
    if (!svgRef.current || !nodes?.length) return

    const { width, height } = dimensions

    // Build radius scale
    const freqExtent = d3.extent(nodes, (d) => d.frequency) as [number, number]
    const radiusScale = d3
      .scaleLinear()
      .domain(freqExtent[0] === freqExtent[1] ? [0, freqExtent[1]] : freqExtent)
      .range([10, 40])

    // Build simulation nodes — initialise positions at centre so force sim converges there
    const simNodes: SimNode[] = nodes.map((n, i) => ({
      ...n,
      radius: radiusScale(n.frequency),
      x: width / 2 + (Math.random() - 0.5) * 60,
      y: height / 2 + (Math.random() - 0.5) * 60,
    }))

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]))

    const simLinks: SimLink[] = (edges || [])
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        avg_sentiment: e.avg_sentiment,
      }))

    const weightExtent = d3.extent(simLinks, (d) => d.weight) as [number, number]
    const widthScale = d3
      .scaleLinear()
      .domain(weightExtent[0] === weightExtent[1] ? [0, weightExtent[1] || 1] : weightExtent)
      .range([1, 6])

    // Clear and setup SVG
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    // Defs for glow
    const defs = svg.append('defs')
    const glowFilter = defs
      .append('filter')
      .attr('id', 'fp-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    glowFilter
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '4')
      .attr('result', 'blur')
    glowFilter
      .append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d)

    // Main group for zoom
    const g = svg.append('g')

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Draw links
    const linkGroup = g.append('g').attr('class', 'links')
    const linkSelection = linkGroup
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) => sentimentColor(d.avg_sentiment))
      .attr('stroke-width', (d) => widthScale(d.weight))
      .attr('stroke-opacity', 0.5)

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const nodeSelection = nodeGroup
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .style('cursor', 'grab')

    // Glow circle
    nodeSelection
      .append('circle')
      .attr('r', (d) => d.radius + 6)
      .attr('fill', (d) => getNodeColor(d.type))
      .attr('opacity', 0.08)

    // Main circle
    nodeSelection
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', '#1a1a1a')
      .attr('stroke', (d) => getNodeColor(d.type))
      .attr('stroke-width', 2)
      .attr('filter', 'url(#fp-glow)')

    // Labels
    nodeSelection
      .append('text')
      .text((d) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.radius + 16)
      .attr('fill', '#eaeaea')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')

    // Hover interactions
    nodeSelection
      .on('mouseenter', function (event, d) {
        // Highlight node
        d3.select(this).select('circle:nth-child(2)').attr('stroke-width', 3)
        // Highlight connected edges
        linkSelection
          .attr('stroke-opacity', (l) => {
            const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
            const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
            return src === d.id || tgt === d.id ? 0.9 : 0.1
          })
          .attr('stroke-width', (l) => {
            const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
            const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
            return src === d.id || tgt === d.id
              ? widthScale(l.weight) + 1
              : widthScale(l.weight)
          })

        const rect = svgRef.current!.getBoundingClientRect()
        setTooltip({
          node: d,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      })
      .on('mouseleave', function () {
        d3.select(this).select('circle:nth-child(2)').attr('stroke-width', 2)
        linkSelection
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', (d) => widthScale(d.weight))
        setTooltip(null)
      })

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeSelection.call(drag)

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.08))
      .force('y', d3.forceY(height / 2).strength(0.08))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => d.radius + 10)
      )
      .stop()

    // Run 150 ticks synchronously so nodes are centred before first paint
    for (let i = 0; i < 150; i++) simulation.tick()

    // Paint initial positions
    linkSelection
      .attr('x1', (d) => (d.source as SimNode).x!)
      .attr('y1', (d) => (d.source as SimNode).y!)
      .attr('x2', (d) => (d.target as SimNode).x!)
      .attr('y2', (d) => (d.target as SimNode).y!)
    nodeSelection.attr('transform', (d) => `translate(${d.x},${d.y})`)

    simulation
      .alphaDecay(0.03)
      .restart()
      .on('tick', () => {
        linkSelection
          .attr('x1', (d) => (d.source as SimNode).x!)
          .attr('y1', (d) => (d.source as SimNode).y!)
          .attr('x2', (d) => (d.target as SimNode).x!)
          .attr('y2', (d) => (d.target as SimNode).y!)

        nodeSelection.attr('transform', (d) => `translate(${d.x},${d.y})`)
      })

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, dimensions])

  if (!nodes?.length) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">
          No fingerprint data available
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[500px] w-full overflow-hidden rounded-xl border border-border bg-surface"
    >
      <svg ref={svgRef} className="h-full w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-border bg-surface2 p-3 shadow-xl"
          style={{ left: tooltip.x + 16, top: tooltip.y - 16 }}
        >
          <div className="mb-1 font-mono text-xs font-semibold text-accent">
            {tooltip.node.label}
          </div>
          <div className="font-mono text-[10px] text-muted">
            type:{' '}
            <span style={{ color: getNodeColor(tooltip.node.type) }}>
              {tooltip.node.type}
            </span>
          </div>
          <div className="font-mono text-[10px] text-text">
            frequency: {tooltip.node.frequency}
          </div>
        </div>
      )}
    </div>
  )
}
