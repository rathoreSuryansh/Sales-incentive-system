# -*- coding: utf-8 -*-
"""
generate_data.py
-----------------
Generates synthetic CSV datasets for the Sales Incentive & Data Validation System.

Datasets:
  - employees.csv : Employee master (ID, name, region, role)
  - sales.csv     : Monthly sales per employee (Jan-Dec)
  - targets.csv   : Monthly targets per employee (role-based)

Intentionally injects data quality issues to demonstrate validation skills:
  - 3 missing sales values (NaN)
  - 2 duplicate rows
  - 1 invalid (negative) sales entry
"""

import pandas as pd
import numpy as np
import os
import sys

# Ensure stdout is UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

REGIONS = ["North", "South", "East", "West"]
ROLES   = ["SDR", "AE", "Manager"]
MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun",
           "Jul","Aug","Sep","Oct","Nov","Dec"]
N_EMP   = 30

TARGET_RANGES = {
    "SDR":     (20_000, 35_000),
    "AE":      (40_000, 70_000),
    "Manager": (80_000, 120_000),
}

FIRST_NAMES = [
    "Aarav","Priya","Rohit","Sneha","Vikram","Ananya","Karan","Divya",
    "Arjun","Pooja","Amit","Nisha","Raj","Sonal","Dev","Tara","Nikhil",
    "Meera","Suresh","Kavya","Harish","Riya","Sanjay","Aisha","Ravi",
    "Neha","Manish","Simran","Ajay","Komal"
]


def generate():
    np.random.seed(42)

    # 1. Employee Data
    employees = pd.DataFrame({
        "emp_id": [f"E{str(i+1).zfill(3)}" for i in range(N_EMP)],
        "name":   FIRST_NAMES,
        "region": np.random.choice(REGIONS, N_EMP),
        "role":   np.random.choice(ROLES,   N_EMP),
    })

    # 2. Target Data
    target_records = []
    for _, emp in employees.iterrows():
        lo, hi = TARGET_RANGES[emp["role"]]
        for month in MONTHS:
            target_records.append({
                "emp_id": emp["emp_id"],
                "month":  month,
                "target": int(np.random.uniform(lo, hi)),
            })
    targets = pd.DataFrame(target_records)

    # 3. Sales Data
    sales_records = []
    for _, emp in employees.iterrows():
        lo, hi = TARGET_RANGES[emp["role"]]
        for month in MONTHS:
            amount = int(np.random.uniform(lo * 0.8, hi * 1.3))
            sales_records.append({"emp_id": emp["emp_id"], "month": month, "sales": amount})
    sales = pd.DataFrame(sales_records)

    # Inject spike
    spike_idx = sales[(sales["emp_id"] == "E005") & (sales["month"] == "Sep")].index[0]
    sales.loc[spike_idx, "sales"] = TARGET_RANGES["AE"][1] * 3.5

    # Inject 3 missing values
    missing_indices = sales.sample(3, random_state=7).index
    sales.loc[missing_indices, "sales"] = np.nan

    # Inject 1 negative sale
    neg_idx = sales[(sales["emp_id"] == "E012") & (sales["month"] == "Mar")].index[0]
    sales.loc[neg_idx, "sales"] = -5000

    # Inject 2 duplicate rows
    dup_rows = sales[(sales["emp_id"] == "E001") & (sales["month"].isin(["Jan", "Feb"]))]
    sales = pd.concat([sales, dup_rows], ignore_index=True)

    # 4. Save to CSV
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    employees.to_csv(os.path.join(out_dir, "employees.csv"), index=False)
    targets.to_csv(os.path.join(out_dir,   "targets.csv"),   index=False)
    sales.to_csv(os.path.join(out_dir,     "sales.csv"),     index=False)

    print("[OK] Data generated successfully!")
    print(f"   employees.csv : {len(employees)} rows")
    print(f"   targets.csv   : {len(targets)} rows")
    print(f"   sales.csv     : {len(sales)} rows  (3 NaNs, 1 negative, 2 duplicates, 1 spike)")


if __name__ == "__main__":
    generate()
