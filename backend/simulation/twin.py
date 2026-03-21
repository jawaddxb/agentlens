from __future__ import annotations

import os
import random
import time
from typing import Any


class SimulationTwin:
    """A single simulated twin that makes decisions based on a behavioral fingerprint."""

    def __init__(self, twin_id: int, fingerprint: dict, options: dict | None = None) -> None:
        self.twin_id = twin_id
        self.fingerprint = fingerprint
        self.options = options or {}

        # Pre-compute weighted decision paths for mock mode.
        self._paths = fingerprint.get("top_paths", [])
        self._decision_dist = fingerprint.get("decision_distribution", {})
        self._tool_usage = fingerprint.get("tool_usage", {})

    async def decide(self, input_data: dict) -> dict:
        """Make a decision given synthetic input.

        If ``OPENROUTER_API_KEY`` is set, uses a real LLM call via OpenRouter.
        Otherwise, produces a mock decision weighted by the fingerprint.
        """
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if api_key:
            return await self._llm_decide(input_data, api_key)
        return self._mock_decide(input_data)

    # ------------------------------------------------------------------
    # Real LLM decision via OpenRouter
    # ------------------------------------------------------------------

    async def _llm_decide(self, input_data: dict, api_key: str) -> dict:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
        )

        system_prompt = self._build_system_prompt()
        user_message = input_data.get("user_message", "Hello")
        context = input_data.get("context", "")

        start = time.perf_counter()
        try:
            response = await client.chat.completions.create(
                model="openai/gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"{user_message}\n\nContext: {context}"},
                ],
                max_tokens=300,
                temperature=0.7 + random.uniform(-0.1, 0.1),  # slight jitter
            )

            elapsed = round((time.perf_counter() - start) * 1000, 2)
            choice = response.choices[0] if response.choices else None
            content = choice.message.content if choice else ""
            usage = response.usage

            return {
                "twin_id": self.twin_id,
                "decision": content or "no_response",
                "reasoning": f"LLM response via openai/gpt-4o-mini",
                "latency_ms": elapsed,
                "tokens_used": (usage.total_tokens if usage else 0),
                "path_taken": self._select_path(),
            }
        except Exception as exc:
            elapsed = round((time.perf_counter() - start) * 1000, 2)
            return {
                "twin_id": self.twin_id,
                "decision": "error",
                "reasoning": f"LLM call failed: {exc}",
                "latency_ms": elapsed,
                "tokens_used": 0,
                "path_taken": [],
            }

    # ------------------------------------------------------------------
    # Mock decision (fingerprint-weighted)
    # ------------------------------------------------------------------

    def _mock_decide(self, input_data: dict) -> dict:
        start = time.perf_counter()

        # Weighted random decision type.
        decision_type = self._weighted_choice(self._decision_dist)

        # Weighted random tool selection if tool_call.
        tool_used = ""
        if decision_type == "tool_call" and self._tool_usage:
            tool_used = self._weighted_choice(self._tool_usage)

        path_taken = self._select_path()

        # Add realistic latency jitter (50-500ms).
        base_latency = random.uniform(50, 500)
        jitter = random.gauss(0, 30)
        latency = max(10, base_latency + jitter)

        elapsed = round((time.perf_counter() - start) * 1000 + latency, 2)

        # Simulate token usage.
        tokens = random.randint(50, 800)

        # Build a mock response.
        responses = {
            "llm_call": "Generated a response based on context analysis.",
            "tool_call": f"Executed tool '{tool_used}' with relevant parameters.",
            "agent_response": "Formulated final response to user query.",
            "user_message": "Processed incoming user message.",
            "error": "Encountered an edge case requiring fallback logic.",
            "escalation": "Escalated to human operator due to low confidence.",
        }
        decision_text = responses.get(decision_type, f"Executed {decision_type} step.")

        return {
            "twin_id": self.twin_id,
            "decision": decision_text,
            "reasoning": f"Selected '{decision_type}' with probability "
            f"{self._decision_dist.get(decision_type, 0):.2%} from fingerprint",
            "latency_ms": elapsed,
            "tokens_used": tokens,
            "path_taken": path_taken,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        dist_str = ", ".join(
            f"{k}: {v:.0%}" for k, v in self._decision_dist.items()
        )
        tools_str = ", ".join(self._tool_usage.keys()) if self._tool_usage else "none"
        return (
            "You are a simulated AI agent twin. Your behavioral profile:\n"
            f"- Decision distribution: {dist_str}\n"
            f"- Available tools: {tools_str}\n"
            "Respond naturally as this agent would, staying in character with "
            "these behavioral tendencies. Be concise."
        )

    def _select_path(self) -> list[str]:
        if not self._paths:
            return list(self._decision_dist.keys())[:3]
        weights = [p.get("frequency", 0.1) for p in self._paths]
        total = sum(weights) or 1.0
        r = random.uniform(0, total)
        cumulative = 0.0
        for path_info, w in zip(self._paths, weights):
            cumulative += w
            if r <= cumulative:
                return path_info.get("path", [])
        return self._paths[0].get("path", [])

    @staticmethod
    def _weighted_choice(dist: dict[str, Any]) -> str:
        if not dist:
            return "unknown"
        keys = list(dist.keys())
        weights = []
        for v in dist.values():
            try:
                weights.append(float(v))
            except (TypeError, ValueError):
                weights.append(0.1)
        total = sum(weights) or 1.0
        r = random.uniform(0, total)
        cumulative = 0.0
        for key, w in zip(keys, weights):
            cumulative += w
            if r <= cumulative:
                return key
        return keys[0]
