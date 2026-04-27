-- ============================================================
-- reconciliation.sql
-- Compares expected payout (from targets) vs actual payout
-- Expected = what we'd pay if everyone hit exactly their target
-- Actual   = computed from real sales figures
-- ============================================================

-- ── Reconciliation View ───────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_reconciliation AS
SELECT
    e.emp_id,
    e.name,
    e.region,
    e.role,
    s.month,

    -- Actual values
    s.sales                                                      AS actual_sales,
    t.target                                                     AS target_sales,

    -- Actual payout (based on real sales)
    ROUND(
        s.sales * (CASE WHEN s.sales > t.target THEN 0.10 ELSE 0.05 END),
        2
    )                                                            AS actual_payout,

    -- Expected payout (if emp hit exactly the target → 5% baseline)
    ROUND(t.target * 0.05, 2)                                   AS expected_payout,

    -- Variance (positive = overpaid relative to base expectation)
    ROUND(
        s.sales * (CASE WHEN s.sales > t.target THEN 0.10 ELSE 0.05 END)
        - t.target * 0.05,
        2
    )                                                            AS variance

FROM sales     s
JOIN targets   t ON s.emp_id = t.emp_id AND s.month = t.month
JOIN employees e ON s.emp_id = e.emp_id
WHERE s.sales IS NOT NULL
  AND s.sales >= 0;


-- ── Query 1: Employee-level annual reconciliation ────────────────────────────
SELECT
    emp_id, name, role, region,
    ROUND(SUM(actual_payout),   2) AS total_actual_payout,
    ROUND(SUM(expected_payout), 2) AS total_expected_payout,
    ROUND(SUM(variance),        2) AS total_variance,
    ROUND(SUM(variance) / NULLIF(SUM(expected_payout), 0) * 100, 1) AS variance_pct
FROM v_reconciliation
GROUP BY emp_id
ORDER BY ABS(SUM(variance)) DESC;


-- ── Query 2: Monthly reconciliation summary ──────────────────────────────────
SELECT
    month,
    ROUND(SUM(actual_payout),   2) AS total_actual,
    ROUND(SUM(expected_payout), 2) AS total_expected,
    ROUND(SUM(variance),        2) AS total_variance
FROM v_reconciliation
GROUP BY month
ORDER BY CASE month
    WHEN 'Jan' THEN 1  WHEN 'Feb' THEN 2  WHEN 'Mar' THEN 3
    WHEN 'Apr' THEN 4  WHEN 'May' THEN 5  WHEN 'Jun' THEN 6
    WHEN 'Jul' THEN 7  WHEN 'Aug' THEN 8  WHEN 'Sep' THEN 9
    WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
END;
