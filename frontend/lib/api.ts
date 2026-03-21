const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Types matching backend models
// ---------------------------------------------------------------------------

export interface Agent {
  id: number
  name: string
  description: string
  connector_type: string
  status: 'active' | 'inactive'
  created_at: string
  calls_per_hour: number
  error_rate: number
  p95_latency: number
}

export interface AgentEvent {
  id: number
  agent_id: number
  trace_id: string
  event_type: string
  data: Record<string, unknown>
  timestamp: string
  created_at: string
}

export interface Trace {
  id: string
  agent_id: number
  events: AgentEvent[]
  start_time: string
  end_time: string
  duration_ms: number
  status: string
}

export interface FingerprintNode {
  id: string
  label: string
  type: string
  frequency: number
}

export interface FingerprintEdge {
  source: string
  target: string
  weight: number
  avg_sentiment: number
}

export interface BehavioralFingerprint {
  agent_id: number
  nodes: FingerprintNode[]
  edges: FingerprintEdge[]
  top_paths: Record<string, unknown>[]
  decision_distribution: Record<string, number>
  tool_usage: Record<string, number>
  temporal_heatmap: number[][]
  generated_at: string
}

export interface DriftResult {
  agent_id: number
  current_score: number
  baseline_score: number
  drift_percentage: number
  alerts: string[]
}

export interface SimulationConfig {
  agent_id: number
  scenario: string
  num_twins?: number
  num_rounds?: number
  options?: Record<string, unknown>
}

export interface SimulationStatus {
  id: number
  status: string
  progress: number
  current_round: number
  total_rounds: number
}

export interface TwinState {
  twin_id: string
  state: string
  decisions: Record<string, unknown>[]
  current_step: string | null
}

export interface SimulationResult {
  id: number
  agent_id: number
  scenario: string
  num_twins: number
  num_rounds: number
  divergence_score: number
  outcome_distribution: Record<string, number>
  twin_states: TwinState[]
  decision_feed: Record<string, unknown>[]
  behavioral_comparison: Record<string, unknown>
  created_at: string
  completed_at: string
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(
      `API error ${res.status}: ${res.statusText}${errorBody ? ` — ${errorBody}` : ''}`
    )
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const api = {
  // Agents
  getAgents: () => fetchAPI<Agent[]>('/api/agents'),

  createAgent: (data: Partial<Agent>) =>
    fetchAPI<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Traces
  getTraces: (agentId: number) =>
    fetchAPI<Trace[]>(`/api/traces/${agentId}`),

  // Fingerprint & Drift
  getFingerprint: (agentId: number) =>
    fetchAPI<{ fingerprint: BehavioralFingerprint; drift: DriftResult | null }>(
      `/api/agents/${agentId}/fingerprint`
    ),

  // Events
  getRecentEvents: () => fetchAPI<AgentEvent[]>('/api/events/recent'),

  // Simulations
  createSimulation: (config: SimulationConfig) =>
    fetchAPI<SimulationStatus>('/api/simulations', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getSimulationStatus: (id: number) =>
    fetchAPI<SimulationStatus>(`/api/simulations/${id}/status`),

  getSimulationResults: (id: number) =>
    fetchAPI<SimulationResult>(`/api/simulations/${id}/results`),

  // Utilities
  seedData: () =>
    fetchAPI<{ status: string }>('/api/seed', { method: 'POST' }),

  health: () =>
    fetchAPI<{ status: string; version: string }>('/api/health'),
}
