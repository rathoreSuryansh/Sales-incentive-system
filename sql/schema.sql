-- ============================================================
-- schema.sql
-- Sales Incentive & Data Validation System — Table Definitions
-- ============================================================

-- Employee master table
CREATE TABLE IF NOT EXISTS employees (
    emp_id  TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    region  TEXT NOT NULL CHECK(region IN ('North','South','East','West')),
    role    TEXT NOT NULL CHECK(role IN ('SDR','AE','Manager'))
);

-- Monthly sales actuals
CREATE TABLE IF NOT EXISTS sales (
    sale_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id   TEXT    NOT NULL REFERENCES employees(emp_id),
    month    TEXT    NOT NULL,
    sales    REAL    CHECK(sales >= 0)   -- negative values = invalid
);

-- Monthly targets per employee
CREATE TABLE IF NOT EXISTS targets (
    target_id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id    TEXT    NOT NULL REFERENCES employees(emp_id),
    month     TEXT    NOT NULL,
    target    REAL    NOT NULL CHECK(target > 0)
);

-- Computed incentives (populated by the Python pipeline)
CREATE TABLE IF NOT EXISTS incentives (
    incentive_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id        TEXT  NOT NULL REFERENCES employees(emp_id),
    month         TEXT  NOT NULL,
    sales         REAL,
    target        REAL,
    bonus_pct     REAL,   -- 10.0 or 5.0
    payout        REAL    -- sales * bonus_pct / 100
);
