"""
POST /segment — Run segmentation on HCP data
"""
import logging
from fastapi import APIRouter, HTTPException
import pandas as pd

from models.schemas import SegmentRequest, SegmentResponse, SegmentSummaryItem
from services.segmentation_service import (
    assign_segments_auto,
    assign_segments_from_column,
    compute_segment_summary,
    build_narrative,
)

logger = logging.getLogger("terrisense.segment")
router = APIRouter()


@router.post("", response_model=SegmentResponse)
async def run_segmentation(req: SegmentRequest):
    if not req.hcp_data:
        raise HTTPException(400, "hcp_data is empty")

    df = pd.DataFrame(req.hcp_data)
    warnings: list[str] = []

    seg_defs = [s.model_dump() for s in req.segment_definitions]

    # Auto vs uploaded
    if req.mode == "upload":
        if not req.uploaded_segment_col:
            raise HTTPException(400, "uploaded_segment_col required for mode='upload'")
        if req.uploaded_segment_col not in df.columns:
            raise HTTPException(400, f"Column '{req.uploaded_segment_col}' not found in data")
        df = assign_segments_from_column(df, req.uploaded_segment_col)
        # Validate all segment values are known
        known = {s["name"] for s in seg_defs}
        unknown = set(df["segment"].unique()) - known
        if unknown:
            warnings.append(f"Unknown segment values detected: {unknown}. They will have zero calls.")
    else:
        if not req.metric_weights:
            raise HTTPException(400, "metric_weights required for mode='auto'")
        weights = [mw.model_dump() for mw in req.metric_weights]
        df = assign_segments_auto(df, weights, seg_defs)

    # Detect potential column
    potential_col = None
    for cand in ["patient_potential", "potential", "market_potential", "sales"]:
        if cand in df.columns:
            potential_col = cand
            break

    summary_raw = compute_segment_summary(df, seg_defs, potential_col)
    total_calls = sum(s["total_calls_required"] for s in summary_raw)

    narrative = build_narrative(summary_raw, total_calls)

    summary_items = [SegmentSummaryItem(**s) for s in summary_raw]

    # Return HCP data with segment column added
    result_data = df.fillna("").to_dict(orient="records")

    logger.info(f"Segmented {len(df)} HCPs → total calls {total_calls:,.0f}")

    return SegmentResponse(
        hcp_data=result_data,
        summary=summary_items,
        total_calls_required=round(total_calls, 1),
        narrative=narrative,
        warnings=warnings,
    )
