# -*- coding: utf-8 -*-
"""
reconcile.py
─────────────
Reconciliation Module — Sales Incentive & Data Validation System

Compares:
  - Expected payout: what would be paid if everyone hit exactly their target (5% baseline)
  - Actual payout:   computed from real sales (10% if above target, 5% otherwise)

Identifies:
  - Who was overpaid vs underpaid relative to baseline
  - Largest absolute variances
  - Monthly reconciliation summary

Outputs: output/reconciliation.json
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

def reconcile():
    print("\n[>>] Running Reconciliation...")

    employees = pd.read_csv(os.path.join(DATA, "employees.csv"))
    sales     = pd.read_csv(os.path.join(DATA, "sales.csv"))
    targets   = pd.read_csv(os.path.join(DATA, "targets.csv"))

    # ── Clean data (same rules as incentive engine) ───────────────────────────
    sales_clean = sales.drop_duplicates(subset=["emp_id", "month"])
    sales_clean = sales_clean.dropna(subset=["sales"])
    sales_clean = sales_clean[sales_clean["sales"] >= 0]

    # ── Merge ─────────────────────────────────────────────────────────────────
    merged = sales_clean.merge(targets, on=["emp_id", "month"], how="inner")
    merged = merged.merge(employees, on="emp_id", how="left")

    # ── Compute payouts ───────────────────────────────────────────────────────
    # Actual payout (based on real sales + incentive rule)
    merged["actual_payout"] = np.where(
        merged["sales"] > merged["target"],
        merged["sales"] * 0.10,
        merged["sales"] * 0.05,
    ).round(2)

    # Expected payout (what we'd pay if everyone hit exactly their target → 5%)
    merged["expected_payout"] = (merged["target"] * 0.05).round(2)

    # Variance
    merged["variance"]     = (merged["actual_payout"] - merged["expected_payout"]).round(2)
    merged["variance_pct"] = (
        merged["variance"] / merged["expected_payout"].replace(0, np.nan) * 100
    ).round(1)

    # ── Employee-level annual reconciliation ──────────────────────────────────
    emp_recon = (
        merged.groupby(["emp_id", "name", "region", "role"])
        .agg(
            total_actual_payout   = ("actual_payout",   "sum"),
            total_expected_payout = ("expected_payout",  "sum"),
            total_variance        = ("variance",          "sum"),
        )
        .reset_index()
    )
    emp_recon["variance_pct"] = (
        emp_recon["total_variance"] /
        emp_recon["total_expected_payout"].replace(0, np.nan) * 100
    ).round(1)
    emp_recon["status"] = np.where(
        emp_recon["total_variance"] > 0, "OVERPAID", "UNDERPAID"
    )
    for col in ["total_actual_payout","total_expected_payout","total_variance"]:
        emp_recon[col] = emp_recon[col].round(2)
    emp_recon = emp_recon.sort_values("total_variance", key=abs, ascending=False)

    # ── Monthly reconciliation summary ────────────────────────────────────────
    month_recon = (
        merged.groupby("month")
        .agg(
            total_actual   = ("actual_payout",   "sum"),
            total_expected = ("expected_payout",  "sum"),
            total_variance = ("variance",          "sum"),
        )
        .reset_index()
    )
    month_recon["month_order"] = month_recon["month"].map(
        {m: i for i, m in enumerate(MONTH_ORDER)}
    )
    month_recon = month_recon.sort_values("month_order").drop("month_order", axis=1)
    for col in ["total_actual","total_expected","total_variance"]:
        month_recon[col] = month_recon[col].round(2)

    # ── Summary KPIs ──────────────────────────────────────────────────────────
    summary = {
        "grand_actual_payout":   round(float(emp_recon["total_actual_payout"].sum()),   2),
        "grand_expected_payout": round(float(emp_recon["total_expected_payout"].sum()), 2),
        "grand_variance":        round(float(emp_recon["total_variance"].sum()),         2),
        "overpaid_count":        int((emp_recon["total_variance"] > 0).sum()),
        "underpaid_count":       int((emp_recon["total_variance"] < 0).sum()),
        "exact_count":           int((emp_recon["total_variance"] == 0).sum()),
    }

    output = {
        "summary":          summary,
        "by_employee":      emp_recon.to_dict(orient="records"),
        "by_month":         month_recon.to_dict(orient="records"),
    }

    out_path = os.path.join(OUT_DIR, "reconciliation.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"   [OK] Reconciliation complete -> {out_path}")
    print(f"   [$]  Grand Actual   : ${summary['grand_actual_payout']:,.2f}")
    print(f"   [E]  Grand Expected : ${summary['grand_expected_payout']:,.2f}")
    print(f"   [V]  Grand Variance : ${summary['grand_variance']:,.2f}")
    print(f"   [+]  Overpaid  employees : {summary['overpaid_count']}")
    print(f"   [-]  Underpaid employees : {summary['underpaid_count']}")
    return output


if __name__ == "__main__":
    reconcile()
