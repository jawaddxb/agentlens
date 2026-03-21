'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface OutcomeChartProps {
  data: Record<string, number>
}

export default function OutcomeChart({ data }: OutcomeChartProps) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No outcome data</p>
      </div>
    )
  }

  const labels = Object.keys(data)
  const values = Object.values(data)
  const total = values.reduce((a, b) => a + b, 0)

  // Generate gradient colors per bar
  const barColors = values.map((_, i) => {
    const t = labels.length > 1 ? i / (labels.length - 1) : 0
    const r = Math.round(45 + t * (45 - 45))
    const g = Math.round(212 + t * (212 - 212))
    const b = Math.round(168 + t * (142 - 168))
    // Interpolate from accent (#2dd4a8) to success (#2dd48e)
    return `rgb(${r}, ${g}, ${b})`
  })

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Outcomes',
        data: values,
        backgroundColor: barColors.map((c) => `${c}`),
        borderColor: barColors,
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 24,
      },
    ],
  }

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        display: false,
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
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return `${value} (${pct}%)`
          },
        },
      },
    },
    scales: {
      x: {
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
      y: {
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#eaeaea',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 11,
          },
          padding: 8,
        },
      },
    },
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Outcome Distribution
        </span>
        <span className="font-mono text-lg font-bold text-text">
          {total.toLocaleString()}
          <span className="ml-1 text-[10px] font-normal text-muted">total</span>
        </span>
      </div>
      <Bar data={chartData} options={options} />
    </div>
  )
}
