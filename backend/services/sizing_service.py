"""
Sizing service — Capacity, Potential, ROI methods + Strategic K + Budget Cap
"""
import math
import logging
from typing import Any

logger = logging.getLogger("terrisense.sizing")

OBJECTIVE_WEIGHTS = {
    "balanced":      {"capacity": 40, "potential": 40, "roi": 20},
    "maxCoverage":   {"capacity": 55, "potential": 30, "roi": 15},
    "maxGrowth":     {"capacity": 15, "potential": 50, "roi": 35},
    "maxEfficiency": {"capacity": 20, "potential": 35, "roi": 45},
}


def capacity_sizing(
    total_calls_required: float,
    calls_per_day: float,
    working_days: float,
    non_selling_pct: float,
    accessibility_factor: float = 1.0,
) -> dict[str, Any]:
    effective_capacity = calls_per_day * working_days * (1 - non_selling_pct)
    adjusted_calls = total_calls_required / max(accessibility_factor, 0.01)
    k = math.ceil(adjusted_calls / effective_capacity) if effective_capacity > 0 else 1
    return {
        "k": max(1, k),
        "effective_rep_capacity": round(effective_capacity, 1),
        "adjusted_calls": round(adjusted_calls, 1),
    }


def potential_sizing(
    covered_potential: float,
    desired_per_rep: float,
) -> dict[str, Any]:
    k = math.ceil(covered_potential / max(desired_per_rep, 1))
    return {"k": max(1, k)}


def roi_sizing(
    expected_revenue: float,
    revenue_per_rep: float,
    diminishing_return: float,
    cost_per_rep: float,
    min_roi: float,
) -> dict[str, Any]:
    base = expected_revenue / max(revenue_per_rep, 1)
    k = math.ceil(base * diminishing_return)
    k = max(1, k)
    expected_cost = k * cost_per_rep
    roi_ratio = expected_revenue / max(expected_cost, 1)
    warning = roi_ratio < min_roi
    return {
        "k": k,
        "roi_ratio": round(roi_ratio, 2),
        "roi_warning": warning,
        "expected_cost": round(expected_cost, 0),
    }


def budget_sizing(total_budget: float, cost_per_rep: float) -> int:
    return max(1, int(total_budget // max(cost_per_rep, 1)))


def triangulate(
    capacity_k: int,
    potential_k: int,
    roi_k: int,
    weights: dict[str, float],
) -> int:
    strategic = (
        capacity_k  * weights["capacity"]  / 100
        + potential_k * weights["potential"] / 100
        + roi_k       * weights["roi"]       / 100
    )
    return max(1, math.ceil(strategic))


def build_narrative(
    capacity_k: int,
    potential_k: int,
    roi_k: int,
    strategic_k: int,
    budget_k: int,
    final_k: int,
    budget_capped: bool,
    total_calls: float,
    objective: str,
) -> str:
    obj_label = {
        "balanced": "Balanced",
        "maxCoverage": "Maximize Coverage",
        "maxGrowth": "Maximize Growth Opportunity",
        "maxEfficiency": "Maximize Efficiency",
    }.get(objective, "Balanced")

    cap_note = (
        f" Budget supports {budget_k} reps, so the final deployment K is capped at {budget_k}."
        if budget_capped else ""
    )

    return (
        f"Total required call workload: {int(total_calls):,} calls. "
        f"Capacity sizing suggests {capacity_k} reps, "
        f"potential sizing suggests {potential_k} reps, "
        f"and ROI sizing suggests {roi_k} reps. "
        f"Based on the selected {obj_label} objective, the strategic recommendation is {strategic_k} reps."
        f"{cap_note} "
        f"TerriSense will create {final_k} contiguous territories."
    )
