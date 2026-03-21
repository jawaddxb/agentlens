from __future__ import annotations

import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

try:
    from backend.db import engine, get_db, init_db
    from backend.models import (  # noqa: E402
        AgentCreate, AgentResponse, DriftResult, EventCreate,
        EventResponse, SimulationCreate, SimulationResult,
        SimulationStatus, TraceResponse,
    )
    from backend.pipeline.drift import DriftDetector
    from backend.pipeline.fingerprint import FingerprintBuilder
    from backend.pipeline.normaliser import normalise_event
    from backend.simulation.runner import SimulationRunner
except ImportError:
    from db import engine, get_db, init_db  # type: ignore[no-redef]
    from models import (  # type: ignore[no-redef]
        AgentCreate, AgentResponse, DriftResult, EventCreate,
        EventResponse, SimulationCreate, SimulationResult,
        SimulationStatus, TraceResponse,
    )
    from pipeline.drift import DriftDetector  # type: ignore[no-redef]
    from pipeline.fingerprint import FingerprintBuilder  # type: ignore[no-redef]
    from pipeline.normaliser import normalise_event  # type: ignore[no-redef]
    from simulation.runner import SimulationRunner  # type: ignore[no-redef]

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AgentLens",
    description="AI Agent Observability & Simulation Platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    await init_db()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


@app.post("/api/agents", response_model=AgentResponse)
async def create_agent(body: AgentCreate) -> AgentResponse:
    async with get_db() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            text(
                "INSERT INTO agents (name, description, connector_type, status, config, created_at) "
                "VALUES (:name, :desc, :ct, 'active', :cfg, :now)"
            ),
            {
                "name": body.name,
                "desc": body.description,
                "ct": body.connector_type,
                "cfg": json.dumps(body.config),
                "now": now.isoformat(),
            },
        )
        agent_id = result.lastrowid
        return AgentResponse(
            id=agent_id,  # type: ignore[arg-type]
            name=body.name,
            description=body.description,
            connector_type=body.connector_type,
            status="active",
            created_at=now,
        )


@app.get("/api/agents", response_model=list[AgentResponse])
async def list_agents() -> list[AgentResponse]:
    async with get_db() as db:
        rows = await db.execute(text("SELECT * FROM agents ORDER BY created_at DESC"))
        agents = rows.mappings().all()

        responses: list[AgentResponse] = []
        for a in agents:
            # Live stats from recent events.
            one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            stats = await db.execute(
                text(
                    "SELECT COUNT(*) as cnt, "
                    "AVG(CASE WHEN json_extract(data, '$.status') = 'error' THEN 1.0 ELSE 0.0 END) as err_rate "
                    "FROM events WHERE agent_id = :aid AND timestamp >= :since"
                ),
                {"aid": a["id"], "since": one_hour_ago},
            )
            stat_row = stats.mappings().first()
            calls = stat_row["cnt"] if stat_row else 0
            err = stat_row["err_rate"] if stat_row and stat_row["err_rate"] else 0

            # P95 latency from recent events.
            latencies_result = await db.execute(
                text(
                    "SELECT json_extract(data, '$.latency_ms') as lat "
                    "FROM events WHERE agent_id = :aid AND timestamp >= :since "
                    "AND json_extract(data, '$.latency_ms') IS NOT NULL "
                    "ORDER BY json_extract(data, '$.latency_ms') ASC"
                ),
                {"aid": a["id"], "since": one_hour_ago},
            )
            lat_rows = latencies_result.all()
            p95 = 0.0
            if lat_rows:
                vals = [float(r[0]) for r in lat_rows if r[0] is not None]
                if vals:
                    idx = int(len(vals) * 0.95)
                    idx = min(idx, len(vals) - 1)
                    p95 = vals[idx]

            responses.append(
                AgentResponse(
                    id=a["id"],
                    name=a["name"],
                    description=a["description"] or "",
                    connector_type=a["connector_type"],
                    status=a["status"] or "active",
                    created_at=_parse_dt(a["created_at"]),
                    calls_per_hour=float(calls),
                    error_rate=round(float(err) * 100, 2),
                    p95_latency=round(p95, 2),
                )
            )
        return responses


# ---------------------------------------------------------------------------
# Traces / Events
# ---------------------------------------------------------------------------


@app.post("/api/traces", response_model=EventResponse)
async def ingest_event(body: EventCreate) -> EventResponse:
    raw = body.model_dump()
    normalised = normalise_event(raw)

    ts = normalised.get("timestamp")
    if isinstance(ts, str):
        timestamp = ts
    elif isinstance(ts, datetime):
        timestamp = ts.isoformat()
    else:
        timestamp = datetime.now(timezone.utc).isoformat()

    now = datetime.now(timezone.utc)

    async with get_db() as db:
        # Verify agent exists.
        agent_check = await db.execute(
            text("SELECT id FROM agents WHERE id = :aid"),
            {"aid": normalised["agent_id"]},
        )
        if not agent_check.first():
            raise HTTPException(status_code=404, detail=f"Agent {normalised['agent_id']} not found")

        result = await db.execute(
            text(
                "INSERT INTO events (agent_id, trace_id, event_type, data, timestamp, created_at) "
                "VALUES (:aid, :tid, :et, :data, :ts, :now)"
            ),
            {
                "aid": normalised["agent_id"],
                "tid": normalised["trace_id"],
                "et": normalised["event_type"],
                "data": json.dumps(normalised["data"]),
                "ts": timestamp,
                "now": now.isoformat(),
            },
        )
        event_id = result.lastrowid

        return EventResponse(
            id=event_id,  # type: ignore[arg-type]
            agent_id=normalised["agent_id"],
            trace_id=normalised["trace_id"],
            event_type=normalised["event_type"],
            data=normalised["data"],
            timestamp=_parse_dt(timestamp),
            created_at=now,
        )


@app.get("/api/traces/{agent_id}", response_model=list[TraceResponse])
async def get_traces(agent_id: int) -> list[TraceResponse]:
    async with get_db() as db:
        rows = await db.execute(
            text(
                "SELECT * FROM events WHERE agent_id = :aid "
                "ORDER BY timestamp DESC LIMIT 5000"
            ),
            {"aid": agent_id},
        )
        events = rows.mappings().all()

    # Group by trace_id.
    traces_map: dict[str, list[dict]] = {}
    for e in events:
        tid = e["trace_id"]
        traces_map.setdefault(tid, []).append(dict(e))

    # Take only the most recent 100 traces.
    sorted_traces = sorted(
        traces_map.items(),
        key=lambda kv: max(ev.get("timestamp", "") for ev in kv[1]),
        reverse=True,
    )[:100]

    results: list[TraceResponse] = []
    for trace_id, trace_events in sorted_traces:
        ev_responses = []
        for e in sorted(trace_events, key=lambda x: x.get("timestamp", "")):
            data = e["data"]
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except (json.JSONDecodeError, TypeError):
                    data = {}
            ev_responses.append(
                EventResponse(
                    id=e["id"],
                    agent_id=e["agent_id"],
                    trace_id=e["trace_id"],
                    event_type=e["event_type"],
                    data=data,
                    timestamp=_parse_dt(e["timestamp"]),
                    created_at=_parse_dt(e["created_at"]),
                )
            )

        if not ev_responses:
            continue

        start_time = ev_responses[0].timestamp
        end_time = ev_responses[-1].timestamp
        duration = (end_time - start_time).total_seconds() * 1000

        # Determine trace status from events.
        has_error = any(e.event_type == "error" for e in ev_responses)
        status = "error" if has_error else "complete"

        results.append(
            TraceResponse(
                id=trace_id,
                agent_id=agent_id,
                events=ev_responses,
                start_time=start_time,
                end_time=end_time,
                duration_ms=round(duration, 2),
                status=status,
            )
        )

    return results


# ---------------------------------------------------------------------------
# Recent events (cross-agent)
# ---------------------------------------------------------------------------


@app.get("/api/events/recent", response_model=list[EventResponse])
async def recent_events() -> list[EventResponse]:
    async with get_db() as db:
        rows = await db.execute(
            text("SELECT * FROM events ORDER BY timestamp DESC LIMIT 50")
        )
        events = rows.mappings().all()

    return [
        EventResponse(
            id=e["id"],
            agent_id=e["agent_id"],
            trace_id=e["trace_id"],
            event_type=e["event_type"],
            data=_safe_json(e["data"]),
            timestamp=_parse_dt(e["timestamp"]),
            created_at=_parse_dt(e["created_at"]),
        )
        for e in events
    ]


# ---------------------------------------------------------------------------
# Fingerprint + Drift
# ---------------------------------------------------------------------------


@app.get("/api/agents/{agent_id}/fingerprint")
async def get_fingerprint(agent_id: int) -> dict:
    async with get_db() as db:
        # Verify agent.
        agent_check = await db.execute(
            text("SELECT id FROM agents WHERE id = :aid"),
            {"aid": agent_id},
        )
        if not agent_check.first():
            raise HTTPException(status_code=404, detail="Agent not found")

        # Fetch all events for this agent.
        rows = await db.execute(
            text("SELECT * FROM events WHERE agent_id = :aid ORDER BY timestamp ASC"),
            {"aid": agent_id},
        )
        events_raw = rows.mappings().all()

    if not events_raw:
        raise HTTPException(status_code=404, detail="No events found for this agent")

    # Convert DB rows to normalised dicts.
    events = []
    for e in events_raw:
        data = e["data"]
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (json.JSONDecodeError, TypeError):
                data = {}
        events.append({
            "event_type": e["event_type"],
            "agent_id": e["agent_id"],
            "trace_id": e["trace_id"],
            "timestamp": e["timestamp"],
            "data": data,
        })

    # Build new fingerprint.
    builder = FingerprintBuilder()
    fingerprint = builder.build(events, agent_id=agent_id)

    # Fetch previous fingerprint for drift comparison.
    drift_result: dict | None = None
    async with get_db() as db:
        prev_row = await db.execute(
            text(
                "SELECT fingerprint_data FROM fingerprints "
                "WHERE agent_id = :aid ORDER BY created_at DESC LIMIT 1"
            ),
            {"aid": agent_id},
        )
        prev = prev_row.mappings().first()

        if prev:
            baseline_data = prev["fingerprint_data"]
            if isinstance(baseline_data, str):
                try:
                    baseline_data = json.loads(baseline_data)
                except (json.JSONDecodeError, TypeError):
                    baseline_data = {}
            if baseline_data:
                detector = DriftDetector()
                drift_result = detector.compare(fingerprint, baseline_data)

        # Store the new fingerprint.
        await db.execute(
            text(
                "INSERT INTO fingerprints (agent_id, fingerprint_data, created_at) "
                "VALUES (:aid, :fp, :now)"
            ),
            {
                "aid": agent_id,
                "fp": json.dumps(fingerprint),
                "now": datetime.now(timezone.utc).isoformat(),
            },
        )

    return {
        "fingerprint": fingerprint,
        "drift": drift_result,
    }


# ---------------------------------------------------------------------------
# Simulations
# ---------------------------------------------------------------------------


@app.post("/api/simulations", response_model=SimulationStatus)
async def create_simulation(body: SimulationCreate) -> SimulationStatus:
    async with get_db() as db:
        # Verify agent.
        agent_check = await db.execute(
            text("SELECT id FROM agents WHERE id = :aid"),
            {"aid": body.agent_id},
        )
        if not agent_check.first():
            raise HTTPException(status_code=404, detail="Agent not found")

        now = datetime.now(timezone.utc)
        config = {
            "num_twins": body.num_twins,
            "num_rounds": body.num_rounds,
            "options": body.options,
            "progress": 0.0,
            "current_round": 0,
            "total_rounds": body.num_rounds,
        }
        result = await db.execute(
            text(
                "INSERT INTO simulations (agent_id, scenario, config, status, created_at) "
                "VALUES (:aid, :scenario, :cfg, 'pending', :now)"
            ),
            {
                "aid": body.agent_id,
                "scenario": body.scenario,
                "cfg": json.dumps(config),
                "now": now.isoformat(),
            },
        )
        sim_id = result.lastrowid

    # Fetch fingerprint for the agent (build fresh if none exists).
    async with get_db() as db:
        rows = await db.execute(
            text("SELECT * FROM events WHERE agent_id = :aid ORDER BY timestamp ASC"),
            {"aid": body.agent_id},
        )
        events_raw = rows.mappings().all()

    events = []
    for e in events_raw:
        data = e["data"]
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (json.JSONDecodeError, TypeError):
                data = {}
        events.append({
            "event_type": e["event_type"],
            "agent_id": e["agent_id"],
            "trace_id": e["trace_id"],
            "timestamp": e["timestamp"],
            "data": data,
        })

    builder = FingerprintBuilder()
    fingerprint = builder.build(events, agent_id=body.agent_id)

    # Launch simulation in background.
    asyncio.create_task(
        _run_simulation_background(
            agent_id=body.agent_id,
            scenario=body.scenario,
            num_twins=body.num_twins,
            num_rounds=body.num_rounds,
            fingerprint=fingerprint,
            simulation_id=sim_id,  # type: ignore[arg-type]
        )
    )

    return SimulationStatus(
        id=sim_id,  # type: ignore[arg-type]
        status="pending",
        progress=0.0,
        current_round=0,
        total_rounds=body.num_rounds,
    )


async def _run_simulation_background(
    agent_id: int,
    scenario: str,
    num_twins: int,
    num_rounds: int,
    fingerprint: dict,
    simulation_id: int,
) -> None:
    """Run simulation in a background task with its own DB connections."""
    runner = SimulationRunner()
    try:
        await runner.run(
            agent_id=agent_id,
            scenario=scenario,
            num_twins=num_twins,
            num_rounds=num_rounds,
            fingerprint=fingerprint,
            simulation_id=simulation_id,
            engine=engine,
        )
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            "Background simulation %s failed", simulation_id
        )


@app.get("/api/simulations/{sim_id}/status", response_model=SimulationStatus)
async def simulation_status(sim_id: int) -> SimulationStatus:
    async with get_db() as db:
        row = await db.execute(
            text("SELECT * FROM simulations WHERE id = :id"),
            {"id": sim_id},
        )
        sim = row.mappings().first()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    config = sim["config"]
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except (json.JSONDecodeError, TypeError):
            config = {}

    return SimulationStatus(
        id=sim["id"],
        status=sim["status"],
        progress=float(config.get("progress", 0)),
        current_round=int(config.get("current_round", 0)),
        total_rounds=int(config.get("total_rounds", 0)),
    )


@app.get("/api/simulations/{sim_id}/results")
async def simulation_results(sim_id: int) -> dict:
    async with get_db() as db:
        row = await db.execute(
            text("SELECT * FROM simulations WHERE id = :id"),
            {"id": sim_id},
        )
        sim = row.mappings().first()

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if sim["status"] != "complete":
        raise HTTPException(
            status_code=404,
            detail=f"Simulation not complete (status: {sim['status']})",
        )

    result_data = sim["result_data"]
    if isinstance(result_data, str):
        try:
            result_data = json.loads(result_data)
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(status_code=500, detail="Corrupt simulation result data")

    if not result_data:
        raise HTTPException(status_code=500, detail="No result data available")

    return result_data


# ---------------------------------------------------------------------------
# Seed endpoint — populate demo data
# ---------------------------------------------------------------------------

_DEMO_AGENTS = [
    {
        "name": "support-v2",
        "description": "Customer support agent handling tickets, refunds, and escalations",
        "connector_type": "openai",
    },
    {
        "name": "sales-bot",
        "description": "Sales qualification and demo scheduling assistant",
        "connector_type": "langchain",
    },
    {
        "name": "code-reviewer",
        "description": "Automated code review agent for pull requests",
        "connector_type": "webhook",
    },
    {
        "name": "onboarding-agent",
        "description": "New user onboarding and setup wizard assistant",
        "connector_type": "openai",
    },
]

_TRACE_FLOWS = [
    ["user_message", "llm_call", "agent_response"],
    ["user_message", "llm_call", "tool_call", "llm_call", "agent_response"],
    ["user_message", "llm_call", "tool_call", "tool_call", "llm_call", "agent_response"],
    ["user_message", "llm_call", "error", "llm_call", "agent_response"],
    ["user_message", "llm_call", "tool_call", "escalation"],
    ["user_message", "llm_call", "tool_call", "llm_call", "tool_call", "agent_response"],
]

_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "claude-3-5-sonnet"]
_TOOLS = [
    "search_knowledge_base", "lookup_order", "check_inventory",
    "create_ticket", "send_email", "calculate_refund",
    "fetch_user_profile", "run_diagnostics", "query_database",
    "format_response", "translate_text", "analyze_sentiment",
]
_USER_MESSAGES = [
    "I need help with my account",
    "How do I reset my password?",
    "My order hasn't arrived yet",
    "Can I get a refund?",
    "The app is crashing on startup",
    "I want to upgrade my plan",
    "How does pricing work for teams?",
    "I found a bug in the checkout flow",
    "Can you review this pull request?",
    "I just signed up, what do I do first?",
    "The API is returning 500 errors",
    "I need to integrate with Salesforce",
]
_RESPONSES = [
    "I've looked into this and here's what I found...",
    "Let me check that for you right away.",
    "Based on your account details, I recommend...",
    "I've created a support ticket for this issue.",
    "The issue has been resolved. Here's what happened...",
    "I've escalated this to our engineering team.",
    "Here are the steps to complete your setup...",
    "I found 3 potential issues in the code review.",
    "Your order is currently in transit and should arrive by...",
    "I've processed your refund. It will appear in 3-5 business days.",
]


@app.post("/api/seed")
async def seed_demo_data() -> dict:
    """Generate realistic demo data for the dashboard."""
    now = datetime.now(timezone.utc)
    created_agents: list[dict] = []
    total_events = 0

    async with get_db() as db:
        # Check if data already exists.
        existing = await db.execute(text("SELECT COUNT(*) as cnt FROM agents"))
        count = existing.scalar()
        if count and count > 0:
            return {
                "message": "Data already seeded",
                "agents": count,
                "note": "Delete agentlens.db to re-seed",
            }

        for agent_def in _DEMO_AGENTS:
            # Create agent.
            agent_result = await db.execute(
                text(
                    "INSERT INTO agents (name, description, connector_type, status, config, created_at) "
                    "VALUES (:name, :desc, :ct, 'active', '{}', :now)"
                ),
                {
                    "name": agent_def["name"],
                    "desc": agent_def["description"],
                    "ct": agent_def["connector_type"],
                    "now": now.isoformat(),
                },
            )
            agent_id = agent_result.lastrowid

            # Generate traces and events.
            num_traces = random.randint(10, 20)
            agent_event_count = 0

            for t_idx in range(num_traces):
                trace_id = uuid.uuid4().hex[:16]
                flow = random.choice(_TRACE_FLOWS)

                # Spread traces across the last 24 hours.
                trace_start = now - timedelta(
                    hours=random.uniform(0.1, 24),
                    minutes=random.uniform(0, 59),
                )

                cumulative_ms = 0.0
                for step_idx, event_type in enumerate(flow):
                    # Realistic latency per step type.
                    if event_type == "llm_call":
                        step_latency = random.uniform(200, 2500)
                    elif event_type == "tool_call":
                        step_latency = random.uniform(50, 800)
                    elif event_type == "user_message":
                        step_latency = random.uniform(0, 50)
                    elif event_type == "error":
                        step_latency = random.uniform(100, 500)
                    elif event_type == "escalation":
                        step_latency = random.uniform(20, 100)
                    else:
                        step_latency = random.uniform(10, 200)

                    cumulative_ms += step_latency
                    event_ts = trace_start + timedelta(milliseconds=cumulative_ms)

                    # Build event data.
                    data = _build_event_data(event_type, step_latency)

                    await db.execute(
                        text(
                            "INSERT INTO events (agent_id, trace_id, event_type, data, timestamp, created_at) "
                            "VALUES (:aid, :tid, :et, :data, :ts, :now)"
                        ),
                        {
                            "aid": agent_id,
                            "tid": trace_id,
                            "et": event_type,
                            "data": json.dumps(data),
                            "ts": event_ts.isoformat(),
                            "now": now.isoformat(),
                        },
                    )
                    agent_event_count += 1

            total_events += agent_event_count
            created_agents.append({
                "id": agent_id,
                "name": agent_def["name"],
                "events": agent_event_count,
                "traces": num_traces,
            })

    return {
        "message": "Demo data seeded successfully",
        "agents": created_agents,
        "total_events": total_events,
    }


def _build_event_data(event_type: str, latency_ms: float) -> dict:
    """Build realistic event data for a given type."""
    base: dict[str, Any] = {
        "latency_ms": round(latency_ms, 2),
        "status": "ok",
        "sentiment": round(random.uniform(0.3, 0.9), 2),
    }

    if event_type == "user_message":
        base["response"] = random.choice(_USER_MESSAGES)
        base["tokens_in"] = random.randint(10, 200)
        base["tokens_out"] = 0

    elif event_type == "llm_call":
        base["model"] = random.choice(_MODELS)
        base["tokens_in"] = random.randint(100, 2000)
        base["tokens_out"] = random.randint(50, 1500)
        base["response"] = random.choice(_RESPONSES)

    elif event_type == "tool_call":
        tool = random.choice(_TOOLS)
        base["tool_name"] = tool
        base["tool_input"] = json.dumps({"query": f"sample input for {tool}"})
        base["tool_output"] = json.dumps({"result": f"output from {tool}", "count": random.randint(1, 50)})
        base["tokens_in"] = 0
        base["tokens_out"] = 0

    elif event_type == "agent_response":
        base["response"] = random.choice(_RESPONSES)
        base["tokens_in"] = random.randint(50, 500)
        base["tokens_out"] = random.randint(100, 800)
        base["model"] = random.choice(_MODELS)

    elif event_type == "error":
        base["status"] = "error"
        base["response"] = random.choice([
            "Rate limit exceeded",
            "Context window overflow",
            "Tool execution timeout",
            "Invalid API response",
            "Model unavailable",
        ])
        base["sentiment"] = round(random.uniform(0.1, 0.3), 2)

    elif event_type == "escalation":
        base["response"] = "Escalated to human operator"
        base["sentiment"] = round(random.uniform(0.1, 0.4), 2)
        base["tool_name"] = "escalate_to_human"

    return base


# ---------------------------------------------------------------------------
# Webhook ingestion (alternative to /api/traces for raw webhooks)
# ---------------------------------------------------------------------------


@app.post("/api/webhook")
async def webhook_ingest(request: Request) -> dict:
    """Accept raw webhook payloads with X-AgentLens-Project header."""
    try:
        from backend.connectors.webhook import parse_webhook_event
    except ImportError:
        from connectors.webhook import parse_webhook_event  # type: ignore[no-redef]

    body = await request.json()
    headers = dict(request.headers)
    normalised = parse_webhook_event(headers, body)

    # Re-use the traces endpoint logic.
    event = EventCreate(
        agent_id=normalised["agent_id"],
        trace_id=normalised["trace_id"],
        event_type=normalised["event_type"],
        data=normalised["data"],
    )
    result = await ingest_event(event)
    return result.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def _parse_dt(value: Any) -> datetime:
    """Parse a datetime from various formats."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _safe_json(value: Any) -> dict:
    """Ensure value is a dict, parsing JSON string if needed."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
    return {}
