from __future__ import annotations

try:
    from backend.pipeline.normaliser import normalise_event
except ImportError:
    from pipeline.normaliser import normalise_event  # type: ignore[no-redef]


def parse_webhook_event(headers: dict, body: dict) -> dict:
    """Parse an incoming webhook payload into a normalised AgentLens event.

    The ``X-AgentLens-Project`` header (case-insensitive) maps to the agent_id.
    Falls back to the body's ``agent_id`` field, then to 0.
    """
    # Header look-up is case-insensitive.
    agent_id: int | str | None = None
    for key, value in headers.items():
        if key.lower() == "x-agentlens-project":
            agent_id = value
            break

    if agent_id is None:
        agent_id = body.get("agent_id", body.get("agentId", 0))

    # Ensure integer.
    try:
        agent_id = int(agent_id)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        agent_id = 0

    # Merge agent_id into the raw body before normalising.
    raw = {**body, "agent_id": agent_id}
    return normalise_event(raw)
