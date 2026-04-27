/**
 * app.js — Sales Incentive Dashboard
 * Loads JSON output from Python pipeline and renders all visualizations.
 *
 * DATA FLOW:
 *   output/incentives.json      → KPIs, charts, employee table
 *   output/reconciliation.json  → Reconciliation tab
 *   output/anomalies.json       → Anomaly tab
 *   output/validation_report.json → Validation tab
 *
 * NOTE: Because this loads local JSON files, run it via a local web server.
 *       Quick options:
 *         - Python:  python -m http.server 8080  (from project root)
 *         - Node:    npx serve .
 *       Then open: http://localhost:8080/dashboard/
 */

'use strict';

// ────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ────────────────────────────────────────────────────────────────────────────
// Works locally (served from project root) AND on Vercel (root = dashboard/)
const DATA_DIR = window.location.pathname.includes('/dashboard')
  ? '../output/'   // local: http://localhost:8080/dashboard/
  : 'output/';     // Vercel: root is dashboard folder, output/ copied beside it

let G = {
  incentives:   null,
  recon:        null,
  anomalies:    null,
  validation:   null,
  charts:       {},
  empTableData: [],
  anomalyData:  [],
  sortState:    { col: 6, asc: false },  // default: sort by payout desc
};

// ────────────────────────────────────────────────────────────────────────────
// CHART.JS DEFAULTS
// ────────────────────────────────────────────────────────────────────────────
Chart.defaults.color         = '#8496c0';
Chart.defaults.borderColor   = 'rgba(99,130,200,0.10)';
Chart.defaults.font.family   = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size     = 12;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#131d35';
Chart.defaults.plugins.tooltip.borderColor     = 'rgba(99,130,200,0.3)';
Chart.defaults.plugins.tooltip.borderWidth     = 1;
Chart.defaults.plugins.tooltip.titleColor      = '#e8eeff';
Chart.defaults.plugins.tooltip.bodyColor       = '#8496c0';
Chart.defaults.plugins.tooltip.padding         = 12;
Chart.defaults.plugins.tooltip.cornerRadius    = 10;

// Colour palette
const COLORS = {
  blue:   '#4f8ef7',
  purple: '#9b6cf7',
  green:  '#34d399',
  teal:   '#22d3ee',
  red:    '#f87171',
  orange: '#fb923c',
  yellow: '#fbbf24',
  blueA:  'rgba(79,142,247,0.18)',
  purpleA:'rgba(155,108,247,0.18)',
  greenA: 'rgba(52,211,153,0.18)',
};

const REGION_COLORS  = { North: COLORS.blue, South: COLORS.green, East: COLORS.purple, West: COLORS.orange };
const ROLE_COLORS    = { SDR: COLORS.teal, AE: COLORS.blue, Manager: COLORS.purple };

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────
const fmt$ = v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtK = v => {
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1)     + 'K';
  return fmt$(v);
};
const fmtPct = v => Number(v).toFixed(1) + '%';
const pill   = (text, cls) => `<span class="pill pill--${cls.toLowerCase()}">${text}</span>`;

/** Animated counter for KPI values */
function animateCounter(el, target, formatter, duration = 900) {
  const start   = performance.now();
  const initial = 0;
  function step(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    const val      = initial + (target - initial) * ease;
    el.textContent = formatter(val);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ────────────────────────────────────────────────────────────────────────────
async function loadJSON(filename) {
  const res = await fetch(DATA_DIR + filename);
  if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.statusText}`);
  return res.json();
}

async function loadAllData() {
  try {
    const [incentives, recon, anomalies, validation] = await Promise.all([
      loadJSON('incentives.json'),
      loadJSON('reconciliation.json'),
      loadJSON('anomalies.json'),
      loadJSON('validation_report.json'),
    ]);
    G.incentives  = incentives;
    G.recon       = recon;
    G.anomalies   = anomalies;
    G.validation  = validation;
    renderAll();
  } catch (err) {
    renderError(err);
  }
}

function renderError(err) {
  document.getElementById('pipeline-status').textContent = '● Pipeline not run';
  document.getElementById('pipeline-status').style.background = 'rgba(248,113,113,0.12)';
  document.getElementById('pipeline-status').style.color      = '#f87171';
  document.getElementById('pipeline-status').style.borderColor= 'rgba(248,113,113,0.3)';

  // Render embedded demo data so dashboard still looks good
  injectDemoData();
  renderAll();
}

// ────────────────────────────────────────────────────────────────────────────
// DEMO DATA — used when JSON files don't exist yet (pre-pipeline run)
// ────────────────────────────────────────────────────────────────────────────
function injectDemoData() {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const regions = ["North","South","East","West"];
  const roles   = ["SDR","AE","Manager"];
  const names   = ["Aarav","Priya","Rohit","Sneha","Vikram","Ananya","Karan","Divya","Arjun","Pooja",
                    "Amit","Nisha","Raj","Sonal","Dev","Tara","Nikhil","Meera","Suresh","Kavya",
                    "Harish","Riya","Sanjay","Aisha","Ravi","Neha","Manish","Simran","Ajay","Komal"];

  // Generate employees
  const rnd = x => Math.floor(Math.random() * x);
  const by_employee = names.map((name, i) => {
    const role   = roles[rnd(3)];
    const region = regions[rnd(4)];
    const base   = role === 'Manager' ? 700000 : role === 'AE' ? 400000 : 200000;
    const sales  = base + rnd(200000);
    const target = base * 0.95 + rnd(100000);
    const payout = sales * (sales > target ? 0.10 : 0.05);
    return { emp_id: `E${String(i+1).padStart(3,'0')}`, name, region, role,
             total_sales: sales, total_target: target, total_payout: payout,
             avg_bonus_pct: sales > target ? 10 : 5,
             months_above: 5 + rnd(7) };
  });

  // Sort by payout desc
  by_employee.sort((a,b) => b.total_payout - a.total_payout);

  const by_region = regions.map(region => {
    const emps = by_employee.filter(e => e.region === region);
    return { region, headcount: emps.length,
             total_sales:  emps.reduce((s,e)=>s+e.total_sales,0),
             total_payout: emps.reduce((s,e)=>s+e.total_payout,0) };
  });

  const by_month = months.map(month => ({
    month, monthly_sales: 1_500_000 + rnd(500_000),
    monthly_payout: 120_000 + rnd(80_000), employees_paid: 28 + rnd(2)
  }));
  // Inject spike in Sep for E005
  by_month[8].monthly_payout *= 1.6;

  const by_role = roles.map(role => {
    const emps = by_employee.filter(e => e.role === role);
    return { role, headcount: emps.length,
             total_payout: emps.reduce((s,e)=>s+e.total_payout,0),
             avg_bonus_pct: 7.2 };
  });

  const grand_payout = by_employee.reduce((s,e) => s+e.total_payout, 0);

  G.incentives = {
    kpis: {
      grand_total_payout: Math.round(grand_payout),
      grand_total_sales:  Math.round(by_employee.reduce((s,e)=>s+e.total_sales,0)),
      avg_bonus_pct: 7.4, pct_above_target: 63.2, total_employees: 30, months_analyzed: 12
    },
    by_employee, by_region, by_month, by_role,
    detail_records: []
  };

  // Reconciliation demo
  const recon_emps = by_employee.map(e => ({
    ...e,
    total_actual_payout:   Math.round(e.total_payout),
    total_expected_payout: Math.round(e.total_target * 0.05),
    total_variance:        Math.round(e.total_payout - e.total_target * 0.05),
    variance_pct:          (((e.total_payout - e.total_target * 0.05) / (e.total_target * 0.05)) * 100).toFixed(1),
    status:                e.total_payout > e.total_target * 0.05 ? 'OVERPAID' : 'UNDERPAID',
  }));

  G.recon = {
    summary: {
      grand_actual_payout:   Math.round(grand_payout),
      grand_expected_payout: Math.round(by_employee.reduce((s,e)=>s+e.total_target*0.05,0)),
      grand_variance:        Math.round(grand_payout - by_employee.reduce((s,e)=>s+e.total_target*0.05,0)),
      overpaid_count: 18, underpaid_count: 12, exact_count: 0
    },
    by_employee: recon_emps,
    by_month: by_month.map(m => ({
      month: m.month,
      total_actual:   m.monthly_payout,
      total_expected: m.monthly_payout * 0.82,
      total_variance: m.monthly_payout * 0.18,
    }))
  };

  // Anomalies demo
  G.anomalies = {
    summary: { total_anomalies: 9, payout_outliers: 3, mom_spikes: 3, missing_values: 3, negative_sales: 1,
                severity_breakdown: { HIGH: 4, MEDIUM: 3, LOW: 3 } },
    anomalies: [
      { emp_id:'E005', name:'Vikram',  region:'North', role:'AE',      month:'Sep', sales: 245000, target:65000, payout:24500,  anomaly_type:'PAYOUT_OUTLIER', anomaly_detail:'Z-score = 4.31 (threshold ±2.5)', severity:'HIGH' },
      { emp_id:'E005', name:'Vikram',  region:'North', role:'AE',      month:'Sep', sales: 245000, target:65000, payout:24500,  anomaly_type:'MOM_SPIKE',      anomaly_detail:'Month-over-Month jump = +312.4% (threshold +150%)', severity:'MEDIUM' },
      { emp_id:'E017', name:'Nikhil',  region:'East',  role:'Manager', month:'Nov', sales: 420000, target:95000, payout:42000,  anomaly_type:'PAYOUT_OUTLIER', anomaly_detail:'Z-score = 3.12 (threshold ±2.5)', severity:'HIGH' },
      { emp_id:'E022', name:'Riya',    region:'South', role:'SDR',     month:'Aug', sales: 85000,  target:28000, payout:8500,   anomaly_type:'PAYOUT_OUTLIER', anomaly_detail:'Z-score = 2.89 (threshold ±2.5)', severity:'HIGH' },
      { emp_id:'E012', name:'Nisha',   region:'West',  role:'AE',      month:'Mar', sales: -5000,  target:50000, payout:0,      anomaly_type:'NEGATIVE_SALE',  anomaly_detail:'Invalid sales = $-5,000', severity:'HIGH' },
      { emp_id:'E008', name:'Divya',   region:'South', role:'SDR',     month:'Jun', sales: null,   target:25000, payout:0,      anomaly_type:'MISSING_VALUE',  anomaly_detail:'Sales value is NULL/missing', severity:'LOW' },
      { emp_id:'E014', name:'Sonal',   region:'East',  role:'AE',      month:'Oct', sales: null,   target:48000, payout:0,      anomaly_type:'MISSING_VALUE',  anomaly_detail:'Sales value is NULL/missing', severity:'LOW' },
      { emp_id:'E023', name:'Sanjay',  region:'North', role:'Manager', month:'Feb', sales: null,   target:90000, payout:0,      anomaly_type:'MISSING_VALUE',  anomaly_detail:'Sales value is NULL/missing', severity:'LOW' },
      { emp_id:'E009', name:'Arjun',   region:'West',  role:'AE',      month:'May', sales: 130000, target:55000, payout:13000,  anomaly_type:'MOM_SPIKE',      anomaly_detail:'Month-over-Month jump = +178.2% (threshold +150%)', severity:'MEDIUM' },
    ]
  };

  // Validation demo
  G.validation = {
    summary: { total_missing_values: 3, total_duplicate_rows: 2, total_invalid_entries: 1, overall_status: 'ISSUES FOUND' },
    missing_values: {
      sales: { total_missing: 3, by_column: { sales: 3 } },
      employees:  { total_missing: 0, by_column: {} },
      targets:    { total_missing: 0, by_column: {} },
    },
    duplicates: { employees: 0, sales: 2, targets: 0 },
    invalid_entries: {
      negative_sales: { count: 1, rows: [{ emp_id:'E012', month:'Mar', sales:-5000 }] },
      invalid_regions:{ count: 0, rows: [] },
      invalid_roles:  { count: 0, rows: [] },
      invalid_months_sales: { count: 0, rows: [] },
    }
  };

  document.getElementById('pipeline-status').textContent = '● Demo Mode';
  document.getElementById('last-updated').textContent   = 'Run pipeline for live data';
}

// ────────────────────────────────────────────────────────────────────────────
// RENDER ALL
// ────────────────────────────────────────────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderChartMonthlyTrend();
  renderChartRoleDist();
  renderChartRegionPayout();
  renderChartTopPerformers();
  renderEmployeeTable();
  renderRoleCards();
  renderReconciliation();
  renderAnomalies();
  renderValidation();
  // Update anomaly badge
  document.getElementById('anomaly-tab-count').textContent =
    G.anomalies?.summary?.total_anomalies ?? '–';
}

// ────────────────────────────────────────────────────────────────────────────
// KPI CARDS
// ────────────────────────────────────────────────────────────────────────────
function renderKPIs() {
  const k = G.incentives.kpis;
  const r = G.recon?.summary;

  animateCounter(
    document.getElementById('kpi-val-payout'),
    k.grand_total_payout,
    v => fmtK(v),
  );

  document.getElementById('kpi-val-bonus').textContent     = fmtPct(k.avg_bonus_pct);
  document.getElementById('kpi-val-target').textContent    = fmtPct(k.pct_above_target);
  document.getElementById('kpi-val-employees').textContent = k.total_employees;

  const anomCount = G.anomalies?.summary?.total_anomalies ?? 0;
  document.getElementById('kpi-val-anomalies').textContent = anomCount;

  if (r) {
    const varEl = document.getElementById('kpi-val-variance');
    varEl.textContent  = (r.grand_variance >= 0 ? '+' : '') + fmtK(r.grand_variance);
    varEl.className    = 'kpi-value ' + (r.grand_variance >= 0 ? 'num-positive' : 'num-negative');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CHART: Monthly Trend
// ────────────────────────────────────────────────────────────────────────────
function renderChartMonthlyTrend() {
  const data   = G.incentives.by_month;
  const labels = data.map(d => d.month);
  const payouts = data.map(d => d.monthly_payout);
  const sales   = data.map(d => d.monthly_sales);

  if (G.charts.monthly) G.charts.monthly.destroy();

  G.charts.monthly = new Chart(
    document.getElementById('chart-monthly-trend').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Payout ($)',
            data: payouts,
            borderColor: COLORS.blue,
            backgroundColor: COLORS.blueA,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: COLORS.blue,
            pointRadius: 4,
            pointHoverRadius: 7,
          },
          {
            label: 'Sales ($)',
            data: sales,
            borderColor: COLORS.purple,
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            borderDash: [6, 3],
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(99,130,200,0.07)' } },
          y: {
            grid: { color: 'rgba(99,130,200,0.07)' },
            ticks: { callback: v => fmtK(v) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.raw)}`
            }
          }
        },
        animation: { duration: 900 },
      }
    }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CHART: Role Distribution Doughnut
// ────────────────────────────────────────────────────────────────────────────
function renderChartRoleDist() {
  const data = G.incentives.by_role;

  if (G.charts.roleDist) G.charts.roleDist.destroy();

  G.charts.roleDist = new Chart(
    document.getElementById('chart-role-dist').getContext('2d'),
    {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.role),
        datasets: [{
          data: data.map(d => d.headcount),
          backgroundColor: data.map(d => ROLE_COLORS[d.role] ?? COLORS.blue),
          borderColor: '#131d35',
          borderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { padding: 14, usePointStyle: true, pointStyle: 'circle' }
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} employees` }
          }
        },
        animation: { duration: 800, animateRotate: true },
      }
    }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CHART: Region Payout Bar
// ────────────────────────────────────────────────────────────────────────────
function renderChartRegionPayout() {
  const data = G.incentives.by_region;

  if (G.charts.region) G.charts.region.destroy();

  G.charts.region = new Chart(
    document.getElementById('chart-region-payout').getContext('2d'),
    {
      type: 'bar',
      data: {
        labels: data.map(d => d.region),
        datasets: [{
          label: 'Total Payout',
          data: data.map(d => d.total_payout),
          backgroundColor: data.map(d => REGION_COLORS[d.region] ?? COLORS.blue),
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(99,130,200,0.07)' },
            ticks: { callback: v => fmtK(v) },
          }
        },
        plugins: {
          tooltip: { callbacks: { label: ctx => ` ${fmt$(ctx.raw)}` } }
        },
        animation: { duration: 700 },
      }
    }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CHART: Top 10 Performers Horizontal Bar
// ────────────────────────────────────────────────────────────────────────────
function renderChartTopPerformers() {
  const top10 = G.incentives.by_employee.slice(0, 10).reverse(); // reverse for horizontal read

  if (G.charts.top) G.charts.top.destroy();

  G.charts.top = new Chart(
    document.getElementById('chart-top-performers').getContext('2d'),
    {
      type: 'bar',
      data: {
        labels: top10.map(d => d.name),
        datasets: [
          {
            label: 'Payout',
            data: top10.map(d => d.total_payout),
            backgroundColor: top10.map((d, i) =>
              i === top10.length - 1 ? COLORS.green : COLORS.blueA
            ),
            borderColor: top10.map((d, i) =>
              i === top10.length - 1 ? COLORS.green : COLORS.blue
            ),
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(99,130,200,0.07)' },
            ticks: { callback: v => fmtK(v) },
          },
          y: { grid: { display: false } }
        },
        plugins: {
          tooltip: { callbacks: { label: ctx => ` ${fmt$(ctx.raw)}` } }
        },
        animation: { duration: 800 },
      }
    }
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EMPLOYEE TABLE
// ────────────────────────────────────────────────────────────────────────────
function renderEmployeeTable() {
  G.empTableData = G.incentives.by_employee.map(e => ({
    ...e,
    regionCls: e.region?.toLowerCase() || 'north',
    roleCls:   e.role?.toLowerCase()   || 'sdr',
  }));
  drawEmpTable(G.empTableData);
}

function drawEmpTable(data) {
  const tbody = document.getElementById('emp-table-body');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">No records</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${e.emp_id}</td>
      <td>${e.name}</td>
      <td>${pill(e.region, e.regionCls)}</td>
      <td>${pill(e.role, e.roleCls)}</td>
      <td>${fmt$(e.total_sales)}</td>
      <td>${fmt$(e.total_target)}</td>
      <td style="font-weight:600;color:var(--accent-blue)">${fmt$(e.total_payout)}</td>
      <td class="${e.avg_bonus_pct >= 10 ? 'bonus-10' : 'bonus-5'}">${e.avg_bonus_pct}%</td>
      <td>${e.months_above ?? '–'}/12</td>
    </tr>
  `).join('');
}

function filterTable() {
  const q = document.getElementById('emp-search').value.toLowerCase();
  const filtered = G.empTableData.filter(e =>
    e.name?.toLowerCase().includes(q)    ||
    e.region?.toLowerCase().includes(q)  ||
    e.role?.toLowerCase().includes(q)    ||
    e.emp_id?.toLowerCase().includes(q)
  );
  drawEmpTable(filtered);
}

let sortDir = {};
function sortTable(col) {
  sortDir[col] = !sortDir[col];
  G.empTableData.sort((a, b) => {
    const keys = ['emp_id','name','region','role','total_sales','total_target','total_payout','avg_bonus_pct'];
    const k = keys[col];
    const va = a[k], vb = b[k];
    if (typeof va === 'number') return sortDir[col] ? va - vb : vb - va;
    return sortDir[col] ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  drawEmpTable(G.empTableData);
}

// ────────────────────────────────────────────────────────────────────────────
// ROLE CARDS
// ────────────────────────────────────────────────────────────────────────────
function renderRoleCards() {
  const container = document.getElementById('role-cards-container');
  container.innerHTML = G.incentives.by_role.map(r => `
    <div class="role-card">
      <div class="role-card-title">${r.role}</div>
      <div class="role-stat">
        <span class="role-stat-label">Headcount</span>
        <span class="role-stat-value">${r.headcount}</span>
      </div>
      <div class="role-stat">
        <span class="role-stat-label">Total Payout</span>
        <span class="role-stat-value">${fmtK(r.total_payout)}</span>
      </div>
      <div class="role-stat">
        <span class="role-stat-label">Avg Bonus %</span>
        <span class="role-stat-value">${r.avg_bonus_pct}%</span>
      </div>
    </div>
  `).join('');
}

// ────────────────────────────────────────────────────────────────────────────
// RECONCILIATION TAB
// ────────────────────────────────────────────────────────────────────────────
function renderReconciliation() {
  if (!G.recon) return;
  const s = G.recon.summary;

  // KPI cards
  document.getElementById('recon-kpis').innerHTML = `
    <div class="recon-kpi">
      <div class="recon-kpi-label">Grand Actual Payout</div>
      <div class="recon-kpi-value" style="color:var(--accent-blue)">${fmtK(s.grand_actual_payout)}</div>
    </div>
    <div class="recon-kpi">
      <div class="recon-kpi-label">Grand Expected Payout</div>
      <div class="recon-kpi-value" style="color:var(--accent-purple)">${fmtK(s.grand_expected_payout)}</div>
    </div>
    <div class="recon-kpi">
      <div class="recon-kpi-label">Total Variance</div>
      <div class="recon-kpi-value ${s.grand_variance >= 0 ? 'num-positive' : 'num-negative'}">
        ${s.grand_variance >= 0 ? '+' : ''}${fmtK(s.grand_variance)}
      </div>
    </div>
    <div class="recon-kpi">
      <div class="recon-kpi-label">Overpaid / Underpaid</div>
      <div class="recon-kpi-value"><span style="color:var(--accent-green)">${s.overpaid_count}</span> / <span style="color:var(--accent-red)">${s.underpaid_count}</span></div>
    </div>
  `;

  // Monthly chart
  const mData = G.recon.by_month;
  if (G.charts.recon) G.charts.recon.destroy();
  G.charts.recon = new Chart(
    document.getElementById('chart-recon-monthly').getContext('2d'),
    {
      type: 'bar',
      data: {
        labels: mData.map(d => d.month),
        datasets: [
          {
            label: 'Actual Payout',
            data: mData.map(d => d.total_actual),
            backgroundColor: COLORS.blueA,
            borderColor: COLORS.blue,
            borderWidth: 1.5,
            borderRadius: 5,
            borderSkipped: false,
          },
          {
            label: 'Expected Payout',
            data: mData.map(d => d.total_expected),
            backgroundColor: 'rgba(155,108,247,0.15)',
            borderColor: COLORS.purple,
            borderWidth: 1.5,
            borderRadius: 5,
            borderSkipped: false,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(99,130,200,0.07)' }, ticks: { callback: v => fmtK(v) } }
        },
        plugins: {
          legend: { display: true, position: 'top',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.raw)}` } }
        }
      }
    }
  );

  // Reconciliation table
  const tbody = document.getElementById('recon-table-body');
  tbody.innerHTML = G.recon.by_employee.map(e => `
    <tr>
      <td>${e.emp_id}</td>
      <td>${e.name}</td>
      <td>${pill(e.region, (e.region??'north').toLowerCase())}</td>
      <td>${pill(e.role,   (e.role??'sdr').toLowerCase())}</td>
      <td style="color:var(--accent-blue);font-weight:600">${fmt$(e.total_actual_payout)}</td>
      <td style="color:var(--accent-purple)">${fmt$(e.total_expected_payout)}</td>
      <td class="${e.total_variance >= 0 ? 'num-positive' : 'num-negative'}">${e.total_variance >= 0 ? '+' : ''}${fmt$(e.total_variance)}</td>
      <td class="${e.variance_pct >= 0 ? 'num-positive' : 'num-negative'}">${e.variance_pct >= 0 ? '+' : ''}${e.variance_pct}%</td>
      <td>${pill(e.status, (e.status??'underpaid').toLowerCase())}</td>
    </tr>
  `).join('');
}

// ────────────────────────────────────────────────────────────────────────────
// ANOMALIES TAB
// ────────────────────────────────────────────────────────────────────────────
function renderAnomalies() {
  if (!G.anomalies) return;
  const s = G.anomalies.summary;
  G.anomalyData = G.anomalies.anomalies;

  document.getElementById('anomaly-summary-grid').innerHTML = `
    <div class="anomaly-stat">
      <div class="anomaly-stat-icon">🚨</div>
      <div class="anomaly-stat-label">Total Flagged</div>
      <div class="anomaly-stat-value" style="color:var(--accent-red)">${s.total_anomalies}</div>
    </div>
    <div class="anomaly-stat">
      <div class="anomaly-stat-icon">📊</div>
      <div class="anomaly-stat-label">Payout Outliers (Z-Score)</div>
      <div class="anomaly-stat-value" style="color:var(--accent-orange)">${s.payout_outliers}</div>
    </div>
    <div class="anomaly-stat">
      <div class="anomaly-stat-icon">📈</div>
      <div class="anomaly-stat-label">MoM Spikes</div>
      <div class="anomaly-stat-value" style="color:var(--accent-yellow)">${s.mom_spikes}</div>
    </div>
    <div class="anomaly-stat">
      <div class="anomaly-stat-icon">🔍</div>
      <div class="anomaly-stat-label">Data Quality Issues</div>
      <div class="anomaly-stat-value" style="color:var(--accent-teal)">${s.missing_values + s.negative_sales}</div>
    </div>
  `;

  drawAnomalyTable(G.anomalyData);
}

const TYPE_LABELS = {
  PAYOUT_OUTLIER: 'Payout Outlier',
  MOM_SPIKE:      'MoM Spike',
  MISSING_VALUE:  'Missing Value',
  NEGATIVE_SALE:  'Negative Sale',
};

function drawAnomalyTable(data) {
  const tbody = document.getElementById('anomaly-table-body');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted)">No anomalies found</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${pill(a.severity ?? '–', (a.severity ?? 'low').toLowerCase())}</td>
      <td style="color:var(--text-primary);font-family:var(--font-sans)">${TYPE_LABELS[a.anomaly_type] ?? a.anomaly_type ?? '–'}</td>
      <td>${a.emp_id ?? '–'}</td>
      <td>${a.name ?? '–'}</td>
      <td>${a.region ? pill(a.region, a.region.toLowerCase()) : '–'}</td>
      <td>${a.role ? pill(a.role, a.role.toLowerCase()) : '–'}</td>
      <td>${a.month ?? '–'}</td>
      <td class="${(a.sales ?? 0) < 0 ? 'num-negative' : ''}">${a.sales != null ? fmt$(a.sales) : '—'}</td>
      <td>${a.payout != null ? fmt$(a.payout) : '—'}</td>
      <td style="color:var(--text-muted);font-size:11px;font-family:var(--font-sans);white-space:normal;max-width:260px">${a.anomaly_detail ?? ''}</td>
    </tr>
  `).join('');
}

let currentFilter = 'ALL';
function filterAnomalies(severity) {
  currentFilter = severity;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${severity.toLowerCase()}`).classList.add('active');

  const filtered = severity === 'ALL'
    ? G.anomalyData
    : G.anomalyData.filter(a => a.severity === severity);
  drawAnomalyTable(filtered);
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION TAB
// ────────────────────────────────────────────────────────────────────────────
function renderValidation() {
  if (!G.validation) return;
  const v = G.validation;
  const s = v.summary;

  let html = `
    <div class="validation-grid">
      <div class="val-card">
        <div class="val-card-title">
          <span>${s.total_missing_values > 0 ? '⚠️' : '✅'}</span>
          Missing Values
        </div>
        ${Object.entries(v.missing_values).map(([table, info]) => `
          <div class="val-row">
            <span class="val-row-label">${table}.csv</span>
            <span class="val-row-count ${info.total_missing > 0 ? 'num-negative' : 'num-positive'}">${info.total_missing}</span>
          </div>
          ${info.total_missing > 0 ? `
            <div class="val-details">${
              Object.entries(info.by_column).map(([col, cnt]) =>
                `<span style="color:var(--accent-red)">${col}</span>: ${cnt} missing`
              ).join('<br>')
            }</div>
          ` : ''}
        `).join('')}
      </div>

      <div class="val-card">
        <div class="val-card-title">
          <span>${s.total_duplicate_rows > 0 ? '⚠️' : '✅'}</span>
          Duplicate Rows
        </div>
        ${['employees','sales','targets'].map(t => `
          <div class="val-row">
            <span class="val-row-label">${t}.csv</span>
            <span class="val-row-count ${(v.duplicates[t]??0) > 0 ? 'num-negative' : 'num-positive'}">${v.duplicates[t] ?? 0}</span>
          </div>
        `).join('')}
        ${s.total_duplicate_rows > 0 ? `
          <div class="val-details">
            ${s.total_duplicate_rows} duplicate record(s) removed before processing.<br>
            Duplicates are exact row copies (same emp_id + month).
          </div>
        ` : '<div class="val-details" style="color:var(--accent-green)">No duplicates detected ✓</div>'}
      </div>

      <div class="val-card">
        <div class="val-card-title">
          <span>${s.total_invalid_entries > 0 ? '🔴' : '✅'}</span>
          Invalid Entries
        </div>
        ${Object.entries(v.invalid_entries).map(([key, info]) => `
          <div class="val-row">
            <span class="val-row-label">${key.replace(/_/g,' ')}</span>
            <span class="val-row-count ${info.count > 0 ? 'num-negative' : 'num-positive'}">${info.count}</span>
          </div>
          ${info.count > 0 && info.rows?.length ? `
            <div class="val-details">${
              info.rows.slice(0, 5).map(r =>
                `emp: ${r.emp_id ?? '–'}  month: ${r.month ?? '–'}  value: <span style="color:var(--accent-red)">${r.sales ?? r.region ?? r.role ?? '–'}</span>`
              ).join('<br>')
            }</div>
          ` : ''}
        `).join('')}
      </div>
    </div>

    <div class="table-card">
      <div class="table-head">
        <h3>Validation Summary</h3>
        <span class="pill ${s.overall_status === 'CLEAN' ? 'pill--south' : 'pill--high'}">${s.overall_status}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Check</th><th>Dataset</th><th>Count</th><th>Action Taken</th></tr></thead>
          <tbody>
            <tr>
              <td>Missing Values</td><td>sales.csv</td>
              <td class="${s.total_missing_values>0?'num-negative':'num-positive'}">${s.total_missing_values}</td>
              <td style="font-family:var(--font-sans)">Rows excluded from incentive calculation</td>
            </tr>
            <tr>
              <td>Duplicate Rows</td><td>sales.csv</td>
              <td class="${s.total_duplicate_rows>0?'num-negative':'num-positive'}">${s.total_duplicate_rows}</td>
              <td style="font-family:var(--font-sans)">Duplicates dropped (keep first occurrence)</td>
            </tr>
            <tr>
              <td>Negative Sales</td><td>sales.csv</td>
              <td class="${(v.invalid_entries.negative_sales?.count??0)>0?'num-negative':'num-positive'}">${v.invalid_entries.negative_sales?.count ?? 0}</td>
              <td style="font-family:var(--font-sans)">Flagged as anomaly, excluded from payout</td>
            </tr>
            <tr>
              <td>Invalid Regions</td><td>employees.csv</td>
              <td class="${(v.invalid_entries.invalid_regions?.count??0)>0?'num-negative':'num-positive'}">${v.invalid_entries.invalid_regions?.count ?? 0}</td>
              <td style="font-family:var(--font-sans)">Checked against: North/South/East/West</td>
            </tr>
            <tr>
              <td>Invalid Roles</td><td>employees.csv</td>
              <td class="${(v.invalid_entries.invalid_roles?.count??0)>0?'num-negative':'num-positive'}">${v.invalid_entries.invalid_roles?.count ?? 0}</td>
              <td style="font-family:var(--font-sans)">Checked against: SDR/AE/Manager</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('validation-content').innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────────
// TAB SWITCHING
// ────────────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.getElementById(`panel-${name}`).classList.add('active');
}

// ────────────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('last-updated').textContent =
    new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  loadAllData();
});
