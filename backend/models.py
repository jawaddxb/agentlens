from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class AgentCreate(BaseModel):
    name: str
    description: str = ""
    connector_type: Literal["openai", "langchain", "webhook"] = "openai"
    config: dict = Field(default_factory=dict)


class AgentResponse(BaseModel):
    id: int
    name: str
    description: str
    connector_type: str
    status: Literal["active", "inactive"] = "active"
    created_at: datetime
    calls_per_hour: float = 0
    error_rate: float = 0
    p95_latency: float = 0


# ---------------------------------------------------------------------------
# Events / Traces
# ---------------------------------------------------------------------------

class EventCreate(BaseModel):
    agent_id: int
    trace_id: str
    event_type: str
    data: dict = Field(default_factory=dict)
    timestamp: datetime | None = None


class EventResponse(BaseModel):
    id: int
    agent_id: int
    trace_id: str
    event_type: str
    data: dict
    timestamp: datetime
    created_at: datetime


class TraceResponse(BaseModel):
    id: str
    agent_id: int
    events: list[EventResponse]
    start_time: datetime
    end_time: datetime
    duration_ms: float
    status: str


# ---------------------------------------------------------------------------
# Behavioral Fingerprint
# ---------------------------------------------------------------------------

class FingerprintNode(BaseModel):
    id: str
    label: str
    type: str
    frequency: float = 0.0


class FingerprintEdge(BaseModel):
    source: str
    target: str
    weight: float = 0.0
    avg_sentiment: float = 0.5


class BehavioralFingerprint(BaseModel):
    agent_id: int
    nodes: list[FingerprintNode]
    edges: list[FingerprintEdge]
    top_paths: list[dict]
    decision_distribution: dict
    tool_usage: dict
    temporal_heatmap: list[list[float]]
    generated_at: datetime


# ---------------------------------------------------------------------------
# Drift Detection
# ---------------------------------------------------------------------------

class DriftResult(BaseModel):
    agent_id: int
    current_score: float
    baseline_score: float
    drift_percentage: float
    alerts: list[str]


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

class SimulationCreate(BaseModel):
    agent_id: int
    scenario: str
    num_twins: int = 20
    num_rounds: int = 10
    options: dict = Field(default_factory=dict)


class SimulationStatus(BaseModel):
    id: int
    status: Literal["pending", "running", "complete", "failed"] = "pending"
    progress: float = 0.0
    current_round: int = 0
    total_rounds: int = 0


class TwinState(BaseModel):
    twin_id: int
    state: Literal["idle", "thinking", "complete", "error"] = "idle"
    decisions: list[dict] = Field(default_factory=list)
    current_step: str | None = None


class SimulationResult(BaseModel):
    id: int
    agent_id: int
    scenario: str
    num_twins: int
    num_rounds: int
    divergence_score: float
    outcome_distribution: dict
    twin_states: list[TwinState]
    decision_feed: list[dict]
    behavioral_comparison: dict
    created_at: datetime
    completed_at: datetime | None = None
