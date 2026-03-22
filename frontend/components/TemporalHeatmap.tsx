'use client'

import { useState } from 'react'

interface TemporalHeatmapProps {
  data: number[][] // 7 rows (Mon-Sun) x 24 cols (hours 0-23)
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function cellColor(norm: number): string {
  // Hard thresholds — guaranteed crisp, no interpolation artifacts
  if (norm >= 0.5) {
    // Business hours: bright teal
    const t = Math.min(1, (norm - 0.5) / 0.5)
    const r = Math.round(26 + t * (45 - 26))
    const g = Math.round(122 + t * (212 - 122))
    const b = Math.round(106 + t * (168 - 106))
    return `rgb(${r},${g},${b})`
  } else if (norm >= 0.08) {
    // Shoulder (evening, Saturday): very dark teal
    return '#0f2420'
  } else {
    // Nights / Sunday: near-black
    return '#0b100f'
  }
}

export default function TemporalHeatmap({ data }: TemporalHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ day: string; hour: number; value: number } | null>(null)

  const maxVal = Math.max(...data.flat(), 0.001)

  return (
    <div className="relative w-full select-none">
      {/* Hour axis */}
      <div className="flex mb-1 pl-10">
        {HOURS.map(h => (
          <div
            key={h}
            className="flex-1 text-center"
            style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}
          >
            {h % 3 === 0 ? h : ''}
          </div>
        ))}
      </div>

      {/* Grid */}
      {DAYS.map((day, row) => {
        const rowData = data[row] || new Array(24).fill(0)
        return (
          <div key={day} className="flex items-center mb-0.5">
            {/* Day label */}
            <div
              className="w-10 shrink-0 text-right pr-2"
              style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}
            >
              {day}
            </div>
            {/* Cells */}
            {HOURS.map(col => {
              const value = rowData[col] ?? 0
              const norm = value / maxVal
              const bg = cellColor(norm)
              return (
                <div
                  key={col}
                  className="flex-1 rounded-sm cursor-crosshair"
                  style={{
                    height: '22px',
                    marginRight: '1px',
                    backgroundColor: bg,
                  }}
                  onMouseEnter={() => setTooltip({ day, hour: col, value })}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })}
          </div>
        )
      })}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 pl-10">
        <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>less</span>
        <div className="flex gap-0.5">
          {[0, 0.04, 0.1, 0.5, 0.75, 1.0].map((v, i) => (
            <div
              key={i}
              className="w-5 h-3 rounded-sm"
              style={{ backgroundColor: cellColor(v) }}
            />
          ))}
        </div>
        <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>more</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border border-[--border] bg-[--surface-2] px-3 py-2 shadow-xl"
          style={{ left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: '4px' }}
        >
          <p className="font-mono text-xs text-[--text]">
            {tooltip.day} @ {String(tooltip.hour).padStart(2, '0')}:00
          </p>
          <p className="font-mono text-xs text-[--accent]">
            activity: {(tooltip.value * 100).toFixed(0)}%
          </p>
        </div>
      )}
    </div>
  )
}

export const _VERSION = '20260322-css-grid'
