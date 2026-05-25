"""
TerriSense — Pydantic models for all API payloads
"""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field, model_validator


# ── Upload ──────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    rows: int
    columns: list[str]
    preview: list[dict[str, Any]]
    detected_mapping: dict[str, str]
    warnings: list[str] = []


# ── Segmentation ─────────────────────────────────────────────────────────────

class MetricWeight(BaseModel):
    column: str
    weight: float = Field(ge=0, le=100)


class SegmentDefinition(BaseModel):
    name: str
    reach_pct: float = Field(ge=0, le=100)
    frequency: float = Field(ge=0)
    target: bool = True
    priority_multiplier: float = Field(default=1.0, ge=0)


class SegmentRequest(BaseModel):
    hcp_data: list[dict[str, Any]]
    mode: str = "auto"                        # "auto" | "upload"
    uploaded_segment_col: Optional[str] = None
    metric_weights: list[MetricWeight] = []
    segment_definitions: list[SegmentDefinition]

    @model_validator(mode="after")
    def validate_weights(self):
        if self.mode == "auto" and self.metric_weights:
            total = sum(w.weight for w in self.metric_weights)
            if abs(total - 100) > 0.5:
                raise ValueError(f"Metric weights must sum to 100 (got {total:.1f})")
        return self


class SegmentSummaryItem(BaseModel):
    segment: str
    hcp_count: int
    pct_of_total: float
    reach_pct: float
    frequency: float
    total_calls_required: float
    avg_potential: Optional[float] = None


class SegmentResponse(BaseModel):
    hcp_data: list[dict[str, Any]]
    summary: list[SegmentSummaryItem]
    total_calls_required: float
    narrative: str
    warnings: list[str] = []


# ── Sizing ────────────────────────────────────────────────────────────────────

class CapacityInputs(BaseModel):
    calls_per_day: float = Field(gt=0, default=8)
    working_days: float = Field(gt=0, default=220)
    non_selling_pct: float = Field(ge=0, lt=1, default=0.25)
    accessibility_factor: float = Field(gt=0, le=1, default=1.0)
    total_calls_required: float


class PotentialInputs(BaseModel):
    covered_market_potential: float = Field(gt=0)
    desired_potential_per_rep: float = Field(gt=0)


class ROIInputs(BaseModel):
    expected_revenue: float = Field(gt=0)
    revenue_per_rep: float = Field(gt=0)
    diminishing_return_factor: float = Field(gt=0, le=1, default=0.85)
    cost_per_rep: float = Field(gt=0)
    min_roi_ratio: float = Field(ge=1, default=2.5)


class BudgetInputs(BaseModel):
    total_budget: float = Field(gt=0)
    fully_loaded_cost_per_rep: float = Field(gt=0)


class MethodWeights(BaseModel):
    capacity: float = Field(ge=0, le=100, default=40)
    potential: float = Field(ge=0, le=100, default=40)
    roi: float = Field(ge=0, le=100, default=20)

    @model_validator(mode="after")
    def weights_sum_to_100(self):
        total = self.capacity + self.potential + self.roi
        if abs(total - 100) > 0.5:
            raise ValueError(f"Method weights must sum to 100 (got {total:.1f})")
        return self


class SizeRequest(BaseModel):
    planning_objective: str = "balanced"
    capacity_inputs: CapacityInputs
    potential_inputs: PotentialInputs
    roi_inputs: ROIInputs
    budget_inputs: BudgetInputs
    method_weights: MethodWeights


class SizeResponse(BaseModel):
    capacity_k: int
    potential_k: int
    roi_k: int
    strategic_k: int
    budget_k: int
    final_k: int
    range_low: int
    range_high: int
    budget_capped: bool
    roi_warning: bool
    roi_ratio: float
    effective_rep_capacity: float
    total_calls_required: float
    method_weights: MethodWeights
    narrative: str
    assumptions: dict[str, Any]


# ── Alignment ─────────────────────────────────────────────────────────────────

class AlignmentRequest(BaseModel):
    hcp_data: list[dict[str, Any]]
    final_k: int = Field(ge=1)
    state_alignment: str = "soft"             # "off" | "soft" | "strict"
    balance_tolerance_pct: float = Field(ge=5, le=50, default=15)
    balance_metric: str = "calls"             # "calls" | "hcps" | "potential"


class ZipSummary(BaseModel):
    zip: str
    state: str
    lat: float
    lon: float
    hcp_count: int
    total_calls: float
    potential: float
    territory_id: int


class TerritoryRecord(BaseModel):
    territory_id: int
    hcp_count: int
    zip_count: int
    total_calls: float
    workload_index: float
    potential_index: float
    states: list[str]
    state_split: bool
    centroid_lat: float
    centroid_lon: float
    balance_status: str                       # "within" | "above" | "below"
    compactness_score: float


class AlignmentResponse(BaseModel):
    territories: list[TerritoryRecord]
    hcp_assignments: list[dict[str, Any]]
    zip_assignments: list[ZipSummary]
    avg_hcps_per_territory: float
    avg_calls_per_territory: float
    narrative: str
    warnings: list[str] = []


# ── Diagnosis ─────────────────────────────────────────────────────────────────

class DiagnoseRequest(BaseModel):
    territories: list[TerritoryRecord]
    balance_tolerance_pct: float = 15


class DiagnosisRecord(BaseModel):
    territory_id: int
    hcp_count: int
    zip_count: int
    total_calls: float
    workload_index: float
    potential_index: float
    top_tier_hcp_count: Optional[int] = None
    state_count: int
    state_split: bool
    balance_status: str
    compactness_score: float


class OverallDiagnosis(BaseModel):
    pct_within_tolerance: float
    max_workload_index: float
    min_workload_index: float
    max_workload_variance: float
    n_state_splits: int
    n_above_tolerance: int
    n_below_tolerance: int
    avg_compactness: float


class DiagnoseResponse(BaseModel):
    territory_diagnoses: list[DiagnosisRecord]
    overall: OverallDiagnosis
    narrative: str


# ── Export ────────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    hcp_assignments: list[dict[str, Any]]
    zip_assignments: list[dict[str, Any]]
    territories: list[dict[str, Any]]
    sizing_assumptions: dict[str, Any]
    segmentation_summary: list[dict[str, Any]]
    quality_diagnosis: list[dict[str, Any]]
    brand: str = ""
    geography: str = ""
