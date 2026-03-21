'use client'

import { useMemo } from 'react'

interface DriftSparklineProps {
  values: number[]
}

export default function DriftSparkline({ values }: DriftSparklineProps) {
  const { pathLine, pathArea, lastValue, color } = useMemo(() => {
    if (!values?.length) {
      return { pathLine: '', pathArea: '', lastValue: null, color: '#888888' }
    }

    const data = values
    const width = 120
    const height = 40
    const padding = 2

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    const points = data.map((v, i) => ({
      x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
      y: padding + (1 - (v - min) / range) * (height - padding * 2),
    }))

    // Build SVG path for line
    let linePath = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      // Smooth curve using quadratic bezier
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      linePath += ` Q ${cpx},${prev.y} ${curr.x},${curr.y}`
    }

    // Build area path (close at bottom)
    const areaPath =
      linePath +
      ` L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`

    const last = data[data.length - 1]

    // Color based on trend: compare last vs first half average
    const halfLen = Math.floor(data.length / 2)
    const firstHalf = data.slice(0, halfLen)
    const secondHalf = data.slice(halfLen)
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1)
    const avgSecond =
      secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1)

    let trendColor = '#2dd4a8' // accent - stable
    if (avgSecond > avgFirst * 1.2) {
      trendColor = '#d4432d' // danger - increasing drift
    } else if (avgSecond > avgFirst * 1.05) {
      trendColor = '#d4a82d' // warning - slight increase
    }

    return {
      pathLine: linePath,
      pathArea: areaPath,
      lastValue: last,
      color: trendColor,
    }
  }, [values])

  if (!values?.length) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted">
        --
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={120}
        height={40}
        viewBox="0 0 120 40"
        className="shrink-0"
        style={{ overflow: 'visible' }}
      >
        {/* Area fill */}
        <path d={pathArea} fill={color} fillOpacity={0.1} />

        {/* Line */}
        <path
          d={pathLine}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End dot */}
        {values.length > 0 && (
          <>
            <circle
              cx={
                2 +
                ((values.length - 1) / Math.max(values.length - 1, 1)) *
                  (120 - 4)
              }
              cy={(() => {
                const min = Math.min(...values)
                const max = Math.max(...values)
                const range = max - min || 1
                return (
                  2 +
                  (1 - (values[values.length - 1] - min) / range) * (40 - 4)
                )
              })()}
              r={3}
              fill={color}
            />
            <circle
              cx={
                2 +
                ((values.length - 1) / Math.max(values.length - 1, 1)) *
                  (120 - 4)
              }
              cy={(() => {
                const min = Math.min(...values)
                const max = Math.max(...values)
                const range = max - min || 1
                return (
                  2 +
                  (1 - (values[values.length - 1] - min) / range) * (40 - 4)
                )
              })()}
              r={6}
              fill={color}
              fillOpacity={0.2}
            />
          </>
        )}
      </svg>

      {lastValue !== null && (
        <span
          className="font-mono text-xs font-semibold tabular-nums"
          style={{ color }}
        >
          {lastValue.toFixed(2)}
        </span>
      )}
    </span>
  )
}
