'use client';

import { useState, useMemo, useEffect } from 'react';
import { Shield, AlertTriangle, XCircle, ChevronUp, ChevronDown, Terminal } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

interface GovernanceSummary {
  total_events: number;
  escalation_count: number;
  error_rate: number;
  simulation_count: number;
  unreviewed_escalations: number;
  agents_monitored: number;
  compliance_score: number;
}

interface EventRow {
  id: number;
  agent_id: number;
  agent_name?: string;
  trace_id: string;
  event_type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

function parseNLQuery(q: string): (e: EventRow) => boolean {
  const lower = q.toLowerCase().trim();
  if (!lower) return () => true;

  // Time range patterns
  const lastNHoursMatch = lower.match(/last\s+(\d+)\s+hour/);
  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+day/);
  const sinceTs = lastNHoursMatch
    ? Date.now() - parseInt(lastNHoursMatch[1]) * 3600_000
    : lastNDaysMatch
    ? Date.now() - parseInt(lastNDaysMatch[1]) * 86400_000
    : null;

  return (e: EventRow) => {
    // Time filter
    if (sinceTs && new Date(e.timestamp).getTime() < sinceTs) return false;

    // Keyword matching — event_type, data stringified, agent name
    const haystack = [
      e.event_type,
      JSON.stringify(e.data),
      e.agent_name || '',
      e.trace_id,
    ]
      .join(' ')
      .toLowerCase();

    // Strip out time tokens for remaining keyword search
    const stripped = lower
      .replace(/last\s+\d+\s+(hour|day)s?/g, '')
      .trim();

    if (!stripped) return true;

    // Support "agent:sales-bot" style
    const agentMatch = stripped.match(/agent:(\S+)/);
    if (agentMatch) {
      return (e.agent_name || '').toLowerCase().includes(agentMatch[1]);
    }

    return haystack.includes(stripped);
  };
}

const QUICK_FILTERS = [
  { label: 'ESCALATE', color: 'text-yellow-400 border-yellow-400/40 hover:bg-yellow-400/10', match: 'escalat' },
  { label: 'BLOCK', color: 'text-red-400 border-red-400/40 hover:bg-red-400/10', match: 'block' },
  { label: 'ERROR', color: 'text-red-500 border-red-500/40 hover:bg-red-500/10', match: 'error' },
];

function scoreColor(score: number) {
  if (score >= 90) return 'text-green-400';
  if (score >= 70) return 'text-yellow-400';
  return 'text-red-400';
}

function eventTypeLabel(type: string) {
  const map: Record<string, string> = {
    escalation: '⚠ ESCALATE',
    error: '✗ ERROR',
    llm_call: 'LLM_CALL',
    tool_call: 'TOOL_CALL',
    user_message: 'USER_MSG',
    agent_response: 'RESPONSE',
    trace_start: 'TRACE_START',
    trace_end: 'TRACE_END',
    http_request: 'HTTP_REQ',
  };
  return map[type] || type.toUpperCase();
}

function eventTypeBadge(type: string) {
  if (type === 'escalation') return 'text-yellow-400';
  if (type === 'error') return 'text-red-400';
  if (type === 'llm_call') return 'text-[#2dd4a8]';
  if (type === 'tool_call') return 'text-[#6366f1]';
  return 'text-[--muted]';
}

function getDecision(e: EventRow): string {
  if (e.event_type === 'escalation') return 'ESCALATED';
  if (e.event_type === 'error') return 'ERROR';
  const status = (e.data as Record<string, unknown>)?.status as string | undefined;
  if (status === 'error') return 'ERROR';
  if (e.event_type === 'agent_response') return 'RESPONDED';
  if (e.event_type === 'llm_call') return 'COMPLETE';
  return status?.toUpperCase() || '—';
}

function getLatency(e: EventRow): string {
  const lat = (e.data as Record<string, unknown>)?.latency_ms as number | undefined;
  if (!lat) return '—';
  if (lat < 1000) return `${lat.toFixed(0)}ms`;
  return `${(lat / 1000).toFixed(1)}s`;
}

export default function GovernancePage() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [agents, setAgents] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        const [evRes, agRes, sumRes] = await Promise.all([
          fetch(`${API_BASE}/api/events/recent`),
          fetch(`${API_BASE}/api/agents`),
          fetch(`${API_BASE}/api/governance/summary`),
        ]);
        const evData: EventRow[] = await evRes.json();
        const agData: Array<{ id: number; name: string }> = await agRes.json();
        const sumData: GovernanceSummary = await sumRes.json();

        const agentMap: Record<number, string> = {};
        agData.forEach(a => { agentMap[a.id] = a.name; });

        setEvents(evData.map(e => ({ ...e, agent_name: agentMap[e.agent_id] || `agent-${e.agent_id}` })));
        setAgents(agentMap);
        setSummary(sumData);
      } catch (err) {
        console.error('Governance load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  const displayQuery = activeFilter || query;

  const filtered = useMemo(() => {
    const filterFn = parseNLQuery(displayQuery);
    const sorted = [...events].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });
    return sorted.filter(filterFn);
  }, [events, displayQuery, sortDir]);

  const handleQuickFilter = (match: string) => {
    setActiveFilter(prev => (prev === match ? null : match));
    setQuery('');
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-[#2dd4a8]" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[--text]">Governance Console</h1>
          <p className="text-xs text-[--muted]">EU AI Act Article 9 · Risk Management · Compliance Monitoring</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[--muted] uppercase tracking-widest">Status</span>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        </div>
      </div>

      {/* Compliance summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Compliance</div>
            <div className={`text-2xl font-bold ${scoreColor(summary.compliance_score)}`}>
              {summary.compliance_score}%
            </div>
            <div className="text-[10px] text-[--muted] mt-1">Art. 9 Score</div>
          </div>
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Events</div>
            <div className="text-2xl font-bold text-[--text]">{summary.total_events.toLocaleString()}</div>
            <div className="text-[10px] text-[--muted] mt-1">Total logged</div>
          </div>
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Escalations</div>
            <div className="text-2xl font-bold text-yellow-400">{summary.escalation_count}</div>
            <div className="text-[10px] text-[--muted] mt-1">{summary.unreviewed_escalations} unreviewed</div>
          </div>
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Error Rate</div>
            <div className={`text-2xl font-bold ${summary.error_rate > 5 ? 'text-red-400' : 'text-[--text]'}`}>
              {summary.error_rate}%
            </div>
            <div className="text-[10px] text-[--muted] mt-1">Last 24h</div>
          </div>
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Simulations</div>
            <div className="text-2xl font-bold text-[#6366f1]">{summary.simulation_count}</div>
            <div className="text-[10px] text-[--muted] mt-1">Art. 9 tests</div>
          </div>
          <div className="bg-[--surface] border border-[--border] rounded-lg p-3">
            <div className="text-[10px] text-[--muted] uppercase tracking-widest mb-1">Agents</div>
            <div className="text-2xl font-bold text-[#2dd4a8]">{summary.agents_monitored}</div>
            <div className="text-[10px] text-[--muted] mt-1">Monitored</div>
          </div>
        </div>
      )}

      {/* EU AI Act Article 9 note */}
      <div className="rounded-lg border border-[#2dd4a8]/20 bg-[#2dd4a8]/5 px-4 py-3 text-xs text-[--muted]">
        <span className="text-[#2dd4a8] font-semibold">EU AI Act · Article 9 — Risk Management System: </span>
        High-risk AI systems must implement a risk management system covering identification, analysis, estimation, evaluation, adoption of risk controls, and residual risk assessment. This console provides continuous compliance monitoring across all agents.
      </div>

      {/* Search + quick filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-[--border] bg-[--surface] px-3 py-2">
          <Terminal className="w-4 h-4 text-[--muted] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveFilter(null); }}
            placeholder='query> e.g. "escalat" "error" "agent:sales-bot" "last 2 hours"'
            className="flex-1 bg-transparent text-sm text-[--text] placeholder:text-[--muted] outline-none"
          />
          {(query || activeFilter) && (
            <button
              onClick={() => { setQuery(''); setActiveFilter(null); }}
              className="text-[--muted] hover:text-[--text] text-xs"
            >
              ✕ clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[--muted] uppercase tracking-widest">Quick:</span>
          {QUICK_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => handleQuickFilter(f.match)}
              className={`px-3 py-1 text-xs border rounded font-mono transition-colors ${f.color} ${
                activeFilter === f.match ? 'opacity-100' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-[--muted]">
            {filtered.length} results
          </span>
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-lg border border-[--border] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[--border] bg-[--surface]">
                <th
                  className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium cursor-pointer hover:text-[--text] whitespace-nowrap"
                  onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                >
                  <span className="flex items-center gap-1">
                    Timestamp
                    {sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </span>
                </th>
                <th className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium">Agent</th>
                <th className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium">Event Type</th>
                <th className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium">Decision / Status</th>
                <th className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium">Latency</th>
                <th className="px-3 py-2.5 text-left text-[--muted] uppercase tracking-widest font-medium hidden md:table-cell">Trace</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[--muted]">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[--muted]">
                    No events match query.
                  </td>
                </tr>
              )}
              {filtered.map(e => {
                const decision = getDecision(e);
                const isAlert = e.event_type === 'escalation' || e.event_type === 'error' || decision === 'ERROR';
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-[--border]/50 transition-colors hover:bg-[--surface]/60 ${
                      isAlert ? 'bg-red-950/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-[--muted] whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString('en-GB', {
                        month: 'short', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false,
                      })}
                    </td>
                    <td className="px-3 py-2 text-[--text] whitespace-nowrap">{e.agent_name}</td>
                    <td className={`px-3 py-2 whitespace-nowrap font-mono ${eventTypeBadge(e.event_type)}`}>
                      {eventTypeLabel(e.event_type)}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${
                      decision === 'ERROR' || decision === 'ESCALATED' ? 'text-red-400' :
                      decision === 'RESPONDED' || decision === 'COMPLETE' ? 'text-green-400' :
                      'text-[--muted]'
                    }`}>
                      {isAlert && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                      {decision}
                    </td>
                    <td className="px-3 py-2 text-[--muted]">{getLatency(e)}</td>
                    <td className="px-3 py-2 text-[--muted] hidden md:table-cell font-mono text-[10px]">
                      {e.trace_id.slice(0, 10)}…
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Article 9 compliance detail */}
      {summary && (
        <div className="rounded-lg border border-[--border] bg-[--surface] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[--text] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#2dd4a8]" />
            Article 9 Risk Assessment Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[--muted]">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Risk identification (events logged)</span>
                <span className="text-[--text]">{summary.total_events.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Human escalation triggers</span>
                <span className={summary.escalation_count > 0 ? 'text-yellow-400' : 'text-green-400'}>
                  {summary.escalation_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span>System error rate</span>
                <span className={summary.error_rate > 5 ? 'text-red-400' : 'text-green-400'}>
                  {summary.error_rate}%
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Simulation tests performed</span>
                <span className="text-[#6366f1]">{summary.simulation_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Unreviewed escalations (24h)</span>
                <span className={summary.unreviewed_escalations > 0 ? 'text-yellow-400' : 'text-green-400'}>
                  {summary.unreviewed_escalations}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Agents under monitoring</span>
                <span className="text-[#2dd4a8]">{summary.agents_monitored}</span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-[--border]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[--muted]">Overall Article 9 compliance score</span>
              <span className={`text-lg font-bold ${scoreColor(summary.compliance_score)}`}>
                {summary.compliance_score}/100
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[--border] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.compliance_score >= 90 ? 'bg-green-400' :
                  summary.compliance_score >= 70 ? 'bg-yellow-400' : 'bg-red-400'
                }`}
                style={{ width: `${summary.compliance_score}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
