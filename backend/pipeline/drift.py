from __future__ import annotations

import math


class DriftDetector:
    """Compare two behavioral fingerprints and quantify drift."""

    def compare(self, current: dict, baseline: dict) -> dict:
        """Return a DriftResult-shaped dict.

        ``current`` and ``baseline`` are full fingerprint dicts (as produced
        by ``FingerprintBuilder.build``).
        """
        cur_dist = current.get("decision_distribution", {})
        base_dist = baseline.get("decision_distribution", {})

        # Jensen-Shannon divergence on decision distributions.
        js_div = self._jensen_shannon(cur_dist, base_dist)
        drift_pct = round(js_div * 100, 2)  # 0-100

        # Per-type delta alerts.
        alerts = self._generate_alerts(cur_dist, base_dist)

        # Path frequency drift.
        path_alert = self._path_drift_alert(
            current.get("top_paths", []),
            baseline.get("top_paths", []),
        )
        if path_alert:
            alerts.append(path_alert)

        # Derive a simple composite score (lower = more consistent).
        current_score = round(1.0 - js_div, 4)
        baseline_score = 1.0  # baseline is always the reference

        agent_id = current.get("agent_id") or baseline.get("agent_id") or 0

        return {
            "agent_id": agent_id,
            "current_score": current_score,
            "baseline_score": baseline_score,
            "drift_percentage": drift_pct,
            "alerts": alerts,
        }

    # ------------------------------------------------------------------
    # Jensen-Shannon divergence (numpy-free)
    # ------------------------------------------------------------------

    @staticmethod
    def _jensen_shannon(p_dist: dict[str, float], q_dist: dict[str, float]) -> float:
        """Compute JS divergence between two distributions given as {key: probability}.

        Returns a value in [0, 1] (using base-2 log).
        """
        all_keys = set(p_dist) | set(q_dist)
        if not all_keys:
            return 0.0

        # Normalise both distributions so they sum to 1.
        p_total = sum(p_dist.values()) or 1.0
        q_total = sum(q_dist.values()) or 1.0

        p = {k: p_dist.get(k, 0.0) / p_total for k in all_keys}
        q = {k: q_dist.get(k, 0.0) / q_total for k in all_keys}

        # M = (P + Q) / 2
        m = {k: (p[k] + q[k]) / 2.0 for k in all_keys}

        def _kl(a: dict[str, float], b: dict[str, float]) -> float:
            total = 0.0
            for k in all_keys:
                ak = a[k]
                bk = b[k]
                if ak > 0 and bk > 0:
                    total += ak * math.log2(ak / bk)
            return total

        return (_kl(p, m) + _kl(q, m)) / 2.0

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_alerts(
        current: dict[str, float],
        baseline: dict[str, float],
        threshold: float = 0.05,
    ) -> list[str]:
        """Alert when any decision type changes more than ``threshold`` (5 %)."""
        alerts: list[str] = []
        all_types = set(current) | set(baseline)

        cur_total = sum(current.values()) or 1.0
        base_total = sum(baseline.values()) or 1.0

        for dtype in sorted(all_types):
            cur_pct = current.get(dtype, 0.0) / cur_total
            base_pct = baseline.get(dtype, 0.0) / base_total
            delta = cur_pct - base_pct
            if abs(delta) > threshold:
                direction = "increased" if delta > 0 else "decreased"
                alerts.append(
                    f"{dtype} {direction} by {abs(delta)*100:.1f}% "
                    f"(baseline {base_pct*100:.1f}% -> current {cur_pct*100:.1f}%)"
                )

        return alerts

    @staticmethod
    def _path_drift_alert(
        current_paths: list[dict],
        baseline_paths: list[dict],
    ) -> str | None:
        """Emit an alert if the top path changed entirely."""
        if not current_paths or not baseline_paths:
            return None
        cur_top = tuple(current_paths[0].get("path", []))
        base_top = tuple(baseline_paths[0].get("path", []))
        if cur_top != base_top:
            return (
                f"Top decision path changed: "
                f"{'->'.join(base_top)} => {'->'.join(cur_top)}"
            )
        return None
