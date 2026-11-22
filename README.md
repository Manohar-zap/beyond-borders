# Beyond Borders

> Global Employment Opportunities and Sector Development Intelligence

Beyond Borders is an intelligence platform comparing cross-border workforce dynamics, sector development, real wage trends, and econometric forecasting across major global economies. This research-grade dashboard supports up to 100 countries and 12 sectors while maintaining full functionality with the current 6-country/5-sector implementation.

Data sources: World Bank WDI & ILOSTAT. Visualization: Apache ECharts. Storage: DuckDB + Parquet.

---

## Architecture

- **Backend**: FastAPI with DuckDB querying parquet/CSV data stores. Datasets: country_sector, employment, salary, living_cost, country_context, forecast, industrial_projects.
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, Lucide icons, Apache ECharts (`echarts-for-react`), and TanStack Query.
- **Statistical Python**: statsmodels for ETS damped trend, holdout backtesting, rolling-origin cross-validation.
- **Visualization**: Apache ECharts with custom theme (dark mode, country/ sector color palettes).
- **Export**: CSV and PNG export for all charts and data tables.

---

## Getting Started

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API documentation will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or port 3001 if port 3000 is occupied) in your browser.

---

## API Endpoints

### Sector Registry

- `GET /api/sectors/registry` — Sector definitions with documented proxy indicators and limitations.
- `GET /api/sectors/indicators` — Indicator coverage from the country_sector processed table.
- `GET /api/sectors series` — Country-sector indicator series with filtering.

### Forecast

- `GET /api/forecast/summary` — Forecast row counts by dataset and validation status.
- `GET /api/forecast/validation` — Holdout validation metrics (MAPE, RMSE) per series.
- `GET /api/forecast/availability` — Series availability by dataset, country, and status.
- `GET /api/forecast/outlook` — Observed history + baseline forecast + 80% interval per series.

### Quality

- `GET /api/quality/summary` — Row counts, column counts, null counts per dataset.
- `GET /api/quality/coverage` — Coverage matrices from metadata.
- `GET /api/quality/missing` — Known gaps and their treatment.
- `GET /api/quality/schema` — Physical schema of processed datasets.
- `GET /api/quality/lineage` — Dataset lineage from source to processed file.

### Metadata

- `GET /api/meta` — Full project metadata including countries, sectors, occupations, degree mapping, and dataset status.

### Salary

- `GET /api/salary/series` — Nominal / real (2010 CPI) / PPP-adjusted monthly earnings.
- `GET /api/salary/latest` — Latest salary observation per country/occupation.

### Living Cost

- `GET /api/living_cost/latest` — Latest living cost observations by category.
- `GET /api/living_cost/series` — Time series by expense category.

### Industrial Projects

- `GET /api/industrial/projects` — Industrial project data structure (template).

---

## Features

- **Sector Intelligence**: 5 sector definitions with direct and proxy indicators, explicit limitations, and official industry codes. Registry endpoint serves documented proxy indicators without zero-filling or fabrication.
- **Employment & Salary Trends**: Macro employment distributions, ISCO skill-level aggregations, nominal/real/PPP wage parity. Real values deflated with World Bank CPI (2010=100); PPP values divide by private-consumption PPP conversion factor.
- **Living Cost Parity**: Inflation, CPI indexes, and household expenditure benchmarks across 5 categories (consumer_price_index, consumer_price_inflation, household_consumption_per_capita, ppp_gdp, ppp_private_consumption). National-level only; city-level data unavailable.
- **Forecast Engine**: ETS damped additive trend (Holt) with OLS linear-trend fallback. Holdout validation of final 2–3 annual observations. Validation statuses: validated (MAPE ≤ 10%), moderate_error (MAPE 10–25%), high_error (MAPE > 25%). Rolling-origin cross-validation available via `scripts/forecast.py`. Forecasts stored separately from historical data — never merged.
- **Occupational Mapping**: ISCO-08 major group codes (1–9 + TOTAL). Degree-to-occupation mapping: less_than_high_school, high_school, some_college, bachelors, graduate.
- **Industrial Project Data**: Template structure for investment-to-employment experiment design. Currently empty (0 rows) — intended as a data entry template.
- **Export Capabilities**: Direct CSV and PNG export for all charts and data tables.
- **No Zero-Filling**: Missing data is retained as null with documented treatment. Proxies are explicitly flagged.
- **Forecast-Observation Separation**: Forecasts are stored in `forecast.parquet` and never merged into historical dataset parquet files.
- **100-Country / 12-Sector Architecture**: Designed to scale while supporting the current 6-country/5-sector implementation.

---

## Page Dashboard

| Page | Path |
|------|------|
| Global Filter Provider | `/` |
| Employment | `/employment` |
| Salary (nominal/real/PPP) | `/salary` |
| Sector Development | `/sectors` |
| Country Comparison | `/comparison` |
| Forecast & Outlook | `/forecast` |
| Data Quality & Methodology | `/methodology` |
| Living Cost | `/living-cost` |

---

## Data Quality Principles

- **No fabrication**: Missing values are kept as null, never replaced with zero or synthetic estimates.
- **Proxies documented**: Sector indicators are documented proxies with explicit limitations and source preferences.
- **Classification variants retained**: Canada ISIC Rev.3/ISCO-88 flags are preserved; silent harmonization is avoided.
- **Japan notes**: No occupation-level earnings series for Japan; shown as unavailable.
- **Forecasts separate**: Trend projections stored in distinct table; never overwrite observations.
- **Coverage transparent**: Coverage matrices computed from processed Parquet files; expected cells use 2010–2024 annual grid.

---

## Development

### Regenerating Data

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# Or run individual scripts:
python scripts/ingest.py
python scripts/forecast.py
```

### Adding a New Sector

1. Add a `SectorDefinition` entry to `backend/app/indicators/sector_registry.py` with direct/proxy indicators and `mapping_limitations`.
2. Register the sector in `metadata.json` under `coverage` if needed.
3. Add API routes in `backend/app/routers/sectors.py` if new endpoints are needed.

### Rolling-Origin Forecast Validation

```bash
python scripts/forecast.py  # generates baseline forecasts with holdout validation
# Rolling-origin evaluation is implemented in scripts/forecast.py via rolling_origin_validate()
# The function performs time-series cross-validation with expanding training windows.
```

---

## License

CC BY 4.0 (World Bank open data) + ILO open data (CC BY 4.0 unless otherwise stated).
