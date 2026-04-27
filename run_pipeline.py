"""
run_pipeline.py
────────────────
Master Pipeline — Sales Incentive & Data Validation System

Executes all pipeline stages in sequence:
  1. generate_data.py         → Creates synthetic CSVs with injected anomalies
  2. validate_data.py         → Data quality checks
  3. calculate_incentives.py  → Payout engine
  4. reconcile.py             → Expected vs actual payout comparison
  5. anomaly_detection.py     → Flags outliers and spikes

After running, open dashboard/index.html via a local server:
  python -m http.server 8080   (from the project root)
  → http://localhost:8080/dashboard/
"""

import sys
import os
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Add python/ to path so modules can be imported directly
PYTHON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "python")
sys.path.insert(0, PYTHON_DIR)

import generate_data
import validate_data
import calculate_incentives
import reconcile
import anomaly_detection


def banner(text):
    print("\n" + "═" * 55)
    print(f"  {text}")
    print("═" * 55)


def main():
    start = time.time()

    banner("[>>] Sales Incentive & Data Validation Pipeline")
    print("  Running all pipeline stages...\n")

    # Stage 1: Generate data
    banner("Stage 1/5 -- Data Generation")
    generate_data.generate()

    # Stage 2: Validate
    banner("Stage 2/5 -- Data Validation")
    validation = validate_data.validate()

    # Stage 3: Calculate incentives
    banner("Stage 3/5 -- Incentive Calculation")
    incentives = calculate_incentives.calculate()

    # Stage 4: Reconcile
    banner("Stage 4/5 -- Reconciliation")
    recon = reconcile.reconcile()

    # Stage 5: Anomaly detection
    banner("Stage 5/5 -- Anomaly Detection")
    anomalies = anomaly_detection.detect_anomalies()

    # ── Final Summary ──────────────────────────────────────────────────────────
    elapsed = round(time.time() - start, 2)
    banner("[OK] Pipeline Complete!")
    print(f"\n  Time: {elapsed}s")
    print(f"\n  KEY METRICS")
    print(f"     Total Employees   : {incentives['kpis']['total_employees']}")
    print(f"     Grand Payout      : ${incentives['kpis']['grand_total_payout']:>12,.2f}")
    print(f"     Avg Bonus %        : {incentives['kpis']['avg_bonus_pct']}%")
    print(f"     % Above Target    : {incentives['kpis']['pct_above_target']}%")
    print(f"\n  DATA QUALITY")
    print(f"     Missing Values    : {validation['summary']['total_missing_values']}")
    print(f"     Duplicate Rows    : {validation['summary']['total_duplicate_rows']}")
    print(f"     Invalid Entries   : {validation['summary']['total_invalid_entries']}")
    print(f"\n  RECONCILIATION")
    print(f"     Grand Variance    : ${recon['summary']['grand_variance']:>12,.2f}")
    print(f"     Overpaid          : {recon['summary']['overpaid_count']} employees")
    print(f"     Underpaid         : {recon['summary']['underpaid_count']} employees")
    print(f"\n  ANOMALIES")
    print(f"     Total Flagged     : {anomalies['summary']['total_anomalies']}")
    print(f"     HIGH severity     : {anomalies['summary']['severity_breakdown']['HIGH']}")
    print(f"\n  Output files saved to: output/")
    print(f"\n  To view dashboard:")
    print(f"    python -m http.server 8080")
    print(f"    Open: http://localhost:8080/dashboard/")
    print("=" * 55 + "\n")


if __name__ == "__main__":
    main()
