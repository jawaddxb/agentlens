"""LensCallbackHandler — LangChain callback that emits events to AgentLens."""

from __future__ import annotations

import time
import uuid
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from agentlens.client import LensClient

try:
    from langchain_core.callbacks.base import BaseCallbackHandler
    from langchain_core.outputs import LLMResult
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    try:
        from langchain.callbacks.base import BaseCallbackHandler  # type: ignore[no-redef]
        from langchain.schema import LLMResult  # type: ignore[assignment]
        _LANGCHAIN_AVAILABLE = True
    except ImportError:
        _LANGCHAIN_AVAILABLE = False
        BaseCallbackHandler = object  # type: ignore[assignment,misc]
        LLMResult = object  # type: ignore[assignment]


class LensCallbackHandler(BaseCallbackHandler):  # type: ignore[misc]
    """LangChain callback handler that sends events to an AgentLens backend.

    Usage::

        from langchain_openai import ChatOpenAI
        from agentlens import LensClient, LensCallbackHandler

        lens = LensClient(url="http://localhost:8002", agent_name="my-langchain-agent")
        handler = LensCallbackHandler(lens)

        llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
        llm.invoke("Hello!")
    """

    def __init__(self, lens_client: "LensClient") -> None:
        if not _LANGCHAIN_AVAILABLE:
            raise ImportError(
                "langchain or langchain-core is required: pip install langchain-core"
            )
        super().__init__()
        self.lens = lens_client
        self._start_times: dict[str, float] = {}
        self._trace_id = uuid.uuid4().hex[:16]

    # ------------------------------------------------------------------
    # LLM callbacks
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        self._start_times[str(run_id)] = time.monotonic()
        self.lens.send_event(
            event_type="llm_start",
            data={
                "model": serialized.get("kwargs", {}).get("model_name", "unknown"),
                "prompt_len": sum(len(p) for p in prompts),
            },
            trace_id=self._trace_id,
        )

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        latency_ms = None
        start = self._start_times.pop(str(run_id), None)
        if start:
            latency_ms = round((time.monotonic() - start) * 1000, 2)

        tokens_in = 0
        tokens_out = 0
        model = "unknown"
        try:
            llm_output = response.llm_output or {}
            usage = llm_output.get("token_usage", {})
            tokens_in = usage.get("prompt_tokens", 0)
            tokens_out = usage.get("completion_tokens", 0)
            model = llm_output.get("model_name", "unknown")
        except Exception:
            pass

        self.lens.send_event(
            event_type="llm_call",
            data={
                "model": model,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "latency_ms": latency_ms,
                "status": "ok",
            },
            trace_id=self._trace_id,
        )

    def on_llm_error(
        self,
        error: Exception,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        self._start_times.pop(str(run_id), None)
        self.lens.send_event(
            event_type="error",
            data={"status": "error", "error": str(error)},
            trace_id=self._trace_id,
        )

    # ------------------------------------------------------------------
    # Tool callbacks
    # ------------------------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        self._start_times[f"tool_{run_id}"] = time.monotonic()
        self.lens.send_event(
            event_type="tool_call",
            data={
                "tool_name": serialized.get("name", "unknown"),
                "tool_input": input_str[:500],
                "status": "started",
            },
            trace_id=self._trace_id,
        )

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        start = self._start_times.pop(f"tool_{run_id}", None)
        latency_ms = round((time.monotonic() - start) * 1000, 2) if start else None
        self.lens.send_event(
            event_type="tool_call",
            data={
                "tool_output": output[:500],
                "latency_ms": latency_ms,
                "status": "ok",
            },
            trace_id=self._trace_id,
        )

    def on_tool_error(
        self,
        error: Exception,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        self._start_times.pop(f"tool_{run_id}", None)
        self.lens.send_event(
            event_type="error",
            data={"status": "error", "error": str(error), "source": "tool"},
            trace_id=self._trace_id,
        )
