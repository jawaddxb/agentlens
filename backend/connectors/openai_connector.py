from __future__ import annotations

import functools
import time
from typing import Any

import httpx


class OpenAIInstrumentor:
    """Wrap an OpenAI client to automatically report events to AgentLens."""

    def instrument(self, client: Any, agent_id: int, api_url: str) -> Any:
        """Monkey-patch ``client.chat.completions.create`` to capture telemetry.

        Returns the same client instance (mutated in place).
        """
        original_create = client.chat.completions.create

        @functools.wraps(original_create)
        def _wrapped_create(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            error_occurred = False
            response = None

            try:
                response = original_create(*args, **kwargs)
                return response
            except Exception as exc:
                error_occurred = True
                self._report_event(
                    api_url=api_url,
                    agent_id=agent_id,
                    event_type="error",
                    data={
                        "model": kwargs.get("model", ""),
                        "error": str(exc),
                        "latency_ms": round((time.perf_counter() - start) * 1000, 2),
                    },
                    messages=kwargs.get("messages"),
                )
                raise
            finally:
                if not error_occurred and response is not None:
                    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
                    self._report_event(
                        api_url=api_url,
                        agent_id=agent_id,
                        event_type="llm_call",
                        data=self._extract_data(kwargs, response, elapsed_ms),
                        messages=kwargs.get("messages"),
                    )

        client.chat.completions.create = _wrapped_create
        return client

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_data(kwargs: dict, response: Any, latency_ms: float) -> dict:
        """Pull telemetry from the OpenAI request/response pair."""
        usage = getattr(response, "usage", None)
        choices = getattr(response, "choices", [])
        first_message = choices[0].message.content if choices else ""

        return {
            "model": kwargs.get("model") or getattr(response, "model", ""),
            "tokens_in": getattr(usage, "prompt_tokens", 0) if usage else 0,
            "tokens_out": getattr(usage, "completion_tokens", 0) if usage else 0,
            "latency_ms": latency_ms,
            "response": first_message[:500],  # cap to avoid huge payloads
            "status": "ok",
        }

    @staticmethod
    def _report_event(
        api_url: str,
        agent_id: int,
        event_type: str,
        data: dict,
        messages: list[dict] | None = None,
    ) -> None:
        """Fire-and-forget POST to the AgentLens API."""
        import uuid

        payload = {
            "agent_id": agent_id,
            "trace_id": uuid.uuid4().hex,
            "event_type": event_type,
            "data": data,
        }

        try:
            httpx.post(
                f"{api_url.rstrip('/')}/api/traces",
                json=payload,
                timeout=5.0,
            )
        except Exception:
            # Instrumentation must never crash the host application.
            pass
