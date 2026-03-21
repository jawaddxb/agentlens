'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

interface DivergenceChartProps {
  data: {
    labels: string[]
    baseline: number[]
    current: number[]
  }
  divergenceScore: number
}

function getDivergenceColor(score: number): string {
  if (score < 0.3) return '#2dd48e' // success
  if (score < 0.6) return '#d4a82d' // warning
  return '#d4432d' // danger
}

export default function DivergenceChart({
  data,
  divergenceScore,
}: DivergenceChartProps) {
  if (!data?.labels?.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No divergence data</p>
      </div>
    )
  }

  const scoreColor = getDivergenceColor(divergenceScore)

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Baseline',
        data: data.baseline,
        borderColor: '#888888',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#888888',
        tension: 0.3,
        order: 2,
      },
      {
        label: 'Current',
        data: data.current,
        borderColor: '#2dd4a8',
        backgroundColor: 'rgba(45, 212, 168, 0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#2dd4a8',
        pointHoverBorderColor: '#1a1a1a',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        fill: true,
        order: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: '#888888',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 11,
          },
          boxWidth: 12,
          boxHeight: 2,
          padding: 16,
          usePointStyle: false,
        },
      },
      tooltip: {
        backgroundColor: '#232323',
        borderColor: '#333333',
        borderWidth: 1,
        titleColor: '#eaeaea',
        bodyColor: '#888888',
        titleFont: {
          family: "'JetBrains Mono', monospace",
          size: 11,
          weight: 'bold' as const,
        },
        bodyFont: {
          family: "'JetBrains Mono', monospace",
          size: 10,
        },
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        grid: {
          color: '#333333',
          drawTicks: false,
        },
        border: {
          color: '#333333',
        },
        ticks: {
          color: '#888888',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 10,
          },
          maxRotation: 0,
          maxTicksLimit: 10,
          padding: 8,
        },
      },
      y: {
        grid: {
          color: '#222222',
          drawTicks: false,
        },
        border: {
          color: '#333333',
        },
        ticks: {
          color: '#888888',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 10,
          },
          padding: 8,
        },
      },
    },
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {/* Divergence score header */}
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Divergence Score
        </span>
        <span
          className="font-mono text-3xl font-bold tabular-nums"
          style={{ color: scoreColor }}
        >
          {divergenceScore.toFixed(2)}
        </span>
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium"
          style={{
            color: scoreColor,
            backgroundColor: `${scoreColor}15`,
          }}
        >
          {divergenceScore < 0.3
            ? 'STABLE'
            : divergenceScore < 0.6
              ? 'DRIFTING'
              : 'HIGH DRIFT'}
        </span>
      </div>

      <Line data={chartData} options={options} />
    </div>
  )
}
