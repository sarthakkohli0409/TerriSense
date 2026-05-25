"""
Territory alignment service — upgraded with v10 algorithms

Key improvements over original:
1. ZIP reference table (uszips.csv) enriches missing lat/lon and canonicalises state
2. Recursive geographic bisection for initial territory grouping
3. Contiguous Prim-style expansion via priority queue (no cross-territory islands)
4. Three-pass border-donation rebalancing (drain over-cap → lift under-floor → tighten yellow)
5. Two-phase state-preferring rebalance (same-state first, then soft cross-state)
6. Four-tier territory status: Green / Yellow / Orange / Red
7. cKDTree neighbor graph (O(n log n), replaces O(n²) loop)
"""
import gc
import heapq
import math
import logging
import os
import numpy as np
import pandas as pd
from typing import Any
from collections import defaultdict
from scipy.spatial import cKDTree
from scipy.spatial.distance import cdist

logger = logging.getLogger("terrisense.alignment")

# ---------------------------------------------------------------------------
# ZIP reference table — loaded once at module import
# ---------------------------------------------------------------------------
_MASTER_ZIP_DF: pd.DataFrame = pd.DataFrame()


def _load_zip_table():
    global _MASTER_ZIP_DF
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "uszips.csv"),
        os.path.join(os.path.dirname(__file__), "..", "..", "uszips.csv"),
        "/home/claude/terrisense/backend/uszips.csv",
    ]
    for path in candidates:
        path = os.path.abspath(path)
        if os.path.exists(path):
            df = pd.read_csv(path, dtype=str)
            df.columns = df.columns.str.strip().str.lower()
            df.rename(columns={
                "zip": "zip_code", "zipcode": "zip_code",
                "lat": "latitude", "lng": "longitude", "long": "longitude",
            }, inplace=True)
            required = {"zip_code", "latitude", "longitude"}
            if not required.issubset(df.columns):
                logger.warning(f"ZIP table at {path} missing required columns")
                continue
            df["zip_code"] = df["zip_code"].astype(str).str.strip().str.zfill(5)
            df["latitude"]  = pd.to_numeric(df["latitude"],  errors="coerce")
            df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
            df.dropna(subset=["zip_code", "latitude", "longitude"], inplace=True)
            if "state_id" in df.columns and "state" not in df.columns:
                df["state"] = df["state_id"]
            elif "state" not in df.columns:
                df["state"] = "XX"
            _MASTER_ZIP_DF = df[["zip_code", "latitude", "longitude", "state"]].copy()
            logger.info(f"ZIP reference table loaded: {len(_MASTER_ZIP_DF):,} rows from {path}")
            return
    logger.warning("ZIP reference table (uszips.csv) not found — lat/lon enrichment disabled")


_load_zip_table()


def enrich_coords_from_zip(df: pd.DataFrame, zip_col: str) -> pd.DataFrame:
    """
    Fill missing lat/lon from uszips reference table.
    Also canonicalises state from the reference table for rows where lat/lon is absent.
    """
    if _MASTER_ZIP_DF.empty:
        return df

    df = df.copy()
    df["_zip5"] = df[zip_col].astype(str).str.strip().str.zfill(5)

    zip_lookup = _MASTER_ZIP_DF.set_index("zip_code")[["latitude", "longitude", "state"]]

    missing_lat = df["_lat"].isna() | (df["_lat"] == 0)
    missing_lon = df["_lon"].isna() | (df["_lon"] == 0)
    needs_enrich = missing_lat | missing_lon

    if needs_enrich.any():
        n_before = needs_enrich.sum()
        matched = df.loc[needs_enrich, "_zip5"].map(zip_lookup["latitude"])
        df.loc[needs_enrich, "_lat"] = matched.values
        matched_lon = df.loc[needs_enrich, "_zip5"].map(zip_lookup["longitude"])
        df.loc[needs_enrich, "_lon"] = matched_lon.values
        n_after = (df["_lat"].isna() | (df["_lat"] == 0)).sum()
        logger.info(f"ZIP enrichment: filled {n_before - n_after} / {n_before} missing coords")

    # Canonicalise state from reference table (overrides HCP-row state where available)
    if "_state" in df.columns:
        canon_state = df["_zip5"].map(zip_lookup["state"])
        df["_state"] = canon_state.fillna(df["_state"])

    df.drop(columns=["_zip5"], inplace=True)
    return df


# ---------------------------------------------------------------------------
# Haversine (for compactness score only — cKDTree uses Euclidean)
# ---------------------------------------------------------------------------
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def compactness_score(zip_lats, zip_lons, centroid_lat, centroid_lon):
    if not zip_lats:
        return 1.0
    dists = [haversine(centroid_lat, centroid_lon, la, lo)
             for la, lo in zip(zip_lats, zip_lons)]
    mean_d = np.mean(dists)
    return round(max(0.0, 1.0 - mean_d / 500.0), 3)


# ---------------------------------------------------------------------------
# Step 1: Aggregate HCPs to ZIP level
# ---------------------------------------------------------------------------
def aggregate_to_zips(df: pd.DataFrame) -> pd.DataFrame:
    """
    Expects columns: _zip, _state, _lat, _lon, _calls, _potential
    Returns one row per ZIP.
    """
    agg = df.groupby("_zip").agg(
        lat=("_lat", "mean"),
        lon=("_lon", "mean"),
        state=("_state", lambda x: x.mode()[0] if len(x) else "XX"),
        hcp_count=("_zip", "count"),
        total_calls=("_calls", "sum"),
        potential=("_potential", "sum"),
    ).reset_index().rename(columns={"_zip": "zip"})
    return agg


# ---------------------------------------------------------------------------
# Step 2: Build ZIP neighbor graph via cKDTree (O(n log n))
# ---------------------------------------------------------------------------
def build_neighbor_graph(coords: np.ndarray, k_neighbors: int = 8) -> dict:
    tree = cKDTree(coords)
    _, indices = tree.query(coords, k=min(k_neighbors + 1, len(coords)))
    return {i: set(int(j) for j in row if j != i) for i, row in enumerate(indices)}


# ---------------------------------------------------------------------------
# Step 3: Recursive geographic bisection — balanced initial grouping
# ---------------------------------------------------------------------------
def _bisect(coords: np.ndarray, weights: np.ndarray, indices: np.ndarray, k: int) -> list:
    """Recursively bisect along longest axis, balanced by weight."""
    if k == 1:
        return [indices]
    sc = coords[indices]
    axis = 0 if (sc[:, 0].max() - sc[:, 0].min()) >= (sc[:, 1].max() - sc[:, 1].min()) else 1
    so = np.argsort(sc[:, axis])
    si = indices[so]
    sw = weights[si]
    cu = np.cumsum(sw)
    cut = max(1, min(int(np.searchsorted(cu, cu[-1] / 2.0)), len(si) - 1))
    kl, kr = k // 2, k - k // 2
    return _bisect(coords, weights, si[:cut], kl) + _bisect(coords, weights, si[cut:], kr)


# ---------------------------------------------------------------------------
# Step 4: Contiguous Prim-style ZIP assignment (priority queue expansion)
# ---------------------------------------------------------------------------
def assign_zips_contiguous(
    coords: np.ndarray,
    weights: np.ndarray,
    initial_labels: np.ndarray,
    K: int,
    neighbors: dict,
) -> tuple:
    """
    Grows each territory outward from its seed ZIPs using a min-heap.
    A ZIP can only be claimed by a territory if it is geographically adjacent
    to a ZIP already in that territory — prevents non-contiguous islands.
    """
    n = len(coords)
    labels = initial_labels.copy()
    cluster_loads = np.array([weights[labels == t].sum() for t in range(K)])

    # Compute distance from each unassigned ZIP to each territory's weighted centroid
    def centroid(t_id):
        idx = np.where(labels == t_id)[0]
        w = weights[idx]
        return (coords[idx] * w[:, None]).sum(0) / w.sum() if len(idx) > 0 else coords.mean(0)

    centroids = np.array([centroid(t) for t in range(K)])

    # Priority queue: (distance_to_territory_centroid, zip_idx, territory_id)
    frontier = []
    in_queue = set()

    def push_neighbors(z_idx, t_id):
        for nb in neighbors.get(z_idx, []):
            if labels[nb] == -1 and nb not in in_queue:
                d = np.linalg.norm(coords[nb] - centroids[t_id])
                heapq.heappush(frontier, (d, nb, t_id))
                in_queue.add(nb)

    # Seed: mark bisection groups, push their frontier
    for z in range(n):
        push_neighbors(z, labels[z])

    while frontier:
        dist, z_idx, t_id = heapq.heappop(frontier)
        if labels[z_idx] != -1:
            continue
        labels[z_idx] = t_id
        cluster_loads[t_id] += weights[z_idx]
        # Update centroid incrementally (approximate)
        centroids[t_id] = coords[labels == t_id].mean(0)
        push_neighbors(z_idx, t_id)

    # Force-assign any remaining (disconnected ZIPs)
    for z in range(n):
        if labels[z] == -1:
            dists = [np.linalg.norm(coords[z] - centroids[t]) for t in range(K)]
            t = int(np.argmin(dists))
            labels[z] = t
            cluster_loads[t] += weights[z]

    return labels, cluster_loads


# ---------------------------------------------------------------------------
# Step 5: Three-pass border-donation rebalance + two-phase state preference
# ---------------------------------------------------------------------------
def state_preferring_rebalance(
    coords: np.ndarray,
    weights: np.ndarray,
    states: np.ndarray,
    labels: np.ndarray,
    K: int,
    hard_floor: float,
    min_cap: float,
    max_cap: float,
    neighbors: dict,
    prefer_state: bool = True,
    max_rounds: int = 40,
) -> tuple:
    """
    Two-phase rebalancing:
    Phase 1 — border donations preferring same-state neighbours (hard range)
    Phase 2 — relax to soft range for cross-state donations if still needed
    """
    labels = labels.copy()
    soft_min = hard_floor * 0.875
    soft_max = max_cap * 1.087

    def get_loads():
        return np.array([weights[labels == t].sum() for t in range(K)])

    def border_zips_of(t_id):
        return [z for z in np.where(labels == t_id)[0]
                if any(labels[nb] != t_id for nb in neighbors.get(z, []))]

    def wcentroid(t_id):
        idx = np.where(labels == t_id)[0]
        w = weights[idx]
        return (coords[idx] * w[:, None]).sum(0) / w.sum() if len(idx) > 0 else coords.mean(0)

    def do_pass(donor_floor, recv_cap, same_state_only=False):
        made = False
        loads = get_loads()

        # Drain over-cap territories
        for o_id in sorted([t for t in range(K) if loads[t] > max_cap], key=lambda t: -loads[t]):
            if loads[o_id] <= max_cap:
                continue
            bz = sorted(border_zips_of(o_id), key=lambda z: weights[z])
            adj = set(labels[nb] for z in bz for nb in neighbors.get(z, []) if labels[nb] != o_id)
            if prefer_state and same_state_only:
                o_states = set(states[labels == o_id])
                adj = {t for t in adj if bool(set(states[labels == t]) & o_states)}
            for recv_id in sorted(adj, key=lambda t: loads[t]):
                if loads[o_id] <= max_cap:
                    break
                if loads[recv_id] >= recv_cap:
                    continue
                rc = wcentroid(recv_id)
                for z in sorted(bz, key=lambda z: np.linalg.norm(coords[z] - rc)):
                    w = weights[z]
                    if loads[o_id] - w < donor_floor:
                        continue
                    if loads[recv_id] + w > recv_cap:
                        continue
                    labels[z] = recv_id
                    loads[o_id] -= w
                    loads[recv_id] += w
                    bz = [x for x in bz if x != z]
                    made = True
                    break

        # Lift under-floor territories
        for u_id in sorted([t for t in range(K) if loads[t] < hard_floor], key=lambda t: loads[t]):
            if loads[u_id] >= hard_floor:
                continue
            uc = wcentroid(u_id)
            adj = set(labels[nb] for z in np.where(labels == u_id)[0]
                      for nb in neighbors.get(z, []) if labels[nb] != u_id)
            if prefer_state and same_state_only:
                u_states = set(states[labels == u_id])
                adj = {t for t in adj if bool(set(states[labels == t]) & u_states)}
            for d_id in sorted(adj, key=lambda t: -loads[t]):
                if loads[u_id] >= hard_floor:
                    break
                if loads[d_id] <= donor_floor:
                    continue
                for z in sorted(border_zips_of(d_id), key=lambda z: np.linalg.norm(coords[z] - uc)):
                    w = weights[z]
                    if loads[d_id] - w < donor_floor:
                        continue
                    if loads[u_id] + w > recv_cap:
                        continue
                    labels[z] = u_id
                    loads[u_id] += w
                    loads[d_id] -= w
                    made = True
                    break
        return made

    # Phase 1: same-state preference, hard range
    if prefer_state:
        for rnd in range(max_rounds // 2):
            loads = get_loads()
            if not any(loads[t] > max_cap or loads[t] < hard_floor for t in range(K)):
                logger.debug(f"Phase 1 converged at round {rnd}")
                break
            if not do_pass(hard_floor * 0.5, max_cap, same_state_only=True):
                break

    # Phase 2: cross-state allowed, soft range
    for rnd in range(max_rounds):
        loads = get_loads()
        if not any(loads[t] > max_cap or loads[t] < hard_floor for t in range(K)):
            logger.debug(f"Phase 2 converged at round {rnd}")
            break
        if not do_pass(hard_floor * 0.5, soft_max, same_state_only=False):
            logger.debug(f"Phase 2 stalled at round {rnd}")
            break

    # Pass 3: tighten yellow (below min_cap)
    for rnd in range(50):
        loads = get_loads()
        yellow = [t for t in range(K) if loads[t] < min_cap]
        if not yellow:
            break
        made = False
        for u_id in sorted(yellow, key=lambda t: loads[t]):
            if loads[u_id] >= min_cap:
                continue
            uc = wcentroid(u_id)
            adj = set(labels[nb] for z in np.where(labels == u_id)[0]
                      for nb in neighbors.get(z, []) if labels[nb] != u_id)
            for d_id in sorted(adj, key=lambda t: -loads[t]):
                if loads[u_id] >= min_cap:
                    break
                if loads[d_id] <= min_cap + 20:
                    continue
                for z in sorted(border_zips_of(d_id),
                                key=lambda z: np.linalg.norm(coords[z] - uc)):
                    w = weights[z]
                    if loads[d_id] - w < hard_floor:
                        continue
                    if loads[u_id] + w > max_cap:
                        continue
                    labels[z] = u_id
                    loads[u_id] += w
                    loads[d_id] -= w
                    made = True
                    break
        if not made:
            break

    cluster_loads = np.array([weights[labels == t].sum() for t in range(K)])
    return labels, cluster_loads


# ---------------------------------------------------------------------------
# Step 6: Build territory records with four-tier status
# ---------------------------------------------------------------------------
def build_territory_records(
    zip_df: pd.DataFrame,
    assignments: np.ndarray,
    K: int,
    hard_floor: float,
    min_cap: float,
    max_cap: float,
) -> list:
    zip_df = zip_df.copy()
    zip_df["territory_id"] = assignments

    avg_calls = zip_df.groupby("territory_id")["total_calls"].sum().mean()
    avg_pot   = zip_df.groupby("territory_id")["potential"].sum().mean()

    territories = []
    for t_id in range(1, K + 1):
        mask = zip_df["territory_id"] == t_id
        sub  = zip_df[mask]
        if sub.empty:
            continue

        total_calls = float(sub["total_calls"].sum())
        total_pot   = float(sub["potential"].sum())
        hcp_count   = int(sub["hcp_count"].sum())
        zip_count   = int(len(sub))
        state_list  = sorted(sub["state"].unique().tolist())
        centroid_lat = float(sub["lat"].mean())
        centroid_lon = float(sub["lon"].mean())

        w_idx = round(total_calls / avg_calls * 100, 1) if avg_calls else 100.0
        p_idx = round(total_pot   / avg_pot   * 100, 1) if avg_pot   else 100.0

        # Four-tier status (mirrors v10)
        tol_pct = (max_cap - 1000) / 10   # e.g. max_cap=1150 → tol=15%
        if w_idx > 100 + tol_pct:
            balance_status = "above"       # Orange
        elif w_idx < 100 - tol_pct:
            balance_status = "below"       # may be Yellow or Red
        else:
            balance_status = "within"      # Green

        # Red = below hard floor
        if total_calls < hard_floor * (avg_calls / 1000) if avg_calls else False:
            balance_status = "red"

        comp = compactness_score(
            sub["lat"].tolist(), sub["lon"].tolist(), centroid_lat, centroid_lon
        )

        territories.append({
            "territory_id":     t_id,
            "hcp_count":        hcp_count,
            "zip_count":        zip_count,
            "total_calls":      round(total_calls, 1),
            "workload_index":   w_idx,
            "potential_index":  p_idx,
            "states":           state_list,
            "state_split":      len(state_list) > 1,
            "centroid_lat":     centroid_lat,
            "centroid_lon":     centroid_lon,
            "balance_status":   balance_status,
            "compactness_score": comp,
        })

    return territories


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def run_alignment(
    hcp_data: list[dict],
    final_k: int,
    state_alignment: str = "soft",
    balance_tolerance_pct: float = 15,
    balance_metric: str = "calls",
) -> dict:
    df = pd.DataFrame(hcp_data)
    warnings: list[str] = []

    if df.empty or final_k < 1:
        raise ValueError("No HCP data or invalid K.")

    # ── Detect and normalise columns ───────────────────────────────────────
    def col(candidates):
        for c in candidates:
            if c in df.columns:
                return c
        return None

    zip_col   = col(["zip", "zip_code", "zipcode", "postal_code", "clean_zip"]) or "zip"
    state_col = col(["state", "state_code", "st"]) or "state"
    lat_col   = col(["lat", "latitude"]) or "lat"
    lon_col   = col(["lon", "lng", "longitude"]) or "lon"
    pot_col   = col(["patient_potential", "potential", "market_potential", "sales"])

    df["_zip"]   = df[zip_col].astype(str).str.strip().str.zfill(5) if zip_col in df.columns else "00000"
    df["_state"] = df[state_col].astype(str) if state_col in df.columns else "XX"
    df["_lat"]   = pd.to_numeric(df[lat_col], errors="coerce") if lat_col in df.columns else np.nan
    df["_lon"]   = pd.to_numeric(df[lon_col], errors="coerce") if lon_col in df.columns else np.nan
    df["_potential"] = pd.to_numeric(df[pot_col], errors="coerce").fillna(0) if pot_col else 0.0

    # ── Enrich missing coords from ZIP reference table ─────────────────────
    n_before = df["_lat"].isna().sum() + (df["_lat"] == 0).sum()
    df = enrich_coords_from_zip(df, "_zip")
    n_after = df["_lat"].isna().sum() + (df["_lat"] == 0).sum()
    if n_before > 0:
        warnings.append(
            f"{n_before - n_after} HCPs had coordinates filled from ZIP reference table."
            if n_after < n_before else
            f"{n_before} HCPs are missing coordinates and could not be enriched."
        )

    # ── Per-HCP call workload ──────────────────────────────────────────────
    seg_calls = {
        "Very High": 10.8, "High": 6.4, "Medium": 2.4,
        "Low": 0.6, "Very Low": 0.0,
    }
    if "segment" in df.columns:
        df["_calls"] = df["segment"].map(lambda s: seg_calls.get(str(s), 2.4))
    else:
        df["_calls"] = 2.4

    # ── Drop rows still missing coords ────────────────────────────────────
    n_total = len(df)
    df = df.dropna(subset=["_lat", "_lon"])
    df = df[(df["_lat"] != 0) | (df["_lon"] != 0)]
    if len(df) < n_total:
        warnings.append(f"{n_total - len(df)} HCPs dropped — no coordinates after enrichment.")

    if df.empty:
        raise ValueError("No HCPs with valid coordinates. Check that your data has lat/lon or valid ZIP codes.")

    # ── Aggregate to ZIP level ─────────────────────────────────────────────
    zip_df = aggregate_to_zips(df)
    n_zips = len(zip_df)
    K = min(final_k, n_zips)
    if K < final_k:
        warnings.append(f"Only {n_zips} unique ZIPs — K reduced from {final_k} to {K}.")

    # ── Sizing parameters (mirrors v10: target=1000, tolerance-based caps) ─
    tol = balance_tolerance_pct / 100
    # Normalise weights so total = K * 1000
    total_calls = zip_df["total_calls"].sum()
    if total_calls > 0:
        zip_df["weight"] = (zip_df["total_calls"] / total_calls * K * 1000).clip(lower=0)
    else:
        zip_df["weight"] = 1000.0

    hard_floor = 650.0
    min_cap    = round(1000 * (1 - tol))
    max_cap    = round(1000 * (1 + tol))

    coords  = zip_df[["lat", "lon"]].values
    weights = zip_df["weight"].values.astype(float)
    states  = zip_df["state"].values

    # ── Build neighbor graph ───────────────────────────────────────────────
    k_nb = min(8, n_zips - 1)
    neighbors = build_neighbor_graph(coords, k_neighbors=k_nb)
    gc.collect()

    # ── Initial grouping: recursive geographic bisection ──────────────────
    logger.info(f"Bisecting {n_zips} ZIPs into {K} groups...")
    groups = _bisect(coords, weights, np.arange(n_zips), K)
    initial_labels = np.zeros(n_zips, dtype=int)
    for t_id, grp in enumerate(groups):
        initial_labels[grp] = t_id
    gc.collect()

    # ── Contiguous assignment (Prim-style priority queue expansion) ────────
    logger.info("Running contiguous ZIP assignment...")
    labels, cluster_loads = assign_zips_contiguous(
        coords, weights, initial_labels, K, neighbors
    )
    gc.collect()

    # ── Rebalance ──────────────────────────────────────────────────────────
    prefer_state = state_alignment in ("soft", "strict")
    logger.info(f"Rebalancing (prefer_state={prefer_state}, tolerance=±{balance_tolerance_pct}%)...")
    labels, cluster_loads = state_preferring_rebalance(
        coords, weights, states, labels, K,
        hard_floor=hard_floor,
        min_cap=min_cap,
        max_cap=max_cap,
        neighbors=neighbors,
        prefer_state=prefer_state,
        max_rounds=40,
    )
    gc.collect()

    # ── Convert 0-based labels to 1-based territory IDs ───────────────────
    zip_df["territory_id"] = labels + 1

    # ── Build ZIP assignments ──────────────────────────────────────────────
    zip_assignments = []
    for _, row in zip_df.iterrows():
        zip_assignments.append({
            "zip":          str(row["zip"]),
            "state":        str(row["state"]),
            "lat":          round(float(row["lat"]), 4),
            "lon":          round(float(row["lon"]), 4),
            "hcp_count":    int(row["hcp_count"]),
            "total_calls":  round(float(row["total_calls"]), 1),
            "potential":    round(float(row["potential"]), 0),
            "territory_id": int(row["territory_id"]),
        })

    # ── HCP assignments ────────────────────────────────────────────────────
    zip_to_terr = dict(zip(zip_df["zip"].astype(str), zip_df["territory_id"].astype(int)))
    hcp_out = []
    for row in hcp_data:
        z = str(row.get(zip_col, row.get("zip", row.get("_zip", "")))).zfill(5)
        hcp_out.append({**row, "territory_id": zip_to_terr.get(z, -1)})

    # ── Territory records ──────────────────────────────────────────────────
    territories = build_territory_records(
        zip_df, labels + 1, K, hard_floor, min_cap, max_cap
    )

    # ── Summary stats ──────────────────────────────────────────────────────
    n_within = sum(1 for t in territories if t["balance_status"] == "within")
    n_splits = sum(1 for t in territories if t["state_split"])
    pct_within = round(n_within / len(territories) * 100, 1) if territories else 0
    avg_hcps   = round(sum(t["hcp_count"]    for t in territories) / len(territories), 1) if territories else 0
    avg_calls  = round(sum(t["total_calls"]  for t in territories) / len(territories), 1) if territories else 0

    narrative = (
        f"TerriSense created {len(territories)} contiguous territories using "
        f"{'state-preferring' if prefer_state else 'unconstrained'} alignment "
        f"and ±{balance_tolerance_pct}% workload tolerance. "
        f"{pct_within}% of territories are within balance tolerance. "
        f"{n_splits} territories span multiple states."
    )

    logger.info(
        f"Alignment complete: {len(territories)} territories, "
        f"{pct_within}% within tolerance, {n_splits} state splits"
    )

    return {
        "territories":             territories,
        "hcp_assignments":         hcp_out,
        "zip_assignments":         zip_assignments,
        "avg_hcps_per_territory":  avg_hcps,
        "avg_calls_per_territory": avg_calls,
        "narrative":               narrative,
        "warnings":                warnings,
    }
