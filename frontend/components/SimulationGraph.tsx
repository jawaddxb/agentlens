'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface TwinState {
  twin_id: string
  state: string
  decisions: Record<string, any>[]
  current_step: string | null
}

const STATE_COLORS: Record<string, string> = {
  idle: '#888888',
  thinking: '#2dd4a8',
  complete: '#2dd48e',
  error: '#d4432d',
}

function getStateColor(state: string): string {
  return STATE_COLORS[state] || '#888888'
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  state: string
  isHub: boolean
  radius: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string
}

export default function SimulationGraph({
  twins,
  isRunning,
}: {
  twins: TwinState[]
  isRunning: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 })

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect()
      setDimensions({ width, height: Math.max(height, 400) })
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
    if (!svgRef.current || !twins?.length) return

    const { width, height } = dimensions

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    // Defs
    const defs = svg.append('defs')

    // Pulse glow filter
    const pulseFilter = defs
      .append('filter')
      .attr('id', 'sim-pulse')
      .attr('x', '-100%')
      .attr('y', '-100%')
      .attr('width', '300%')
      .attr('height', '300%')
    pulseFilter
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '6')
      .attr('result', 'blur')
    pulseFilter
      .append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d)

    // Build nodes: hub + twins
    const hubNode: SimNode = {
      id: '__hub__',
      label: 'Scenario',
      state: isRunning ? 'thinking' : 'idle',
      isHub: true,
      radius: 20,
      x: width / 2,
      y: height / 2,
    }

    const twinNodes: SimNode[] = twins.map((t) => ({
      id: t.twin_id,
      label: t.twin_id,
      state: t.state,
      isHub: false,
      radius: 12,
    }))

    const allNodes: SimNode[] = [hubNode, ...twinNodes]

    // Build links: hub -> each twin
    const links: SimLink[] = twinNodes.map((t) => ({
      source: '__hub__',
      target: t.id,
      id: `hub-${t.id}`,
    }))

    // Add links between twins that share decision keys
    const twinDecisionKeys = new Map<string, Set<string>>()
    twins.forEach((t) => {
      const keys = new Set<string>()
      ;(t.decisions || []).forEach((d) => {
        Object.keys(d).forEach((k) => keys.add(k))
      })
      twinDecisionKeys.set(t.twin_id, keys)
    })

    for (let i = 0; i < twins.length; i++) {
      for (let j = i + 1; j < twins.length; j++) {
        const keysA = twinDecisionKeys.get(twins[i].twin_id)!
        const keysB = twinDecisionKeys.get(twins[j].twin_id)!
        let overlap = false
        keysA.forEach((k) => {
          if (keysB.has(k)) overlap = true
        })
        if (overlap) {
          links.push({
            source: twins[i].twin_id,
            target: twins[j].twin_id,
            id: `${twins[i].twin_id}-${twins[j].twin_id}`,
          })
        }
      }
    }

    const g = svg.append('g')

    // Zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Draw links
    const linkSelection = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => {
        const src = typeof d.source === 'string' ? d.source : (d.source as SimNode).id
        return src === '__hub__' ? '#333333' : '#2a2a2a'
      })
      .attr('stroke-width', (d) => {
        const src = typeof d.source === 'string' ? d.source : (d.source as SimNode).id
        return src === '__hub__' ? 1.5 : 0.8
      })
      .attr('stroke-dasharray', (d) => {
        const src = typeof d.source === 'string' ? d.source : (d.source as SimNode).id
        return src === '__hub__' ? 'none' : '3,3'
      })

    // Draw nodes
    const nodeSelection = g
      .append('g')
      .selectAll('g')
      .data(allNodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')

    // Pulse ring for thinking nodes
    nodeSelection
      .filter((d) => d.state === 'thinking' && isRunning)
      .append('circle')
      .attr('r', (d) => d.radius + 8)
      .attr('fill', 'none')
      .attr('stroke', '#2dd4a8')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .each(function pulse() {
        d3.select(this)
          .transition()
          .duration(1200)
          .attr('r', function () {
            const d = d3.select(this).datum() as SimNode
            return d.radius + 20
          })
          .attr('opacity', 0.6)
          .transition()
          .duration(1200)
          .attr('r', function () {
            const d = d3.select(this).datum() as SimNode
            return d.radius + 8
          })
          .attr('opacity', 0)
          .on('end', function () {
            if (isRunning) pulse.call(this)
          })
      })

    // Ambient glow for thinking
    nodeSelection
      .filter((d) => d.state === 'thinking' && isRunning)
      .append('circle')
      .attr('r', (d) => d.radius + 6)
      .attr('fill', '#2dd4a8')
      .attr('opacity', 0.12)
      .attr('filter', 'url(#sim-pulse)')

    // Main circle
    nodeSelection
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => (d.isHub ? '#232323' : '#1a1a1a'))
      .attr('stroke', (d) => getStateColor(d.state))
      .attr('stroke-width', (d) => (d.isHub ? 2.5 : 2))

    // Inner dot
    nodeSelection
      .append('circle')
      .attr('r', (d) => (d.isHub ? 5 : 3))
      .attr('fill', (d) => getStateColor(d.state))

    // Labels
    nodeSelection
      .append('text')
      .text((d) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.radius + 16)
      .attr('fill', (d) => (d.isHub ? '#eaeaea' : '#888888'))
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-size', (d) => (d.isHub ? '11px' : '9px'))
      .attr('font-weight', (d) => (d.isHub ? '600' : '400'))
      .attr('pointer-events', 'none')

    // Current step label for twins
    nodeSelection
      .filter((d) => !d.isHub)
      .each(function (d) {
        const twin = twins.find((t) => t.twin_id === d.id)
        if (twin?.current_step) {
          d3.select(this)
            .append('text')
            .text(twin.current_step)
            .attr('text-anchor', 'middle')
            .attr('dy', d.radius + 26)
            .attr('fill', '#555555')
            .attr('font-family', "'JetBrains Mono', monospace")
            .attr('font-size', '8px')
            .attr('pointer-events', 'none')
        }
      })

    // Simulation
    const simulation = d3
      .forceSimulation<SimNode>(allNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const src = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
            return src === '__hub__' ? 120 : 80
          })
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => d.radius + 12)
      )
      .alphaDecay(0.03)
      .on('tick', () => {
        linkSelection
          .attr('x1', (d) => (d.source as SimNode).x!)
          .attr('y1', (d) => (d.source as SimNode).y!)
          .attr('x2', (d) => (d.target as SimNode).x!)
          .attr('y2', (d) => (d.target as SimNode).y!)

        nodeSelection.attr('transform', (d) => `translate(${d.x},${d.y})`)
      })

    // Drag
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

    return () => {
      simulation.stop()
    }
  }, [twins, isRunning, dimensions])

  if (!twins?.length) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">
          No simulation twins available
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
      {isRunning && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-surface2/80 px-2.5 py-1 backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="font-mono text-[10px] text-accent">Running</span>
        </div>
      )}
    </div>
  )
}
