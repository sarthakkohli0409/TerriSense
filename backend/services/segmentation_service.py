"""
Segmentation service — composite score calculation and tier assignment
"""
import logging
import numpy as np
import pandas as pd
from typing import Any

logger = logging.getLogger("terrisense.segmentation")

DEFAULT_SEGMENT_ORDER = ["Very High", "High", "Medium", "Low", "Very Low"]

DECILE_TO_SEGMENT = {
    10: "Very High", 9: "Very High",
    8: "High",       7: "High",
    6: "Medium",     5: "Medium", 4: "Medium",
    3: "Low",        2: "Low",
    1: "Very Low",   0: "Very Low",
}


def normalize_series(s: pd.Series) -> pd.Series:
    """Min-max normalize to 0-1. Returns 0.5 for constant series."""
    mn, mx = s.min(), s.max()
    if mx == mn:
        return pd.Series(0.5, index=s.index)
    return (s - mn) / (mx - mn)


def compute_composite_score(
    df: pd.DataFrame,
    metric_weights: list[dict],
) -> pd.Series:
    """
    For each (column, weight) pair:
      - coerce to numeric, fill NA with 0
      - normalize 0-1
      - multiply by weight/100
    Sum across all metrics.
    """
    score = pd.Series(0.0, index=df.index)
    total_weight = sum(mw["weight"] for mw in metric_weights)

    for mw in metric_weights:
        col = mw["column"]
        w   = mw["weight"] / 100.0
        if col not in df.columns:
            logger.warning(f"Metric column '{col}' not found — skipping")
            continue
        numeric = pd.to_numeric(df[col], errors="coerce").fillna(0)
        score += normalize_series(numeric) * w

    if total_weight > 0:
        score = score / (total_weight / 100)

    return score


def assign_segments_auto(
    df: pd.DataFrame,
    metric_weights: list[dict],
    segment_definitions: list[dict],
) -> pd.DataFrame:
    df = df.copy()
    df["_composite_score"] = compute_composite_score(df, metric_weights)

    # Rank into deciles
    df["_decile"] = pd.qcut(
        df["_composite_score"].rank(method="first"),
        q=10,
        labels=False,
    ) + 1  # 1..10

    # Map decile → segment name
    seg_names = [s["name"] for s in segment_definitions]
    n = len(seg_names)
    # Build decile->segment from definitions order (first = highest)
    decile_map: dict[int, str] = {}
    for d in range(10, 0, -1):
        idx = 10 - d
        seg_idx = min(idx * n // 10, n - 1)
        decile_map[d] = seg_names[seg_idx]

    df["segment"] = df["_decile"].map(decile_map)
    df.drop(columns=["_decile"], inplace=True)
    return df


def assign_segments_from_column(
    df: pd.DataFrame,
    segment_col: str,
) -> pd.DataFrame:
    df = df.copy()
    df["segment"] = df[segment_col].astype(str)
    return df


def compute_segment_summary(
    df: pd.DataFrame,
    segment_definitions: list[dict],
    potential_col: str | None = None,
) -> list[dict]:
    summary = []
    total_hcps = len(df)

    for seg_def in segment_definitions:
        name = seg_def["name"]
        reach = seg_def["reach_pct"]
        freq  = seg_def["frequency"]
        mask  = df["segment"] == name
        count = int(mask.sum())
        calls = round(count * (reach / 100) * freq, 1)

        avg_potential = None
        if potential_col and potential_col in df.columns:
            vals = pd.to_numeric(df.loc[mask, potential_col], errors="coerce")
            avg_potential = round(float(vals.mean()), 0) if not vals.empty else None

        summary.append({
            "segment":               name,
            "hcp_count":             count,
            "pct_of_total":          round(count / total_hcps * 100, 1) if total_hcps else 0,
            "reach_pct":             reach,
            "frequency":             freq,
            "total_calls_required":  calls,
            "avg_potential":         avg_potential,
        })

    return summary


def build_narrative(summary: list[dict], total_calls: float) -> str:
    parts = [f"{s['hcp_count']:,} {s['segment']}" for s in summary if s["hcp_count"] > 0]
    hcp_str = ", ".join(parts[:-1]) + (" and " + parts[-1] if len(parts) > 1 else (parts[0] if parts else "0"))
    return (
        f"Segmentation identified {hcp_str} priority HCPs. "
        f"Based on segment-specific reach and call frequency, "
        f"the total required call workload is {int(total_calls):,} calls per planning period."
    )
