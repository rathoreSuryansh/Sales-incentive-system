# -*- coding: utf-8 -*-
"""
anomaly_detection.py
─────────────────────
Anomaly Detection Module — Sales Incentive & Data Validation System

Detects two types of anomalies:
  1. Payout Outliers   — payouts that are > 2.5 standard deviations from the mean
                         (Z-score method, per-role normalized)
  2. Month-over-Month Spikes — an employee's payout jumps > 150% from previous month

Also flags the known data quality issues (negative sales, missing values).

Outputs: output/anomalies.json
"""

import sys
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np
import json
import os

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA    = os.path.join(BASE, "data")
OUT_DIR = os.path.join(BASE, "output")
os.makedirs(OUT_DIR, exist_ok=True)

MONTH_ORDER = ["Jan","Feb","Mar","Apr","May","Jun",
               "Jul","Aug","Sep","Oct","Nov","Dec"]
ZSCORE_THRESHOLD = 2.5
MOM_SPIKE_PCT    = 1.50   # 150% jump

def detect_anomalies():
    print("\n[>>] Running Anomaly Detection...")

    employees = pd.read_csv(os.path.join(DATA, "employees.csv"))
    sales     = pd.read_csv(os.path.join(DATA, "sales.csv"))
    targets   = pd.read_csv(os.path.join(DATA, "targets.csv"))

    # ── Clean data ────────────────────────────────────────────────────────────
    sales_clean = sales.drop_duplicates(subset=["emp_id", "month"])
    sales_clean_valid = sales_clean.dropna(subset=["sales"])
    sales_clean_valid = sales_clean_valid[sales_clean_valid["sales"] >= 0].copy()

    merged = sales_clean_valid.merge(targets, on=["emp_id", "month"], how="inner")
    merged = merged.merge(employees, on="emp_id", how="left")

    # Compute payout
    merged["payout"] = np.where(
        merged["sales"] > merged["target"],
        merged["sales"] * 0.10,
        merged["sales"] * 0.05,
    ).round(2)

    # ── Anomaly 1: Z-Score Outliers ───────────────────────────────────────────
    merged["zscore"] = merged.groupby("role")["payout"].transform(
        lambda x: (x - x.mean()) / x.std(ddof=0)
    ).round(3)

    zscore_anomalies = merged[merged["zscore"].abs() > ZSCORE_THRESHOLD].copy()
    zscore_anomalies["anomaly_type"]   = "PAYOUT_OUTLIER"
    zscore_anomalies["anomaly_detail"] = zscore_anomalies["zscore"].apply(
        lambda z: f"Z-score = {z:.2f} (threshold ±{ZSCORE_THRESHOLD})"
    )
    zscore_anomalies["severity"] = "HIGH"

    # ── Anomaly 2: Month-over-Month Spikes ────────────────────────────────────
    month_map   = {m: i for i, m in enumerate(MONTH_ORDER)}
    merged["month_num"] = merged["month"].map(month_map)
    merged_sorted = merged.sort_values(["emp_id", "month_num"])

    merged_sorted["prev_payout"] = merged_sorted.groupby("emp_id")["payout"].shift(1)
    merged_sorted["mom_change"]  = (
        (merged_sorted["payout"] - merged_sorted["prev_payout"]) /
        merged_sorted["prev_payout"].replace(0, np.nan)
    ).round(3)

    spike_anomalies = merged_sorted[
        merged_sorted["mom_change"] > MOM_SPIKE_PCT
    ].copy()
    spike_anomalies["anomaly_type"]   = "MOM_SPIKE"
    spike_anomalies["anomaly_detail"] = spike_anomalies["mom_change"].apply(
        lambda c: f"Month-over-Month jump = +{c*100:.1f}%% (threshold +{MOM_SPIKE_PCT*100:.0f}%%)"
    )
    spike_anomalies["severity"] = "MEDIUM"

    # ── Anomaly 3: Known Data Quality Issues ──────────────────────────────────
    # Missing values
    missing = sales[sales["sales"].isna()].merge(employees, on="emp_id", how="left")
    missing["anomaly_type"]   = "MISSING_VALUE"
    missing["anomaly_detail"] = "Sales value is NULL/missing"
    missing["severity"]       = "LOW"
    missing["payout"]         = 0.0
    missing["target"]         = None

    # Negative entries
    negative = sales[sales["sales"] < 0].dropna().merge(employees, on="emp_id", how="left")
    negative["anomaly_type"]   = "NEGATIVE_SALE"
    negative["anomaly_detail"] = negative["sales"].apply(lambda s: f"Invalid sales = ${s:,.0f}")
    negative["severity"]       = "HIGH"
    negative["payout"]         = 0.0
    negative["target"]         = None

    # ── Combine all anomalies ─────────────────────────────────────────────────
    cols = ["emp_id","name","region","role","month",
            "sales","target","payout","anomaly_type","anomaly_detail","severity"]

    all_anomalies = pd.concat([
        zscore_anomalies[cols],
        spike_anomalies[cols],
        missing[[c for c in cols if c in missing.columns]],
        negative[[c for c in cols if c in negative.columns]],
    ], ignore_index=True)

    # Fill missing cols
    for col in cols:
        if col not in all_anomalies.columns:
            all_anomalies[col] = None

    all_anomalies = all_anomalies[cols].copy()

    # ── Summary ───────────────────────────────────────────────────────────────
    summary = {
        "total_anomalies":      len(all_anomalies),
        "payout_outliers":      len(zscore_anomalies),
        "mom_spikes":           len(spike_anomalies),
        "missing_values":       len(missing),
        "negative_sales":       len(negative),
        "severity_breakdown": {
            "HIGH":   int((all_anomalies["severity"] == "HIGH").sum()),
            "MEDIUM": int((all_anomalies["severity"] == "MEDIUM").sum()),
            "LOW":    int((all_anomalies["severity"] == "LOW").sum()),
        }
    }

    output = {
        "summary":   summary,
        "anomalies": all_anomalies.to_dict(orient="records"),
    }

    out_path = os.path.join(OUT_DIR, "anomalies.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"   [OK] Anomaly detection complete -> {out_path}")
    print(f"   [H]  HIGH severity   : {summary['severity_breakdown']['HIGH']}")
    print(f"   [M]  MEDIUM severity : {summary['severity_breakdown']['MEDIUM']}")
    print(f"   [L]  LOW severity    : {summary['severity_breakdown']['LOW']}")
    print(f"   [*]  Total anomalies : {summary['total_anomalies']}")
    return output


if __name__ == "__main__":
    detect_anomalies()
