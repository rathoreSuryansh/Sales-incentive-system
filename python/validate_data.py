# -*- coding: utf-8 -*-
"""
validate_data.py
─────────────────
Data Validation Module — Sales Incentive & Data Validation System

Performs three categories of checks on the raw CSV data:
  1. Missing Values   — finds NaN/null entries
  2. Duplicate Rows   — detects repeated records
  3. Invalid Entries  — negative sales, unknown regions/roles

Outputs: output/validation_report.json
"""

import sys
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import json
import os

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA    = os.path.join(BASE, "data")
OUT_DIR = os.path.join(BASE, "output")
os.makedirs(OUT_DIR, exist_ok=True)

VALID_REGIONS = {"North", "South", "East", "West"}
VALID_ROLES   = {"SDR", "AE", "Manager"}
VALID_MONTHS  = {"Jan","Feb","Mar","Apr","May","Jun",
                 "Jul","Aug","Sep","Oct","Nov","Dec"}

def validate():
    print("\n[>>] Running Data Validation...")

    employees = pd.read_csv(os.path.join(DATA, "employees.csv"))
    sales     = pd.read_csv(os.path.join(DATA, "sales.csv"))
    targets   = pd.read_csv(os.path.join(DATA, "targets.csv"))

    report = {
        "summary": {},
        "missing_values": {},
        "duplicates": {},
        "invalid_entries": {}
    }

    # ── 1. Missing Values ──────────────────────────────────────────────────────
    missing = {}
    for name, df in [("employees", employees), ("sales", sales), ("targets", targets)]:
        null_counts = df.isnull().sum()
        null_dict   = null_counts[null_counts > 0].to_dict()
        missing[name] = {
            "total_missing": int(null_counts.sum()),
            "by_column": {k: int(v) for k, v in null_dict.items()}
        }
    report["missing_values"] = missing
    total_missing = sum(v["total_missing"] for v in missing.values())

    # ── 2. Duplicate Rows ─────────────────────────────────────────────────────
    dups = {}
    for name, df in [("employees", employees), ("sales", sales), ("targets", targets)]:
        dup_count = df.duplicated().sum()
        dups[name] = int(dup_count)
        if dup_count > 0:
            dup_rows = df[df.duplicated(keep=False)].to_dict(orient="records")
            # Limit to first 10 for readability
            dups[f"{name}_sample"] = dup_rows[:10]
    report["duplicates"] = dups
    total_dups = sum(v for k, v in dups.items() if not k.endswith("_sample"))

    # ── 3. Invalid Entries ────────────────────────────────────────────────────
    invalid = {}

    # Negative sales
    neg_sales = sales[sales["sales"] < 0].dropna()
    invalid["negative_sales"] = {
        "count": len(neg_sales),
        "rows": neg_sales.to_dict(orient="records")
    }

    # Invalid regions
    bad_regions = employees[~employees["region"].isin(VALID_REGIONS)]
    invalid["invalid_regions"] = {
        "count": len(bad_regions),
        "rows": bad_regions.to_dict(orient="records")
    }

    # Invalid roles
    bad_roles = employees[~employees["role"].isin(VALID_ROLES)]
    invalid["invalid_roles"] = {
        "count": len(bad_roles),
        "rows": bad_roles.to_dict(orient="records")
    }

    # Invalid months
    bad_months_s = sales[~sales["month"].isin(VALID_MONTHS)]
    invalid["invalid_months_sales"] = {
        "count": len(bad_months_s),
        "rows": bad_months_s.to_dict(orient="records")
    }

    report["invalid_entries"] = invalid
    total_invalid = sum(v["count"] for v in invalid.values())

    # ── Summary ───────────────────────────────────────────────────────────────
    report["summary"] = {
        "total_missing_values": total_missing,
        "total_duplicate_rows": total_dups,
        "total_invalid_entries": total_invalid,
        "overall_status": "ISSUES FOUND" if (total_missing + total_dups + total_invalid) > 0 else "CLEAN"
    }

    # ── Save ──────────────────────────────────────────────────────────────────
    out_path = os.path.join(OUT_DIR, "validation_report.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"   [OK] Validation complete -> {out_path}")
    print(f"   [!]  Missing values  : {total_missing}")
    print(f"   [!]  Duplicate rows  : {total_dups}")
    print(f"   [!]  Invalid entries : {total_invalid}")
    return report


if __name__ == "__main__":
    validate()
