"""instrument_openai — monkey-patch OpenAI clients to capture LLM call events."""

from __future__ import annotations

import hashlib
import json
import time
import threading
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from agentlens.client import LensClient


def instrument_openai(client: "LensClient", openai_client: Any = None) -> None:
    """Patch an OpenAI client (or the global openai module) to emit llm_call events.

    Args:
        client: LensClient instance to send events to.
        openai_client: An OpenAI or AsyncOpenAI instance. If None, patches the
                       global openai.chat.completions.create.

    Usage::

        from openai import OpenAI
        from agentlens import LensClient, instrument_openai

        lens = LensClient(url="http://localhost:8002", agent_name="my-agent")
        oai = OpenAI()
        instrument_openai(lens, oai)

        # All calls now send events to AgentLens
        oai.chat.completions.create(model="gpt-4o", messages=[...])
    """
    if openai_client is None:
        import openai as _openai_module
        _patch_completions(client, _openai_module.chat.completions)
    else:
        _patch_completions(client, openai_client.chat.completions)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _messages_hash(messages: list[dict]) -> str:
    try:
        return _hash(json.dumps(messages, sort_keys=True))
    except Exception:
        return "unknown"


def _response_hash(response: Any) -> str:
    try:
        content = response.choices[0].message.content or ""
        return _hash(content)
    except Exception:
        return "unknown"


def _patch_completions(lens_client: "LensClient", completions_obj: Any) -> None:
    """Patch both sync .create and async .create on a completions object."""
    original_create = completions_obj.create

    import inspect

    if inspect.iscoroutinefunction(original_create):
        # Already async — wrap async
        async def _async_create(*args: Any, **kwargs: Any) -> Any:
            return await _run_async(lens_client, original_create, args, kwargs)

        completions_obj.create = _async_create
    else:
        # Sync — wrap sync
        def _sync_create(*args: Any, **kwargs: Any) -> Any:
            return _run_sync(lens_client, original_create, args, kwargs)

        completions_obj.create = _sync_create

    # Also check for async_client pattern — some versions expose acreate
    if hasattr(completions_obj, "acreate"):
        original_acreate = completions_obj.acreate

        async def _async_acreate(*args: Any, **kwargs: Any) -> Any:
            return await _run_async(lens_client, original_acreate, args, kwargs)

        completions_obj.acreate = _async_acreate


def _run_sync(
    lens_client: "LensClient",
    original: Any,
    args: tuple,
    kwargs: dict,
) -> Any:
    model = kwargs.get("model", args[0] if args else "unknown")
    messages = kwargs.get("messages", [])
    prompt_hash = _messages_hash(messages)

    start = time.monotonic()
    status = "ok"
    response = None
    try:
        response = original(*args, **kwargs)
        return response
    except Exception as exc:
        status = "error"
        raise exc
    finally:
        latency_ms = (time.monotonic() - start) * 1000
        tokens_in = 0
        tokens_out = 0
        resp_hash = "none"
        if response is not None:
            try:
                usage = response.usage
                tokens_in = usage.prompt_tokens if usage else 0
                tokens_out = usage.completion_tokens if usage else 0
                resp_hash = _response_hash(response)
            except Exception:
                pass

        data = {
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "latency_ms": round(latency_ms, 2),
            "prompt_hash": prompt_hash,
            "response_hash": resp_hash,
            "status": status,
        }
        t = threading.Thread(
            target=lens_client.send_event,
            args=("llm_call", data),
            daemon=True,
        )
        t.start()


async def _run_async(
    lens_client: "LensClient",
    original: Any,
    args: tuple,
    kwargs: dict,
) -> Any:
    import asyncio

    model = kwargs.get("model", args[0] if args else "unknown")
    messages = kwargs.get("messages", [])
    prompt_hash = _messages_hash(messages)

    start = time.monotonic()
    status = "ok"
    response = None
    try:
        response = await original(*args, **kwargs)
        return response
    except Exception as exc:
        status = "error"
        raise exc
    finally:
        latency_ms = (time.monotonic() - start) * 1000
        tokens_in = 0
        tokens_out = 0
        resp_hash = "none"
        if response is not None:
            try:
                usage = response.usage
                tokens_in = usage.prompt_tokens if usage else 0
                tokens_out = usage.completion_tokens if usage else 0
                resp_hash = _response_hash(response)
            except Exception:
                pass

        data = {
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "latency_ms": round(latency_ms, 2),
            "prompt_hash": prompt_hash,
            "response_hash": resp_hash,
            "status": status,
        }
        # Fire-and-forget in background
        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            None,
            lambda: lens_client.send_event("llm_call", data),
        )
