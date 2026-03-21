"""LensClient — HTTP sender to AgentLens backend."""

from __future__ import annotations

import os
import json
import uuid
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Any


class LensClient:
    """Send events and manage traces against an AgentLens backend.

    Args:
        url: Base URL of the AgentLens backend (default: AGENTLENS_URL env or http://localhost:8002)
        agent_name: Name to register events under (default: AGENTLENS_AGENT env or "default-agent")
        api_key: Optional API key (default: AGENTLENS_API_KEY env)
    """

    def __init__(
        self,
        url: str | None = None,
        agent_name: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.url = (url or os.getenv("AGENTLENS_URL", "http://localhost:8002")).rstrip("/")
        self.agent_name = agent_name or os.getenv("AGENTLENS_AGENT", "default-agent")
        self.api_key = api_key or os.getenv("AGENTLENS_API_KEY")
        self._active_traces: dict[str, datetime] = {}

    # ------------------------------------------------------------------
    # Trace management
    # ------------------------------------------------------------------

    def start_trace(self) -> str:
        """Start a new trace and return its trace_id."""
        trace_id = uuid.uuid4().hex[:16]
        self._active_traces[trace_id] = datetime.now(timezone.utc)
        self.send_event(
            event_type="trace_start",
            data={"started_at": datetime.now(timezone.utc).isoformat()},
            trace_id=trace_id,
        )
        return trace_id

    def end_trace(self, trace_id: str) -> None:
        """End a trace and emit a trace_end event."""
        started_at = self._active_traces.pop(trace_id, None)
        duration_ms = None
        if started_at:
            duration_ms = (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
        self.send_event(
            event_type="trace_end",
            data={
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": round(duration_ms, 2) if duration_ms else None,
            },
            trace_id=trace_id,
        )

    # ------------------------------------------------------------------
    # Event sending
    # ------------------------------------------------------------------

    def send_event(
        self,
        event_type: str,
        data: dict[str, Any],
        trace_id: str | None = None,
    ) -> None:
        """Fire-and-forget event to AgentLens backend (background thread)."""
        payload = {
            "agent_name": self.agent_name,
            "event_type": event_type,
            "trace_id": trace_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "api_key": self.api_key,
        }
        t = threading.Thread(target=self._post, args=(payload,), daemon=True)
        t.start()

    def _post(self, payload: dict) -> None:
        """Synchronous HTTP POST — runs in background thread."""
        try:
            body = json.dumps(payload).encode()
            req = urllib.request.Request(
                f"{self.url}/api/ingest",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception:  # noqa: BLE001 — never crash caller
            pass

    def send_batch(self, events: list[dict[str, Any]]) -> None:
        """Send a batch of events (background thread)."""
        t = threading.Thread(target=self._post_batch, args=(events,), daemon=True)
        t.start()

    def _post_batch(self, events: list[dict]) -> None:
        try:
            body = json.dumps(events).encode()
            req = urllib.request.Request(
                f"{self.url}/api/ingest/batch",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10):
                pass
        except Exception:  # noqa: BLE001
            pass
