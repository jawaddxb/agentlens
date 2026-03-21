'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Cpu, Shield, Database, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useAgents } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function SimulationSetupPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-[--muted]">Loading...</div>}>
      <SimulationSetupContent />
    </Suspense>
  );
}

function SimulationSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: agents } = useAgents();

  const preselectedAgent = searchParams.get('agent');
  const [selectedAgent, setSelectedAgent] = useState<number>(preselectedAgent ? Number(preselectedAgent) : 0);
  const [scenario, setScenario] = useState('');
  const [numTwins, setNumTwins] = useState(20);
  const [numRounds, setNumRounds] = useState(10);
  const [xbpp, setXbpp] = useState(false);
  const [neutron, setNeutron] = useState(false);
  const [knowracle, setKnowracle] = useState(true);
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!selectedAgent || !scenario.trim()) return;
    setLaunching(true);
    try {
      const result = await api.createSimulation({
        agent_id: selectedAgent,
        scenario: scenario.trim(),
        num_twins: numTwins,
        num_rounds: numRounds,
        options: { xbpp, neutron, knowracle },
      });
      router.push(`/simulations/${result.id}`);
    } catch (e) {
      console.error('Failed to create simulation:', e);
      setLaunching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/" className="p-2 hover:bg-[--surface-2] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-[--muted]" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Simulation Lab</h1>
          <p className="text-sm text-[--muted]">Configure and run behavioral simulations</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[--surface] border border-[--border] rounded-xl p-6 space-y-6"
      >
        {/* Agent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[--text]">Agent</label>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(Number(e.target.value))}
            className="w-full px-4 py-2.5 bg-[--surface-2] border border-[--border] rounded-lg text-[--text] focus:outline-none focus:border-[--accent] transition-colors"
          >
            <option value={0}>Select an agent...</option>
            {agents?.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.connector_type})
              </option>
            ))}
          </select>
        </div>

        {/* Scenario */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[--text]">Scenario</label>
          <textarea
            value={scenario}
            onChange={e => setScenario(e.target.value)}
            placeholder="Describe the scenario to test... e.g. 'What if the system prompt changes to a formal tone?' or 'Stress test with adversarial user inputs'"
            rows={4}
            className="w-full px-4 py-3 bg-[--surface-2] border border-[--border] rounded-lg text-[--text] placeholder:text-[--muted] focus:outline-none focus:border-[--accent] transition-colors resize-none font-mono text-sm"
          />
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[--text]">Synthetic Users (Twins)</label>
            <input
              type="number"
              value={numTwins}
              onChange={e => setNumTwins(Number(e.target.value))}
              min={1}
              max={100}
              className="w-full px-4 py-2.5 bg-[--surface-2] border border-[--border] rounded-lg text-[--text] focus:outline-none focus:border-[--accent] transition-colors font-mono"
            />
            <p className="text-xs text-[--muted]">Number of simulation twin instances</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[--text]">Rounds</label>
            <input
              type="number"
              value={numRounds}
              onChange={e => setNumRounds(Number(e.target.value))}
              min={1}
              max={50}
              className="w-full px-4 py-2.5 bg-[--surface-2] border border-[--border] rounded-lg text-[--text] focus:outline-none focus:border-[--accent] transition-colors font-mono"
            />
            <p className="text-xs text-[--muted]">Simulation rounds per twin</p>
          </div>
        </div>

        {/* Vanar Stack Toggles */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-[--text]">Vanar Stack Integration</label>
          <div className="space-y-2">
            {[
              { key: 'xbpp', label: 'Vanar xBPP', desc: 'Policy governance — 12-check enforcement', icon: Shield, state: xbpp, set: setXbpp },
              { key: 'neutron', label: 'Neutron Memory', desc: 'Persistent encrypted memory across runs', icon: Database, state: neutron, set: setNeutron },
              { key: 'knowracle', label: 'Knowracle Attestation', desc: 'On-chain tamper-proof audit trail', icon: LinkIcon, state: knowracle, set: setKnowracle },
            ].map(toggle => (
              <div
                key={toggle.key}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                  toggle.state
                    ? 'bg-[--accent-dim] border-[--accent]'
                    : 'bg-[--surface-2] border-[--border] hover:border-[--muted]'
                }`}
                onClick={() => toggle.set(!toggle.state)}
              >
                <div className="flex items-center gap-3">
                  <toggle.icon className={`w-4 h-4 ${toggle.state ? 'text-[--accent]' : 'text-[--muted]'}`} />
                  <div>
                    <p className="text-sm font-medium">{toggle.label}</p>
                    <p className="text-xs text-[--muted]">{toggle.desc}</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                  toggle.state ? 'bg-[--accent] justify-end' : 'bg-[--border] justify-start'
                }`}>
                  <div className="w-4 h-4 mx-1 bg-white rounded-full shadow-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Launch Button */}
        <button
          onClick={handleLaunch}
          disabled={!selectedAgent || !scenario.trim() || launching}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[--accent] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {launching ? (
            <>
              <Cpu className="w-5 h-5 animate-spin" />
              Launching Simulation...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Run Simulation
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}
