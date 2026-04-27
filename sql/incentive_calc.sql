-- ============================================================
-- incentive_calc.sql
-- Calculates bonus percentage and payout per employee per month
-- Run against: SQLite database populated by run_pipeline.py
-- ============================================================

-- ── View: Full incentive calculation ─────────────────────────────────────────
-- Joins sales + targets to derive bonus_pct and payout
CREATE VIEW IF NOT EXISTS v_incentive_calc AS
SELECT
    e.emp_id,
    e.name,
    e.region,
    e.role,
    s.month,
    s.sales,
    t.target,
    CASE
        WHEN s.sales > t.target THEN 10.0
        ELSE 5.0
    END                                          AS bonus_pct,
    ROUND(
        s.sales * (CASE WHEN s.sales > t.target THEN 0.10 ELSE 0.05 END),
        2
    )                                            AS payout
FROM sales   s
JOIN targets t ON s.emp_id = t.emp_id AND s.month = t.month
JOIN employees e ON s.emp_id = e.emp_id
WHERE s.sales IS NOT NULL
  AND s.sales >= 0;   -- exclude invalid negatives


-- ── Query 1: Total payout per employee (annual) ───────────────────────────────
SELECT
    emp_id,
    name,
    role,
    region,
    SUM(sales)   AS total_sales,
    SUM(target)  AS total_target,
    ROUND(SUM(payout), 2)  AS total_payout,
    ROUND(AVG(bonus_pct), 1) AS avg_bonus_pct
FROM v_incentive_calc
GROUP BY emp_id
ORDER BY total_payout DESC;


-- ── Query 2: Region-wise payout summary ──────────────────────────────────────
SELECT
    region,
    COUNT(DISTINCT emp_id)    AS headcount,
    ROUND(SUM(sales),  2)     AS total_sales,
    ROUND(SUM(target), 2)     AS total_target,
    ROUND(SUM(payout), 2)     AS total_payout,
    ROUND(AVG(bonus_pct), 1)  AS avg_bonus_pct
FROM v_incentive_calc
GROUP BY region
ORDER BY total_payout DESC;


-- ── Query 3: Month-over-month payout trend ────────────────────────────────────
SELECT
    month,
    ROUND(SUM(payout), 2)  AS monthly_payout,
    COUNT(*)               AS employees_paid
FROM v_incentive_calc
GROUP BY month
ORDER BY CASE month
    WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3
    WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6
    WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9
    WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
END;


-- ── Query 4: Top 10 performers by total payout ───────────────────────────────
SELECT
    emp_id, name, role, region,
    ROUND(SUM(payout), 2) AS total_payout
FROM v_incentive_calc
GROUP BY emp_id
ORDER BY total_payout DESC
LIMIT 10;
