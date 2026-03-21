'use client';

import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, AlertTriangle, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import FingerprintGraph from '@/components/FingerprintGraph';
import TemporalHeatmap from '@/components/TemporalHeatmap';
import { useFingerprint, useAgents } from '@/lib/hooks';

export default function FingerprintPage() {
  const params = useParams();
  const agentId = Number(params.id);
  const { data: agents } = useAgents();
  const { data: fpData, isLoading } = useFingerprint(agentId);

  const agent = agents?.find(a => a.id === agentId);
  const fingerprint = fpData?.fingerprint;
  const drift = fpData?.drift;
  const driftAlerts = fpData?.drift_alerts || drift?.alerts || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/agents/${agentId}`} className="p-2 hover:bg-[--surface-2] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-[--muted]" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Behavioral Fingerprint
          </h1>
          <p className="text-sm text-[--muted]">
            {agent?.name || `Agent #${agentId}`} — based on recent traces
          </p>
        </div>
        <button className="ml-auto flex items-center gap-2 px-4 py-2 text-sm bg-[--surface] border border-[--border] rounded-lg text-[--muted] hover:text-[--text] hover:border-[--accent] transition-all">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {isLoading ? (
        <div className="h-96 bg-[--surface] border border-[--border] rounded-xl animate-pulse" />
      ) : !fingerprint ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[--surface] border border-[--border] rounded-xl">
          <TrendingUp className="w-12 h-12 text-[--muted] mb-4" />
          <p className="text-[--muted] text-lg mb-2">No fingerprint data</p>
          <p className="text-[--muted] text-sm">Agent needs more traces to build a behavioral profile</p>
        </div>
      ) : (
        <>
          {/* Decision Graph + Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Force-directed graph */}
            <div className="lg:col-span-3 bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[--border]">
                <h2 className="text-sm font-medium">Decision Graph</h2>
              </div>
              <div style={{ height: 380 }}>
                <FingerprintGraph
                  nodes={fingerprint.nodes}
                  edges={fingerprint.edges}
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Top Decision Paths */}
              <div className="bg-[--surface] border border-[--border] rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">Top Decision Paths</h3>
                <div className="space-y-3">
                  {fingerprint.top_paths?.slice(0, 5).map((path: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="space-y-1"
                    >
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-[--text]">
                          {i + 1}. {path.name || path.path?.join(' → ') || `Path ${i + 1}`}
                        </span>
                        <span className="text-[--accent] font-mono">{path.frequency ? `${(path.frequency * 100).toFixed(0)}%` : ''}</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {(path.steps || path.path || []).map((step: string, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 text-[10px] font-mono bg-[--surface-2] rounded text-[--muted]">
                            {step}
                          </span>
                        ))}
                      </div>
                      <div className="h-1 bg-[--surface-2] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[--accent] rounded-full"
                          style={{ width: `${(path.frequency || 0.1) * 100}%` }}
                        />
                      </div>
                    </motion.div>
                  ))}
                  {(!fingerprint.top_paths || fingerprint.top_paths.length === 0) && (
                    <p className="text-xs text-[--muted]">No path data available</p>
                  )}
                </div>
              </div>

              {/* Drift Alerts */}
              <div className="bg-[--surface] border border-[--border] rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">Drift Alerts</h3>
                {driftAlerts.length > 0 ? (
                  <div className="space-y-2">
                    {driftAlerts.map((alert: any, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-2 rounded-lg bg-[#d4a82d]/10 border border-[#d4a82d]/20"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 text-[#d4a82d] mt-0.5 shrink-0" />
                          <span className="text-xs text-[--text] font-medium">
                            {typeof alert === 'string' ? alert : alert.message}
                          </span>
                        </div>
                        {typeof alert === 'object' && alert.current && (
                          <div className="mt-1.5 flex gap-3 pl-5 text-[10px] font-mono">
                            <span className="text-[#d4a82d]">now: {alert.current.toFixed(1)}%</span>
                            <span className="text-[--muted]">baseline: {alert.baseline.toFixed(1)}%</span>
                            <span className="text-[#d4432d]">+{alert.delta_pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[--muted]">
                    <span className="w-2 h-2 rounded-full bg-[--success]" />
                    No drift alerts — behavior is stable
                  </div>
                )}
              </div>

              {/* Decision Distribution */}
              <div className="bg-[--surface] border border-[--border] rounded-xl p-4">
                <h3 className="text-sm font-medium mb-3">Decision Distribution</h3>
                <div className="space-y-2">
                  {fingerprint.decision_distribution &&
                    Object.entries(fingerprint.decision_distribution)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([key, val]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono text-[--text]">{key}</span>
                            <span className="text-[--muted]">{((val as number) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1 bg-[--surface-2] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[--accent] rounded-full"
                              style={{ width: `${(val as number) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          </div>

          {/* Temporal Heatmap */}
          <div className="bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[--border]">
              <h2 className="text-sm font-medium">Temporal Heatmap — Activity by Hour &amp; Day</h2>
            </div>
            <div className="p-4">
              <TemporalHeatmap data={fingerprint.temporal_heatmap} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
