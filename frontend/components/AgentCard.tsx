'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

interface Agent {
  id: number
  name: string
  description: string
  status: 'active' | 'inactive'
  calls_per_hour: number
  error_rate: number
  p95_latency: number
  connector_type: string
}

function StatusDot({ status }: { status: Agent['status'] }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'active' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          status === 'active' ? 'bg-success' : 'bg-muted'
        }`}
      />
    </span>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="font-mono text-sm text-text">{value}</span>
    </div>
  )
}

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agents/${agent.id}`}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="group cursor-pointer rounded-xl border border-border bg-surface p-5 transition-colors duration-200 hover:border-accent"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <StatusDot status={agent.status} />
            <h3 className="text-lg font-bold text-text">{agent.name}</h3>
          </div>
          <span className="rounded-full border border-border bg-surface2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
            {agent.connector_type}
          </span>
        </div>

        {agent.description && (
          <p className="mb-4 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {agent.description}
          </p>
        )}

        <div className="flex items-center gap-6 border-t border-border pt-3">
          <StatItem label="calls/h" value={agent.calls_per_hour.toLocaleString()} />
          <StatItem
            label="error rate"
            value={`${(agent.error_rate * 100).toFixed(1)}%`}
          />
          <StatItem
            label="p95 latency"
            value={`${agent.p95_latency.toFixed(0)}ms`}
          />
        </div>
      </motion.div>
    </Link>
  )
}
