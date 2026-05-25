"""
POST /align — Create territory alignment from HCP data and Final K
"""
import logging
from fastapi import APIRouter, HTTPException

from models.schemas import AlignmentRequest, AlignmentResponse, TerritoryRecord, ZipSummary
from services.alignment_service import run_alignment

logger = logging.getLogger("terrisense.align")
router = APIRouter()


@router.post("", response_model=AlignmentResponse)
async def run_territory_alignment(req: AlignmentRequest):
    if not req.hcp_data:
        raise HTTPException(400, "hcp_data is empty")
    if req.final_k < 1:
        raise HTTPException(400, "final_k must be at least 1")

    try:
        result = run_alignment(
            hcp_data=req.hcp_data,
            final_k=req.final_k,
            state_alignment=req.state_alignment,
            balance_tolerance_pct=req.balance_tolerance_pct,
            balance_metric=req.balance_metric,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.error(f"Alignment failed: {e}", exc_info=True)
        raise HTTPException(500, f"Alignment failed: {e}")

    territories = [TerritoryRecord(**t) for t in result["territories"]]
    zip_assignments = [ZipSummary(**z) for z in result["zip_assignments"]]

    logger.info(f"Alignment created {len(territories)} territories from {len(req.hcp_data)} HCPs")

    return AlignmentResponse(
        territories=territories,
        hcp_assignments=result["hcp_assignments"],
        zip_assignments=zip_assignments,
        avg_hcps_per_territory=result["avg_hcps_per_territory"],
        avg_calls_per_territory=result["avg_calls_per_territory"],
        narrative=result["narrative"],
        warnings=result["warnings"],
    )
