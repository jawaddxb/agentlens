'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Activity, Search, Wifi } from 'lucide-react';
import Link from 'next/link';
import AgentCard from '@/components/AgentCard';
import LiveFeed from '@/components/LiveFeed';
import DecisionDonut from '@/components/DecisionDonut';
import DriftSparkline from '@/components/DriftSparkline';
import { useAgents, useRecentEvents } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { data: agents, error: agentsError, isLoading: agentsLoading } = useAgents();
  const { data: events, error: eventsError } = useRecentEvents();
  const [seeding, setSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.seedData();
    } catch (e) {
      console.error('Seed failed:', e);
    }
    setSeeding(false);
  };

  const activeAgents = agents?.filter(a => a.status === 'active') || [];
  const filteredAgents = searchQuery
    ? agents?.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : agents;

  // Aggregate decision distribution from events
  const decisionDist: Record<string, number> = {};
  const toolUsage: Record<string, number> = {};
  events?.forEach(e => {
    decisionDist[e.event_type] = (decisionDist[e.event_type] || 0) + 1;
    if (e.event_type === 'tool_call' && e.data?.tool_name) {
      const tn = String(e.data.tool_name);
      toolUsage[tn] = (toolUsage[tn] || 0) + 1;
    }
  });

  // Mock drift values for sparkline
  const driftValues = [0.2, 0.3, 0.25, 0.4, 0.35, 0.5, 0.45, 0.6, 0.55, 0.3, 0.4, 0.35];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Agents
            {activeAgents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-[--muted]">
                ({activeAgents.length} active)
              </span>
            )}
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--muted]" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[--surface] border border-[--border] rounded-lg text-sm text-[--text] placeholder:text-[--muted] focus:outline-none focus:border-[--accent] transition-colors w-64"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[--surface] border border-[--border] rounded-lg text-[--muted] hover:text-[--text] hover:border-[--accent] transition-all disabled:opacity-50"
          >
            <Activity className="w-4 h-4" />
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm bg-[--accent] text-black font-medium rounded-lg hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            Connect Agent
          </button>
        </div>
      </div>

      {/* Agent Grid + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Cards */}
        <div className="lg:col-span-2">
          {agentsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-[--surface] border border-[--border] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !agents?.length ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 bg-[--surface] border border-[--border] rounded-xl"
            >
              <Wifi className="w-12 h-12 text-[--muted] mb-4" />
              <p className="text-[--muted] text-lg mb-2">No agents connected</p>
              <p className="text-[--muted] text-sm mb-6">Seed demo data or connect your first agent</p>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="px-6 py-2.5 bg-[--accent] text-black font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                {seeding ? 'Seeding...' : 'Load Demo Data'}
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AnimatePresence>
                {filteredAgents?.map((agent, i) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <AgentCard agent={agent} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Live Activity Feed */}
        <div className="lg:col-span-1">
          <div className="bg-[--surface] border border-[--border] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[--border] flex items-center justify-between">
              <h2 className="text-sm font-medium text-[--text]">Live Activity</h2>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[--success] animate-pulse-soft" />
                <span className="text-xs text-[--muted]">Live</span>
              </div>
            </div>
            <LiveFeed events={events || []} />
          </div>
        </div>
      </div>

      {/* Behavioral Overview */}
      {agents && agents.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-4 text-[--text]">Behavioral Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Decision Distribution */}
            <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
              <h3 className="text-sm font-medium text-[--muted] mb-4">Decision Distribution</h3>
              <div className="h-48">
                <DecisionDonut data={Object.keys(decisionDist).length > 0 ? decisionDist : { 'no data': 1 }} />
              </div>
            </div>

            {/* Tool Usage */}
            <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
              <h3 className="text-sm font-medium text-[--muted] mb-4">Tool Usage</h3>
              <div className="space-y-3">
                {Object.entries(toolUsage).length > 0 ? (
                  Object.entries(toolUsage)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([tool, count]) => {
                      const max = Math.max(...Object.values(toolUsage));
                      const pct = (count / max) * 100;
                      return (
                        <div key={tool} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono text-[--text]">{tool}</span>
                            <span className="text-[--muted]">{count}</span>
                          </div>
                          <div className="h-1.5 bg-[--surface-2] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'var(--accent)' }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-[--muted] py-8 text-center">No tool data yet</p>
                )}
              </div>
            </div>

            {/* Drift Index */}
            <div className="bg-[--surface] border border-[--border] rounded-xl p-5">
              <h3 className="text-sm font-medium text-[--muted] mb-4">Behavioral Drift Index</h3>
              <div className="flex items-end gap-4">
                <DriftSparkline values={driftValues} />
                <div className="text-right">
                  <p className="text-2xl font-semibold text-[--accent]">
                    +{(driftValues[driftValues.length - 1] * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-[--muted]">vs 7d baseline</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
