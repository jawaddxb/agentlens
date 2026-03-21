from __future__ import annotations

import uuid
from datetime import datetime, timezone


# Maps raw field names / patterns to canonical event types.
_TYPE_HINTS: dict[str, str] = {
    "llm": "llm_call",
    "chat.completion": "llm_call",
    "completion": "llm_call",
    "tool": "tool_call",
    "function_call": "tool_call",
    "user": "user_message",
    "human": "user_message",
    "agent": "agent_response",
    "assistant": "agent_response",
    "ai": "agent_response",
    "error": "error",
    "exception": "error",
    "escalate": "escalation",
    "escalation": "escalation",
    "handoff": "escalation",
}


def _detect_event_type(raw: dict) -> str:
    """Infer the canonical event type from raw data heuristics."""
    # Explicit field takes precedence.
    explicit = raw.get("event_type") or raw.get("type") or raw.get("kind") or ""
    explicit_lower = explicit.lower()
    for hint, canonical in _TYPE_HINTS.items():
        if hint in explicit_lower:
            return canonical
    if explicit:
        return explicit

    # Fallback: inspect payload keys.
    if "tool_name" in raw or "function_call" in raw:
        return "tool_call"
    if "model" in raw or "tokens" in raw or "completion" in raw:
        return "llm_call"
    if raw.get("role") == "user":
        return "user_message"
    if raw.get("role") in ("assistant", "agent"):
        return "agent_response"
    if "error" in raw or "exception" in raw:
        return "error"
    return "unknown"


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def normalise_event(raw: dict) -> dict:
    """Normalise a raw event from any connector into the AgentLens schema.

    Returns a dict matching the shape expected by EventCreate:
    ``{event_type, agent_id, trace_id, timestamp, data: {...}}``.
    """
    event_type = _detect_event_type(raw)

    agent_id = raw.get("agent_id") or raw.get("agentId") or raw.get("project_id") or 0
    trace_id = raw.get("trace_id") or raw.get("traceId") or raw.get("run_id") or uuid.uuid4().hex

    # Timestamp handling: accept ISO strings, epoch floats, or default to now.
    ts_raw = raw.get("timestamp") or raw.get("ts") or raw.get("created_at")
    if isinstance(ts_raw, str):
        try:
            timestamp = datetime.fromisoformat(ts_raw)
        except ValueError:
            timestamp = datetime.now(timezone.utc)
    elif isinstance(ts_raw, (int, float)):
        timestamp = datetime.fromtimestamp(ts_raw, tz=timezone.utc)
    elif isinstance(ts_raw, datetime):
        timestamp = ts_raw
    else:
        timestamp = datetime.now(timezone.utc)

    # Build canonical data payload -- pull from nested 'data' or top-level.
    nested = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    source = {**raw, **nested}

    data = {
        "model": source.get("model") or source.get("model_name") or "",
        "tokens_in": _safe_int(source.get("tokens_in") or source.get("prompt_tokens") or source.get("input_tokens")),
        "tokens_out": _safe_int(source.get("tokens_out") or source.get("completion_tokens") or source.get("output_tokens")),
        "latency_ms": _safe_float(source.get("latency_ms") or source.get("duration_ms") or source.get("latency")),
        "tool_name": source.get("tool_name") or source.get("function_name") or "",
        "tool_input": source.get("tool_input") or source.get("function_args") or "",
        "tool_output": source.get("tool_output") or source.get("function_result") or "",
        "response": source.get("response") or source.get("content") or source.get("output") or "",
        "sentiment": _safe_float(source.get("sentiment"), default=0.5),
        "status": source.get("status") or ("error" if event_type == "error" else "ok"),
    }

    return {
        "event_type": event_type,
        "agent_id": agent_id,
        "trace_id": str(trace_id),
        "timestamp": timestamp.isoformat() if isinstance(timestamp, datetime) else timestamp,
        "data": data,
    }
