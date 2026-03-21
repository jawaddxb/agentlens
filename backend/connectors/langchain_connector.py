from __future__ import annotations

import time
import uuid
from typing import Any

import httpx


class LensCallbackHandler:
    """LangChain-compatible callback handler that reports events to AgentLens.

    Implements the core callback methods expected by LangChain's
    ``BaseCallbackHandler`` interface without importing LangChain itself,
    so the connector can be installed in any project.
    """

    def __init__(self, agent_id: int, api_url: str) -> None:
        self.agent_id = agent_id
        self.api_url = api_url.rstrip("/")
        self._trace_id: str = uuid.uuid4().hex
        self._timers: dict[str, float] = {}

    # ------------------------------------------------------------------
    # LLM callbacks
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        key = str(run_id or uuid.uuid4().hex)
        self._timers[key] = time.perf_counter()
        self._send(
            event_type="llm_call",
            data={
                "model": serialized.get("name", serialized.get("id", ["unknown"])[-1] if serialized.get("id") else ""),
                "prompt_preview": (prompts[0][:200] if prompts else ""),
                "status": "started",
            },
            run_id=key,
        )

    def on_llm_end(self, response: Any, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "")
        elapsed = self._elapsed(key)

        # LangChain LLMResult has .generations list.
        text = ""
        token_usage: dict = {}
        if hasattr(response, "generations") and response.generations:
            gen = response.generations[0]
            if gen:
                text = getattr(gen[0], "text", "")
        if hasattr(response, "llm_output") and isinstance(response.llm_output, dict):
            token_usage = response.llm_output.get("token_usage", {})

        self._send(
            event_type="llm_call",
            data={
                "response": text[:500],
                "tokens_in": token_usage.get("prompt_tokens", 0),
                "tokens_out": token_usage.get("completion_tokens", 0),
                "latency_ms": elapsed,
                "status": "ok",
            },
            run_id=key,
        )

    # ------------------------------------------------------------------
    # Tool callbacks
    # ------------------------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        key = str(run_id or uuid.uuid4().hex)
        self._timers[key] = time.perf_counter()
        self._send(
            event_type="tool_call",
            data={
                "tool_name": serialized.get("name", ""),
                "tool_input": input_str[:500],
                "status": "started",
            },
            run_id=key,
        )

    def on_tool_end(self, output: str, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "")
        elapsed = self._elapsed(key)
        self._send(
            event_type="tool_call",
            data={
                "tool_output": output[:500] if isinstance(output, str) else str(output)[:500],
                "latency_ms": elapsed,
                "status": "ok",
            },
            run_id=key,
        )

    # ------------------------------------------------------------------
    # Chain callbacks
    # ------------------------------------------------------------------

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        key = str(run_id or uuid.uuid4().hex)
        self._timers[key] = time.perf_counter()
        self._send(
            event_type="agent_response",
            data={
                "chain_name": serialized.get("name", serialized.get("id", ["unknown"])[-1] if serialized.get("id") else ""),
                "input_keys": list(inputs.keys()) if isinstance(inputs, dict) else [],
                "status": "started",
            },
            run_id=key,
        )

    def on_chain_end(self, outputs: dict[str, Any], *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "")
        elapsed = self._elapsed(key)
        self._send(
            event_type="agent_response",
            data={
                "output_keys": list(outputs.keys()) if isinstance(outputs, dict) else [],
                "latency_ms": elapsed,
                "status": "ok",
            },
            run_id=key,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _elapsed(self, key: str) -> float:
        start = self._timers.pop(key, None)
        if start is None:
            return 0.0
        return round((time.perf_counter() - start) * 1000, 2)

    def _send(self, event_type: str, data: dict, run_id: str = "") -> None:
        payload = {
            "agent_id": self.agent_id,
            "trace_id": self._trace_id,
            "event_type": event_type,
            "data": data,
        }
        try:
            httpx.post(
                f"{self.api_url}/api/traces",
                json=payload,
                timeout=5.0,
            )
        except Exception:
            pass  # Never crash the host application.
