"""
POST /diagnose — Quality diagnosis of territory alignment
"""
import logging
from fastapi import APIRouter, HTTPException

from models.schemas import DiagnoseRequest, DiagnoseResponse, DiagnosisRecord, OverallDiagnosis

logger = logging.getLogger("terrisense.diagnose")
router = APIRouter()


@router.post("", response_model=DiagnoseResponse)
async def run_diagnosis(req: DiagnoseRequest):
    if not req.territories:
        raise HTTPException(400, "No territories provided")

    tol = req.balance_tolerance_pct
    records = []

    for t in req.territories:
        records.append(DiagnosisRecord(
            territory_id=t.territory_id,
            hcp_count=t.hcp_count,
            zip_count=t.zip_count,
            total_calls=t.total_calls,
            workload_index=t.workload_index,
            potential_index=t.potential_index,
            state_count=len(t.states),
            state_split=t.state_split,
            balance_status=t.balance_status,
            compactness_score=t.compactness_score,
        ))

    w_indices = [r.workload_index for r in records]
    n_within  = sum(1 for r in records if r.balance_status == "within")
    n_above   = sum(1 for r in records if r.balance_status == "above")
    n_below   = sum(1 for r in records if r.balance_status == "below")
    n_splits  = sum(1 for r in records if r.state_split)
    avg_comp  = round(sum(r.compactness_score for r in records) / len(records), 3) if records else 0

    overall = OverallDiagnosis(
        pct_within_tolerance=round(n_within / len(records) * 100, 1),
        max_workload_index=round(max(w_indices), 1),
        min_workload_index=round(min(w_indices), 1),
        max_workload_variance=round(max(w_indices) - min(w_indices), 1),
        n_state_splits=n_splits,
        n_above_tolerance=n_above,
        n_below_tolerance=n_below,
        avg_compactness=avg_comp,
    )

    narrative = (
        f"Quality diagnosis across {len(records)} territories: "
        f"{n_within} ({overall.pct_within_tolerance}%) within ±{tol}% tolerance, "
        f"{n_above} above range, {n_below} below range. "
        f"Workload index range: {overall.min_workload_index} – {overall.max_workload_index}. "
        f"{n_splits} territories span multiple states. "
        f"Average compactness: {avg_comp:.2f}."
    )

    return DiagnoseResponse(
        territory_diagnoses=records,
        overall=overall,
        narrative=narrative,
    )
