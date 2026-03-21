import useSWR from 'swr'
import { api } from './api'

export function useAgents() {
  return useSWR('agents', api.getAgents, {
    refreshInterval: 2000,
  })
}

export function useRecentEvents() {
  return useSWR('events', api.getRecentEvents, {
    refreshInterval: 2000,
  })
}

export function useTraces(agentId: number) {
  return useSWR(
    agentId ? `traces-${agentId}` : null,
    () => api.getTraces(agentId)
  )
}

export function useFingerprint(agentId: number) {
  return useSWR(
    agentId ? `fingerprint-${agentId}` : null,
    () => api.getFingerprint(agentId)
  )
}

export function useSimulationStatus(id: number) {
  return useSWR(
    id ? `sim-status-${id}` : null,
    () => api.getSimulationStatus(id),
    { refreshInterval: 1000 }
  )
}

export function useSimulationResults(id: number) {
  return useSWR(
    id ? `sim-results-${id}` : null,
    () => api.getSimulationResults(id)
  )
}
