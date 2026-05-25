"""
POST /export — Generate Excel workbook with all deployment outputs
"""
import io
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import pandas as pd

from models.schemas import ExportRequest

logger = logging.getLogger("terrisense.export")
router = APIRouter()


def style_header(ws, df, writer, sheet_name):
    """Write DataFrame to sheet with basic header styling via openpyxl."""
    df.to_excel(writer, sheet_name=sheet_name, index=False)


@router.post("")
async def export_excel(req: ExportRequest):
    buffer = io.BytesIO()

    try:
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Sheet 1: HCP Assignments
            if req.hcp_assignments:
                hcp_df = pd.DataFrame(req.hcp_assignments)
                hcp_df.to_excel(writer, sheet_name="HCP Assignments", index=False)

            # Sheet 2: ZIP Assignments
            if req.zip_assignments:
                zip_df = pd.DataFrame(req.zip_assignments)
                zip_df.to_excel(writer, sheet_name="ZIP Assignments", index=False)

            # Sheet 3: Territory Summary
            if req.territories:
                terr_df = pd.DataFrame(req.territories)
                terr_df.to_excel(writer, sheet_name="Territory Summary", index=False)

            # Sheet 4: Sizing Assumptions
            sizing_rows = [(k, v) for k, v in req.sizing_assumptions.items()]
            sizing_df = pd.DataFrame(sizing_rows, columns=["Parameter", "Value"])
            sizing_df.to_excel(writer, sheet_name="Sizing Assumptions", index=False)

            # Sheet 5: Segmentation Summary
            if req.segmentation_summary:
                seg_df = pd.DataFrame(req.segmentation_summary)
                seg_df.to_excel(writer, sheet_name="Segmentation Summary", index=False)

            # Sheet 6: Quality Diagnosis
            if req.quality_diagnosis:
                diag_df = pd.DataFrame(req.quality_diagnosis)
                diag_df.to_excel(writer, sheet_name="Quality Diagnosis", index=False)

            # Sheet 7: Metadata
            meta_df = pd.DataFrame([
                ["Brand", req.brand],
                ["Geography", req.geography],
                ["Export date", datetime.now().strftime("%Y-%m-%d %H:%M")],
                ["Platform", "TerriSense v1.0"],
            ], columns=["Field", "Value"])
            meta_df.to_excel(writer, sheet_name="Metadata", index=False)

    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(500, f"Export failed: {e}")

    buffer.seek(0)
    filename = f"terrisense_export_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
