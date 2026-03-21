'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, GitFork, Play, Clock, Zap, AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import TraceGraph from '@/components/TraceGraph';
import { useTraces, useAgents } from '@/lib/hooks';
import type { Trace, AgentEvent } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const eventTypeColors: Record<string, string> = {
  llm_call: 'text-[#2dd4a8]',
  tool_call: 'text-[#6366f1]',
  user_message: 'text-[#8b5cf6]',
  agent_response: 'text-[#2dd48e]',
  error: 'text-[#d4432d]',
  escalation: 'text-[#d4a82d]',
  intent_classify: 'text-[#2dd4a8]',
  format_response: 'text-[#2dd48e]',
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = Number(params.id);
  const { data: agents } = useAgents();
  const { data: traces, isLoading } = useTraces(agentId);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AgentEvent | null>(null);
  const [replaying, setReplaying] = useState(false);

  const agent = agents?.find(a => a.id === agentId);

  // Select first trace by default
  const activeTrace = selectedTrace || (traces && traces.length > 0 ? traces[0] : null);

  async function handleReplay() {
    if (!activeTrace) return;
    setReplaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/traces/${activeTrace.id}/replay`, { method: 'POST' });
      if (!res.ok) throw new Error('Replay failed');
      const data = await res.json();
      router.push(`/simulations/${data.simulation_id}`);
    } catch (err) {
      console.error('Replay error:', err);
      setReplaying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="p-2 hover:bg-[--surface-2] rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-[--muted]" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
              {agent?.name || `Agent #${agentId}`}
            </h1>
            <p className="text-sm text-[--muted] truncate">{agent?.description || 'AI Agent'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto sm:gap-3 flex-wrap">
          <Link
            href={`/agents/${agentId}/fingerprint`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-[--surface] border border-[--border] rounded-lg text-[--muted] hover:text-[--text] hover:border-[--accent] transition-all"
          >
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Behavioral </span>Fingerprint
          </Link>
          {activeTrace && (
            <>
              <button
                onClick={handleReplay}
                disabled={replaying}
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-[--surface] border border-[--border] rounded-lg text-[--muted] hover:text-[--text] hover:border-[--accent] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${replaying ? 'animate-spin' : ''}`} />
                <span>{replaying ? 'Replaying…' : 'Replay'}</span>
              </button>
              <Link
                href={`/simulations/new?agent=${agentId}&trace=${activeTrace.id}`}
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-[--accent] text-black font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <GitFork className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Fork Sim
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Execution Graph */}
        <div className="lg:col-span-3 bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[--border] flex items-center justify-between">
            <h2 className="text-sm font-medium">Execution Graph</h2>
            {activeTrace && (
              <span className="text-xs font-mono text-[--muted]">
                Trace #{activeTrace.id?.slice(0, 8)} · {formatDuration(activeTrace.duration_ms)}
              </span>
            )}
          </div>
          <div className="p-4" style={{ minHeight: 400 }}>
            {activeTrace ? (
              <TraceGraph trace={activeTrace} />
            ) : (
              <div className="flex items-center justify-center h-80 text-[--muted]">
                {isLoading ? 'Loading traces...' : 'No traces available'}
              </div>
            )}
          </div>
        </div>

        {/* Trace Inspector */}
        <div className="lg:col-span-2 bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[--border]">
            <h2 className="text-sm font-medium">Trace Inspector</h2>
          </div>
          <div className="divide-y divide-[--border] max-h-[500px] overflow-y-auto">
            {activeTrace?.events?.map((event, i) => (
              <motion.div
                key={event.id || i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`px-4 py-3 cursor-pointer hover:bg-[--surface-2] transition-colors ${
                  selectedEvent?.id === event.id ? 'bg-[--surface-2] border-l-2 border-l-[--accent]' : ''
                }`}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${eventTypeColors[event.event_type] || 'text-[--text]'}`}>
                    Step {i + 1}: {event.event_type}
                  </span>
                  <span className="text-xs font-mono text-[--muted]">
                    {event.data?.latency_ms ? `${event.data.latency_ms}ms` : ''}
                  </span>
                </div>

                {/* Event details */}
                <div className="space-y-1 text-xs font-mono text-[--muted]">
                  {event.data?.model ? (
                    <p>model: {String(event.data.model)}</p>
                  ) : null}
                  {event.data?.tool_name ? (
                    <p>tool: {String(event.data.tool_name)}({event.data.tool_input ? JSON.stringify(event.data.tool_input).slice(0, 50) : ''})</p>
                  ) : null}
                  {(event.data?.tokens_in || event.data?.tokens_out) ? (
                    <p>tokens: {String(event.data.tokens_in || 0)} in / {String(event.data.tokens_out || 0)} out</p>
                  ) : null}
                  {event.data?.response ? (
                    <p className="text-[--text] line-clamp-2">{String(event.data.response)}</p>
                  ) : null}
                  {event.data?.sentiment ? (
                    <p>sentiment: {String(event.data.sentiment)}</p>
                  ) : null}
                  {event.data?.status === 'error' ? (
                    <p className="text-[#d4432d] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Error
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ))}
            {(!activeTrace?.events || activeTrace.events.length === 0) && (
              <div className="px-4 py-8 text-center text-sm text-[--muted]">
                Select a trace to inspect
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trace List */}
      <div className="bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[--border] flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent Traces</h2>
          <span className="text-xs text-[--muted]">{traces?.length || 0} traces</span>
        </div>
        <div className="divide-y divide-[--border] max-h-80 overflow-y-auto">
          {traces?.map((trace, i) => (
            <motion.div
              key={trace.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-[--surface-2] transition-colors ${
                activeTrace?.id === trace.id ? 'bg-[--surface-2]' : ''
              }`}
              onClick={() => { setSelectedTrace(trace); setSelectedEvent(null); }}
            >
              <div className={`w-2 h-2 rounded-full ${
                trace.status === 'error' ? 'bg-[#d4432d]' :
                trace.status === 'complete' ? 'bg-[#2dd48e]' : 'bg-[#d4a82d]'
              }`} />
              <span className="font-mono text-xs text-[--muted] w-20">{trace.id?.slice(0, 8)}</span>
              <span className="text-sm text-[--text] flex-1">
                {trace.events?.[0]?.event_type || 'trace'} → {trace.events?.[trace.events.length - 1]?.event_type || 'end'}
              </span>
              <div className="flex items-center gap-4 text-xs text-[--muted]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(trace.duration_ms)}
                </span>
                <span>{trace.events?.length || 0} steps</span>
                <span className="font-mono">{formatTime(trace.start_time)}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[--muted]" />
            </motion.div>
          ))}
          {(!traces || traces.length === 0) && (
            <div className="px-4 py-8 text-center text-sm text-[--muted]">
              {isLoading ? 'Loading...' : 'No traces yet. Connect an agent or seed demo data.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
