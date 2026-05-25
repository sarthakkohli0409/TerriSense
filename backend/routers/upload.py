"""
POST /upload — Accept CSV/Excel, return detected columns and preview
"""
import io
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd

from config import settings
from models.schemas import UploadResponse

logger = logging.getLogger("terrisense.upload")
router = APIRouter()

REQUIRED_FIELDS = ["hcp_id", "zip", "state"]
METRIC_HINTS = ["trx", "nrx", "patient_potential", "call_history", "sales",
                "market_potential", "priority_flag"]
COORD_HINTS  = ["lat", "latitude", "lon", "lng", "longitude"]

CANONICAL_MAP = {
    # HCP ID
    "hcp_id": ["hcp_id","hcpid","provider_id","npi","account_id","id"],
    # Geography
    "zip":    ["zip","zip_code","zipcode","postal_code","zip5"],
    "state":  ["state","state_code","st","state_abbr"],
    "lat":    ["lat","latitude","lat_dd","y"],
    "lon":    ["lon","lng","longitude","lon_dd","x"],
    # Specialty
    "specialty": ["specialty","speciality","hcp_specialty","spec"],
    # Metrics
    "trx":              ["trx","total_rx","total_scripts","rx"],
    "nrx":              ["nrx","new_rx","new_scripts"],
    "patient_potential":["patient_potential","pat_potential","patient_pot","potential"],
    "call_history":     ["call_history","calls","call_count","historical_calls"],
    "sales":            ["sales","revenue","net_sales"],
    "market_potential": ["market_potential","mkt_potential","mkt_pot"],
    "priority_flag":    ["priority_flag","priority","flag","tier_flag"],
}


def detect_mapping(columns: list[str]) -> dict[str, str]:
    col_lower = {c.lower().replace(" ", "_"): c for c in columns}
    mapping: dict[str, str] = {}
    for canonical, candidates in CANONICAL_MAP.items():
        for cand in candidates:
            if cand in col_lower:
                mapping[canonical] = col_lower[cand]
                break
    return mapping


def validate_dataframe(df: pd.DataFrame) -> list[str]:
    warnings = []
    mapping = detect_mapping(list(df.columns))

    zip_col = mapping.get("zip")
    state_col = mapping.get("state")

    if zip_col and df[zip_col].isnull().any():
        n = df[zip_col].isnull().sum()
        warnings.append(f"{n} rows missing ZIP code — they will be excluded from alignment.")

    if state_col and df[state_col].isnull().any():
        n = df[state_col].isnull().sum()
        warnings.append(f"{n} rows missing state — state alignment may be affected.")

    lat_col = mapping.get("lat")
    lon_col = mapping.get("lon")
    if not lat_col or not lon_col:
        warnings.append("Latitude/longitude not detected — ZIP centroids will be used for alignment.")

    for metric in ["trx", "nrx", "patient_potential", "call_history"]:
        col = mapping.get(metric)
        if col and not pd.api.types.is_numeric_dtype(df[col]):
            warnings.append(f"Column '{col}' ({metric}) is not numeric — will attempt conversion.")

    return warnings


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in {"csv", "xlsx", "xls"}:
        raise HTTPException(400, f"Unsupported file type: {ext}. Use CSV or Excel.")

    content = await file.read()

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content), nrows=settings.MAX_UPLOAD_ROWS)
        else:
            df = pd.read_excel(io.BytesIO(content), nrows=settings.MAX_UPLOAD_ROWS)
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

    if df.empty:
        raise HTTPException(400, "File is empty")

    # Clean column names
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    warnings = validate_dataframe(df)
    mapping = detect_mapping(list(df.columns))

    preview = df.head(10).fillna("").astype(str).to_dict(orient="records")

    logger.info(f"Uploaded {len(df)} rows, {len(df.columns)} columns from {file.filename}")

    return UploadResponse(
        rows=len(df),
        columns=list(df.columns),
        preview=preview,
        detected_mapping=mapping,
        warnings=warnings,
    )
