# -*- coding: utf-8 -*-
"""
calculate_incentives.py
────────────────────────
Incentive Calculation Engine — Sales Incentive & Data Validation System

Business Logic:
  - If actual sales > monthly target  →  bonus = 10% of sales
  - Otherwise                         →  bonus = 5% of sales
  - Excludes: missing sales, negative sales, duplicate rows

Outputs: output/incentives.json
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

def calculate():
    print("\n[>>] Calculating Incentives...")

    employees = pd.read_csv(os.path.join(DATA, "employees.csv"))
    sales     = pd.read_csv(os.path.join(DATA, "sales.csv"))
    targets   = pd.read_csv(os.path.join(DATA, "targets.csv"))

    # ── Step 1: Clean data before calculation ─────────────────────────────────
    # Remove duplicates
    sales_clean = sales.drop_duplicates(subset=["emp_id", "month"])

    # Remove missing sales
    sales_clean = sales_clean.dropna(subset=["sales"])

    # Remove negative sales (invalid)
    sales_clean = sales_clean[sales_clean["sales"] >= 0]

    # ── Step 2: Merge sales + targets + employee info ─────────────────────────
    merged = sales_clean.merge(targets, on=["emp_id", "month"], how="inner")
    merged = merged.merge(employees, on="emp_id", how="left")

    # ── Step 3: Apply incentive rule ──────────────────────────────────────────
    merged["bonus_pct"] = np.where(merged["sales"] > merged["target"], 10.0, 5.0)
    merged["payout"]    = (merged["sales"] * merged["bonus_pct"] / 100).round(2)
    merged["hit_target"]= merged["sales"] > merged["target"]

    # ── Step 4: Aggregations ──────────────────────────────────────────────────

    # Per-employee annual summary
    emp_summary = (
        merged.groupby(["emp_id", "name", "region", "role"])
        .agg(
            total_sales   = ("sales",  "sum"),
            total_target  = ("target", "sum"),
            total_payout  = ("payout", "sum"),
            months_above  = ("hit_target", "sum"),
        )
        .reset_index()
    )
    emp_summary["avg_bonus_pct"] = np.where(
        emp_summary["total_sales"] > emp_summary["total_target"], 10.0, 5.0
    )
    emp_summary = emp_summary.sort_values("total_payout", ascending=False)
    emp_summary["total_sales"]  = emp_summary["total_sales"].round(2)
    emp_summary["total_target"] = emp_summary["total_target"].round(2)
    emp_summary["total_payout"] = emp_summary["total_payout"].round(2)
    emp_summary["months_above"] = emp_summary["months_above"].astype(int)

    # Region-wise summary
    region_summary = (
        merged.groupby("region")
        .agg(
            headcount    = ("emp_id", "nunique"),
            total_sales  = ("sales",  "sum"),
            total_payout = ("payout", "sum"),
        )
        .reset_index()
        .sort_values("total_payout", ascending=False)
    )
    region_summary["total_sales"]  = region_summary["total_sales"].round(2)
    region_summary["total_payout"] = region_summary["total_payout"].round(2)

    # Month-over-month trend
    month_trend = (
        merged.groupby("month")
        .agg(
            monthly_sales  = ("sales",  "sum"),
            monthly_payout = ("payout", "sum"),
            employees_paid = ("emp_id", "nunique"),
        )
        .reset_index()
    )
    month_trend["month_order"] = month_trend["month"].map(
        {m: i for i, m in enumerate(MONTH_ORDER)}
    )
    month_trend = month_trend.sort_values("month_order").drop("month_order", axis=1)
    month_trend["monthly_sales"]  = month_trend["monthly_sales"].round(2)
    month_trend["monthly_payout"] = month_trend["monthly_payout"].round(2)

    # Role summary
    role_summary = (
        merged.groupby("role")
        .agg(
            headcount    = ("emp_id", "nunique"),
            total_payout = ("payout", "sum"),
            avg_bonus_pct= ("bonus_pct", "mean"),
        )
        .reset_index()
    )
    role_summary["total_payout"]  = role_summary["total_payout"].round(2)
    role_summary["avg_bonus_pct"] = role_summary["avg_bonus_pct"].round(1)

    # ── Step 5: Global KPIs ───────────────────────────────────────────────────
    kpis = {
        "grand_total_payout":    round(float(merged["payout"].sum()), 2),
        "grand_total_sales":     round(float(merged["sales"].sum()),  2),
        "avg_bonus_pct":         round(float(merged["bonus_pct"].mean()), 1),
        "pct_above_target":      round(float(merged["hit_target"].mean() * 100), 1),
        "total_employees":       int(employees["emp_id"].nunique()),
        "months_analyzed":       12,
    }

    # ── Step 6: Build output object ───────────────────────────────────────────
    output = {
        "kpis":           kpis,
        "by_employee":    emp_summary.to_dict(orient="records"),
        "by_region":      region_summary.to_dict(orient="records"),
        "by_month":       month_trend.to_dict(orient="records"),
        "by_role":        role_summary.to_dict(orient="records"),
        "detail_records": merged[["emp_id","name","region","role","month",
                                   "sales","target","bonus_pct","payout",
                                   "hit_target"]].to_dict(orient="records"),
    }

    out_path = os.path.join(OUT_DIR, "incentives.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"   [OK] Incentives calculated -> {out_path}")
    print(f"   [$]  Grand Total Payout : ${kpis['grand_total_payout']:,.2f}")
    print(f"   [^]  Avg Bonus %%        : {kpis['avg_bonus_pct']}%%")
    print(f"   [T]  %% Above Target    : {kpis['pct_above_target']}%%")
    return output


if __name__ == "__main__":
    calculate()
