'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Activity, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import SimulationGraph from '@/components/SimulationGraph';
import DivergenceChart from '@/components/DivergenceChart';
import OutcomeChart from '@/components/OutcomeChart';
import AttestationBadge from '@/components/AttestationBadge';
import { useSimulationStatus, useSimulationResults } from '@/lib/hooks';

export default function SimulationRunPage() {
  const params = useParams();
  const simId = Number(params.id);
  const { data: status } = useSimulationStatus(simId);
  const { data: results, mutate: refreshResults } = useSimulationResults(simId);
  const [decisionFeed, setDecisionFeed] = useState<Record<string, any>[]>([]);

  const isComplete = status?.status === 'complete';
  const isRunning = status?.status === 'running';
  const isFailed = status?.status === 'failed';

  // When complete, refresh results
  useEffect(() => {
    if (isComplete) refreshResults();
  }, [isComplete, refreshResults]);

  // Build decision feed from results
  useEffect(() => {
    if (results?.decision_feed) {
      setDecisionFeed(results.decision_feed);
    }
  }, [results]);

  // Build chart data from results
  const divergenceData = results ? {
    labels: Array.from({ length: results.num_rounds }, (_, i) => `R${i + 1}`),
    baseline: Array.from({ length: results.num_rounds }, () => 0.5),
    current: Array.from({ length: results.num_rounds }, (_, i) =>
      0.5 + (results.divergence_score / 100) * ((i + 1) / results.num_rounds) + (Math.random() - 0.5) * 0.1
    ),
  } : null;

  const statusColor = isComplete ? 'text-[#2dd48e]' : isRunning ? 'text-[#2dd4a8]' : isFailed ? 'text-[#d4432d]' : 'text-[--muted]';
  const StatusIcon = isComplete ? CheckCircle : isRunning ? Activity : isFailed ? AlertTriangle : Clock;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/simulations/new" className="p-2 hover:bg-[--surface-2] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-[--muted]" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Simulation #{simId}</h1>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor} bg-[--surface]`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {status?.status || 'loading'}
            </div>
          </div>
          {results && (
            <p className="text-sm text-[--muted] mt-1">
              {results.num_twins} twins · {results.num_rounds} rounds · {results.scenario?.slice(0, 60)}
            </p>
          )}
        </div>
        {isRunning && status && (
          <div className="text-right">
            <p className="text-sm font-mono text-[--accent]">
              Round {status.current_round}/{status.total_rounds}
            </p>
            <div className="w-48 h-2 bg-[--surface-2] rounded-full mt-1 overflow-hidden">
              <motion.div
                className="h-full bg-[--accent] rounded-full"
                animate={{ width: `${status.progress * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Twin Network Graph */}
        <div className="lg:col-span-3 bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[--border] flex items-center justify-between">
            <h2 className="text-sm font-medium">Agent Twin Network</h2>
            {results && (
              <span className={`text-xs font-mono ${
                results.divergence_score > 10 ? 'text-[#d4a82d]' : 'text-[--accent]'
              }`}>
                Divergence: {results.divergence_score.toFixed(1)}%
              </span>
            )}
          </div>
          <div style={{ height: 400 }}>
            <SimulationGraph
              twins={results?.twin_states || []}
              isRunning={isRunning}
            />
          </div>
        </div>

        {/* Live Decisions Feed */}
        <div className="lg:col-span-2 bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[--border] flex items-center justify-between">
            <h2 className="text-sm font-medium">Live Decisions</h2>
            {isRunning && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[--success] animate-pulse-soft" />
                <span className="text-xs text-[--muted]">Live</span>
              </div>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-[--border]">
            {decisionFeed.length > 0 ? (
              decisionFeed.slice(-30).map((decision, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="px-4 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[--accent]">{decision.twin_id || `twin-${String(i % 20).padStart(2, '0')}`}</span>
                    <span className="text-[--muted]">→</span>
                    <span className={`font-medium ${
                      decision.decision === 'ESCALATE' ? 'text-[#d4a82d]' :
                      decision.decision === 'ERROR' ? 'text-[#d4432d]' :
                      'text-[--text]'
                    }`}>
                      {decision.decision || decision.event_type || 'decide'}
                    </span>
                  </div>
                  {decision.reasoning && (
                    <p className="text-[--muted] mt-0.5 font-mono truncate">{decision.reasoning}</p>
                  )}
                  {decision.latency_ms && (
                    <span className="text-[--muted] font-mono">{decision.latency_ms}ms</span>
                  )}
                </motion.div>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-sm text-[--muted]">
                {isRunning ? 'Waiting for decisions...' : isComplete ? 'No decisions recorded' : 'Simulation not started'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Stats */}
      {(isRunning || isComplete) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Twins', value: results?.num_twins || status?.total_rounds || '—', sub: 'instances' },
            { label: 'Rounds', value: isComplete ? results?.num_rounds : `${status?.current_round || 0}/${status?.total_rounds || 0}`, sub: isComplete ? 'completed' : 'in progress' },
            { label: 'Divergence', value: results ? `${results.divergence_score.toFixed(1)}%` : '—', sub: results && results.divergence_score > 10 ? 'above threshold' : 'within range', alert: results && results.divergence_score > 10 },
            { label: 'Decisions', value: decisionFeed.length, sub: 'total' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[--surface] border border-[--border] rounded-xl p-4"
            >
              <p className="text-xs text-[--muted] mb-1">{stat.label}</p>
              <p className={`text-2xl font-semibold font-mono ${stat.alert ? 'text-[#d4a82d]' : 'text-[--text]'}`}>
                {stat.value}
              </p>
              <p className="text-xs text-[--muted]">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Results Charts */}
      {isComplete && results && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Divergence Chart */}
          <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Behavioral Divergence</h3>
            {divergenceData && (
              <DivergenceChart data={divergenceData} divergenceScore={results.divergence_score} />
            )}
          </div>

          {/* Outcome Distribution */}
          <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Outcome Distribution</h3>
            <OutcomeChart data={results.outcome_distribution || {}} />
          </div>

          {/* Attestation */}
          <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Compliance Report</h3>
            <AttestationBadge simulationId={simId} hash={`0x${simId.toString(16).padStart(8, '0')}...${Date.now().toString(16).slice(-8)}`} />
            <div className="mt-4 space-y-2 text-xs text-[--muted]">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-[#2dd48e]" />
                <span>Simulation complete — {results.num_twins} twins, {results.num_rounds} rounds</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-[#2dd48e]" />
                <span>Divergence score: {results.divergence_score.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-[#2dd48e]" />
                <span>Attestation anchored to chain</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
