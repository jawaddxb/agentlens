'use client'

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

interface DecisionDonutProps {
  data: Record<string, number>
}

const DONUT_COLORS = [
  '#2dd4a8', // accent
  '#6366f1', // indigo
  '#2dd48e', // success
  '#d4a82d', // warning
  '#d4432d', // danger
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal alt
]

export default function DecisionDonut({ data }: DecisionDonutProps) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface">
        <p className="font-mono text-sm text-muted">No decision data</p>
      </div>
    )
  }

  const labels = Object.keys(data)
  const values = Object.values(data)
  const total = values.reduce((a, b) => a + b, 0)

  const colors = labels.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length])

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors.map((c) => `${c}cc`),
        borderColor: colors,
        borderWidth: 1.5,
        hoverBackgroundColor: colors,
        hoverBorderColor: '#eaeaea',
        hoverBorderWidth: 2,
        spacing: 2,
        borderRadius: 3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '68%',
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          color: '#888888',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 10,
          },
          padding: 12,
          boxWidth: 10,
          boxHeight: 10,
          borderRadius: 2,
          useBorderRadius: true,
          generateLabels: (chart: ChartJS) => {
            const dataset = chart.data.datasets[0]
            return chart.data.labels!.map((label, i) => ({
              text: `${label} (${dataset.data[i]})`,
              fillStyle: (dataset.backgroundColor as string[])[i],
              strokeStyle: (dataset.borderColor as string[])[i],
              lineWidth: 1,
              index: i,
              hidden: false,
            }))
          },
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
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return ` ${value} (${pct}%)`
          },
        },
      },
    },
  }

  // Center text plugin
  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: (chart: ChartJS) => {
      const { ctx, chartArea } = chart
      if (!chartArea) return

      const centerX = (chartArea.left + chartArea.right) / 2
      const centerY = (chartArea.top + chartArea.bottom) / 2

      ctx.save()

      // Total number
      ctx.fillStyle = '#eaeaea'
      ctx.font = "bold 22px 'JetBrains Mono', monospace"
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(total.toLocaleString(), centerX, centerY - 6)

      // Label
      ctx.fillStyle = '#888888'
      ctx.font = "10px 'JetBrains Mono', monospace"
      ctx.fillText('total', centerX, centerY + 14)

      ctx.restore()
    },
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Decision Distribution
        </span>
      </div>
      <div className="mx-auto max-w-sm">
        <Doughnut data={chartData} options={options} plugins={[centerTextPlugin]} />
      </div>
    </div>
  )
}
