from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

try:
    from backend.pipeline.drift import DriftDetector
    from backend.simulation.scenarios import ScenarioInjector
    from backend.simulation.twin import SimulationTwin
except ImportError:
    from pipeline.drift import DriftDetector  # type: ignore[no-redef]
    from simulation.scenarios import ScenarioInjector  # type: ignore[no-redef]
    from simulation.twin import SimulationTwin  # type: ignore[no-redef]

logger = logging.getLogger(__name__)


class SimulationRunner:
    """Orchestrate a full simulation run across multiple twins and rounds."""

    def __init__(self) -> None:
        self._scenario_injector = ScenarioInjector()
        self._drift_detector = DriftDetector()

    async def run(
        self,
        agent_id: int,
        scenario: str,
        num_twins: int,
        num_rounds: int,
        fingerprint: dict,
        simulation_id: int,
        engine: AsyncEngine,
    ) -> dict:
        """Execute the simulation and return a SimulationResult-shaped dict."""
        twins = [
            SimulationTwin(twin_id=i, fingerprint=fingerprint)
            for i in range(num_twins)
        ]

        decision_feed: list[dict] = []
        twin_all_decisions: dict[int, list[dict]] = {i: [] for i in range(num_twins)}
        outcome_counter: dict[str, int] = {}

        try:
            # Mark as running.
            await self._update_status(engine, simulation_id, "running", 0.0, 0, num_rounds)

            for round_num in range(num_rounds):
                # Generate synthetic input for this round.
                input_data = self._scenario_injector.generate_input(
                    scenario=scenario,
                    round_num=round_num,
                    total_rounds=num_rounds,
                )

                # Run all twins in parallel.
                tasks = [twin.decide(input_data) for twin in twins]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for result in results:
                    if isinstance(result, Exception):
                        entry = {
                            "twin_id": -1,
                            "decision": "error",
                            "reasoning": str(result),
                            "latency_ms": 0,
                            "tokens_used": 0,
                            "path_taken": [],
                            "round": round_num,
                        }
                    else:
                        entry = {**result, "round": round_num}
                        twin_all_decisions.setdefault(result["twin_id"], []).append(result)

                    decision_feed.append(entry)

                    # Count outcomes.
                    decision_key = self._classify_outcome(entry)
                    outcome_counter[decision_key] = outcome_counter.get(decision_key, 0) + 1

                # Update progress.
                progress = (round_num + 1) / num_rounds
                await self._update_status(
                    engine, simulation_id, "running", progress, round_num + 1, num_rounds,
                )

            # Build twin states.
            twin_states = []
            for tid in range(num_twins):
                decisions = twin_all_decisions.get(tid, [])
                twin_states.append({
                    "twin_id": tid,
                    "state": "complete",
                    "decisions": decisions,
                    "current_step": None,
                })

            # Compute divergence: compare simulation outcome distribution to
            # the original fingerprint's decision distribution.
            sim_dist = self._compute_sim_distribution(decision_feed)
            baseline_dist = fingerprint.get("decision_distribution", {})
            divergence = self._drift_detector.compare(
                {"decision_distribution": sim_dist, "agent_id": agent_id, "top_paths": []},
                {"decision_distribution": baseline_dist, "agent_id": agent_id, "top_paths": fingerprint.get("top_paths", [])},
            )
            divergence_score = divergence.get("drift_percentage", 0.0) / 100.0

            # Behavioral comparison.
            behavioral_comparison = {
                "original_distribution": baseline_dist,
                "simulation_distribution": sim_dist,
                "divergence_details": divergence,
                "twin_agreement_rate": self._twin_agreement_rate(twin_all_decisions),
            }

            now = datetime.now(timezone.utc)
            result_data: dict = {
                "id": simulation_id,
                "agent_id": agent_id,
                "scenario": scenario,
                "num_twins": num_twins,
                "num_rounds": num_rounds,
                "divergence_score": round(divergence_score, 4),
                "outcome_distribution": outcome_counter,
                "twin_states": twin_states,
                "decision_feed": decision_feed,
                "behavioral_comparison": behavioral_comparison,
                "created_at": now.isoformat(),
                "completed_at": now.isoformat(),
            }

            # Store result and mark complete.
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "UPDATE simulations SET status = :status, result_data = :result, "
                        "completed_at = :completed WHERE id = :id"
                    ),
                    {
                        "status": "complete",
                        "result": _json_dumps(result_data),
                        "completed": now.isoformat(),
                        "id": simulation_id,
                    },
                )

            return result_data

        except Exception as exc:
            logger.exception("Simulation %s failed: %s", simulation_id, exc)
            try:
                async with engine.begin() as conn:
                    await conn.execute(
                        text("UPDATE simulations SET status = 'failed' WHERE id = :id"),
                        {"id": simulation_id},
                    )
            except Exception:
                pass
            raise

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _update_status(
        engine: AsyncEngine,
        sim_id: int,
        status: str,
        progress: float,
        current_round: int,
        total_rounds: int,
    ) -> None:
        config_json = _json_dumps({
            "progress": round(progress, 4),
            "current_round": current_round,
            "total_rounds": total_rounds,
        })
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "UPDATE simulations SET status = :status, config = :config WHERE id = :id"
                ),
                {"status": status, "config": config_json, "id": sim_id},
            )

    @staticmethod
    def _classify_outcome(entry: dict) -> str:
        decision = entry.get("decision", "")
        if "error" in decision.lower():
            return "error"
        if "escalat" in decision.lower():
            return "escalation"
        if "tool" in decision.lower():
            return "tool_call"
        return "standard_response"

    @staticmethod
    def _compute_sim_distribution(feed: list[dict]) -> dict[str, float]:
        counts: dict[str, int] = {}
        for entry in feed:
            key = entry.get("path_taken", ["unknown"])[0] if entry.get("path_taken") else "unknown"
            counts[key] = counts.get(key, 0) + 1
        total = sum(counts.values()) or 1
        return {k: round(v / total, 4) for k, v in counts.items()}

    @staticmethod
    def _twin_agreement_rate(all_decisions: dict[int, list[dict]]) -> float:
        """How often twins agree on the same decision path."""
        if len(all_decisions) < 2:
            return 1.0

        agreements = 0
        comparisons = 0
        twin_ids = list(all_decisions.keys())

        for i in range(len(twin_ids)):
            for j in range(i + 1, len(twin_ids)):
                d_i = all_decisions[twin_ids[i]]
                d_j = all_decisions[twin_ids[j]]
                min_len = min(len(d_i), len(d_j))
                if min_len == 0:
                    continue
                for k in range(min_len):
                    comparisons += 1
                    if d_i[k].get("path_taken") == d_j[k].get("path_taken"):
                        agreements += 1

        return round(agreements / comparisons, 4) if comparisons else 1.0


def _json_dumps(obj: object) -> str:
    """JSON serialize, handling datetime objects."""
    import json

    def _default(o: object) -> str:
        if isinstance(o, datetime):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o)} is not JSON serializable")

    return json.dumps(obj, default=_default)
