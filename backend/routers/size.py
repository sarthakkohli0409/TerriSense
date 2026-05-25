"""
POST /size — Run all three sizing methods, triangulate, apply budget cap
"""
import logging
from fastapi import APIRouter, HTTPException

from models.schemas import SizeRequest, SizeResponse, MethodWeights
from services.sizing_service import (
    capacity_sizing,
    potential_sizing,
    roi_sizing,
    budget_sizing,
    triangulate,
    build_narrative,
    OBJECTIVE_WEIGHTS,
)

logger = logging.getLogger("terrisense.size")
router = APIRouter()


@router.post("", response_model=SizeResponse)
async def run_sizing(req: SizeRequest):
    ci = req.capacity_inputs
    pi = req.potential_inputs
    ri = req.roi_inputs
    bi = req.budget_inputs
    w  = req.method_weights

    # Method A
    cap = capacity_sizing(
        total_calls_required=ci.total_calls_required,
        calls_per_day=ci.calls_per_day,
        working_days=ci.working_days,
        non_selling_pct=ci.non_selling_pct,
        accessibility_factor=ci.accessibility_factor,
    )

    # Method B
    pot = potential_sizing(
        covered_potential=pi.covered_market_potential,
        desired_per_rep=pi.desired_potential_per_rep,
    )

    # Method C
    roi = roi_sizing(
        expected_revenue=ri.expected_revenue,
        revenue_per_rep=ri.revenue_per_rep,
        diminishing_return=ri.diminishing_return_factor,
        cost_per_rep=ri.cost_per_rep,
        min_roi=ri.min_roi_ratio,
    )

    capacity_k  = cap["k"]
    potential_k = pot["k"]
    roi_k       = roi["k"]

    weights_dict = {"capacity": w.capacity, "potential": w.potential, "roi": w.roi}
    strategic_k = triangulate(capacity_k, potential_k, roi_k, weights_dict)
    budget_k    = budget_sizing(bi.total_budget, bi.fully_loaded_cost_per_rep)

    final_k      = min(strategic_k, budget_k)
    final_k      = max(1, final_k)
    budget_capped = budget_k < strategic_k

    range_low  = max(1, round(final_k * 0.9))
    range_high = round(final_k * 1.1)

    narrative = build_narrative(
        capacity_k, potential_k, roi_k, strategic_k, budget_k, final_k,
        budget_capped, ci.total_calls_required, req.planning_objective
    )

    assumptions = {
        "calls_per_day": ci.calls_per_day,
        "working_days": ci.working_days,
        "non_selling_pct": ci.non_selling_pct,
        "accessibility_factor": ci.accessibility_factor,
        "effective_rep_capacity": cap["effective_rep_capacity"],
        "covered_potential": pi.covered_market_potential,
        "desired_potential_per_rep": pi.desired_potential_per_rep,
        "expected_revenue": ri.expected_revenue,
        "revenue_per_rep": ri.revenue_per_rep,
        "diminishing_return": ri.diminishing_return_factor,
        "total_budget": bi.total_budget,
        "cost_per_rep": bi.fully_loaded_cost_per_rep,
    }

    logger.info(f"Sizing: cap={capacity_k} pot={potential_k} roi={roi_k} strategic={strategic_k} budget={budget_k} final={final_k}")

    return SizeResponse(
        capacity_k=capacity_k,
        potential_k=potential_k,
        roi_k=roi_k,
        strategic_k=strategic_k,
        budget_k=budget_k,
        final_k=final_k,
        range_low=range_low,
        range_high=range_high,
        budget_capped=budget_capped,
        roi_warning=roi["roi_warning"],
        roi_ratio=roi["roi_ratio"],
        effective_rep_capacity=cap["effective_rep_capacity"],
        total_calls_required=ci.total_calls_required,
        method_weights=req.method_weights,
        narrative=narrative,
        assumptions=assumptions,
    )
