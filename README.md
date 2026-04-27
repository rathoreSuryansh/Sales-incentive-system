# Sales Incentive & Data Validation System

> A full-stack portfolio project simulating a real-world **IC Operations / ERC / Data Analytics** workflow.

---

## 📁 Project Structure

```
sales-incentive-system/
├── data/                   ← Synthetic CSVs (auto-generated)
│   ├── employees.csv
│   ├── sales.csv
│   └── targets.csv
├── sql/                    ← SQL schema + analytical queries
│   ├── schema.sql
│   ├── incentive_calc.sql
│   └── reconciliation.sql
├── python/                 ← Python pipeline modules
│   ├── generate_data.py
│   ├── validate_data.py
│   ├── calculate_incentives.py
│   ├── reconcile.py
│   └── anomaly_detection.py
├── dashboard/              ← Interactive web dashboard
│   ├── index.html
│   ├── style.css
│   └── app.js
├── output/                 ← JSON outputs from pipeline (auto-created)
│   ├── incentives.json
│   ├── reconciliation.json
│   ├── anomalies.json
│   └── validation_report.json
├── run_pipeline.py         ← Master script
└── README.md
```

---

## ⚙️ Features

### ✅ Incentive Calculation
- **If sales > target → 10% bonus**, otherwise **5% bonus**
- Annual and monthly aggregations by employee, region, and role
- Pandas-based computation pipeline

### 🔍 Data Validation
- Detects **missing values** (NaN/null entries)
- Removes **duplicate rows** before processing
- Flags **invalid entries** (negative sales, unknown regions/roles)

### ⚖️ Reconciliation
- Compares **expected payout** (5% of target) vs **actual payout**
- Calculates variance per employee and per month
- Identifies overpaid and underpaid employees

### 🚨 Anomaly Detection
- **Z-score method**: flags payouts > 2.5 standard deviations from mean (per role)
- **Month-over-Month spike**: flags > 150% jump in payout vs prior month
- Severity-rated: HIGH / MEDIUM / LOW

### 📊 Interactive Dashboard
- Dark glassmorphism UI built with vanilla HTML/CSS/JS + Chart.js
- KPI cards, bar charts, line charts, doughnut chart
- Sortable + searchable employee table
- Reconciliation chart (expected vs actual)
- Anomaly table with severity filter
- Validation report with detail cards

---

## 🚀 How to Run

### Step 1: Install dependencies

```bash
pip install pandas numpy
```

### Step 2: Run the pipeline

```bash
cd sales-incentive-system
python run_pipeline.py
```

This generates all CSV and JSON files automatically.

### Step 3: View the dashboard

```bash
python -m http.server 8080
```

Then open: **http://localhost:8080/dashboard/**

> **Note:** The dashboard also works in "Demo Mode" without running the pipeline — it will load built-in sample data automatically.

---

## 🛠 Tools & Technologies

| Tool | Used For |
|------|----------|
| **Python (pandas, numpy)** | Data pipeline, incentive calculation, anomaly detection |
| **SQL (SQLite)** | Schema definition, JOIN-based incentive queries, aggregations |
| **HTML / CSS / JS** | Interactive dashboard |
| **Chart.js** | Data visualizations |

---

## 📋 Dataset

| File | Rows | Description |
|------|------|-------------|
| `employees.csv` | 30 | Employee ID, name, region (N/S/E/W), role (SDR/AE/Manager) |
| `sales.csv` | 362 | Monthly sales per employee (Jan–Dec), with injected anomalies |
| `targets.csv` | 360 | Monthly targets per employee, role-based ranges |

**Injected data quality issues (for demonstration):**
- 3 missing sales values (NaN)
- 2 duplicate rows
- 1 negative/invalid sales entry
- 1 extreme payout spike (3.5× normal range)

---

## 🗄 SQL Queries

The `sql/` directory contains:

- **`schema.sql`** — `CREATE TABLE` for employees, sales, targets, incentives
- **`incentive_calc.sql`** — Views + queries for incentive calculation with `CASE WHEN`, `GROUP BY`, `JOIN`
- **`reconciliation.sql`** — Expected vs actual payout comparison with variance calculation

---

*Built for IC Operations | ERC | Data Analytics portfolio demonstration.*
