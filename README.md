# Beyond Borders

> Global Employment Opportunities and Sector Development Intelligence

Beyond Borders is an intelligence platform comparing cross-border workforce dynamics, sector development, real wage trends, and econometric forecasting across major global economies.

---

## Architecture

- **Backend**: FastAPI with DuckDB querying parquet/CSV data stores, automated ARIMA/econometric forecasting pipeline.
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, Lucide icons, Apache ECharts (`echarts-for-react`), and TanStack Query.

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

## Features

- **Sector Intelligence**: Real-time cross-country comparison across critical emerging and established industrial sectors.
- **Employment & Salary Trends**: Macro employment distributions, ISCO skill-level aggregations, and local vs PPP wage parity calculations.
- **Living Cost Parity**: Inflation, CPI indexes, and household expenditure benchmarks.
- **Forecast Engine**: Autoregressive and trend extrapolation models predicting employment trajectories through 2030.
- **Export Capabilities**: Direct CSV and chart image exports for research citation.
