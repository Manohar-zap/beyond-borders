# Beyond Borders: Global Employment Opportunities & Quality-of-Life Predictor

> **Research-first • Reproducible • Evidence-based • Python**  
> **Historical data: 2010–2024 | Forecast horizon: 2025–2035 | Global country comparison**

---

## 🎯 Executive Overview
**Beyond Borders** is a research-grade econometric forecasting and decision-support platform designed to compare global labour markets and quality of life. The system synthesizes official multi-source data across 45 economies, computes multidimensional opportunity and sustainability scores, and estimates trajectory paths through 2035 with confidence intervals and macro scenarios.

### 🏛️ The Three Research Pillars
1. **Employment Opportunity Score (EOS)**: Labour demand, low youth and adult unemployment, high-skill employment share, productivity, tech occupational projections, and AI augmentation potential.
2. **Financial Sustainability Score (FSS)**: Real purchasing-power wages (USD PPP), statutory minimum wage, effective personal income taxes and employee social contributions, housing affordability, and household savings capacity.
3. **Quality of Life Score (QLS)**: Universal health metrics (life expectancy, physician density, out-of-pocket spending), intentional homicide rates, fine particulate air pollution (PM2.5), and subjective well-being (Cantril ladder).

---

## 📁 Repository Structure
```
r_pro/
├── README.md                           # Documentation & execution guide
├── requirements.txt                    # Pinned Python package dependencies
├── run_pipeline.py                     # One-command end-to-end execution pipeline
├── app.py                              # Interactive Streamlit dashboard
├── config/
│   ├── indicators.yml                  # 40 core indicators with metadata, units, polarities
│   ├── sources.yml                     # Source catalog (World Bank, ILO, OECD, WHO, etc.)
│   ├── country_crosswalk.csv           # 45 countries with ISO codes, regions, income groups
│   └── analysis_config.yml             # Window parameters, scoring weights, worker profiles
├── data/
│   ├── raw/                            # Immutable original downloads with checksums
│   ├── interim/                        # Cleaned source extractions
│   ├── processed/                      # master_panel_country_year and master_panel_long
│   └── reference/                      # Code lists, crosswalks, benchmark seed panel
├── reports/
│   ├── acquisition_manifest.csv        # Detailed provenance status and download records
│   ├── checksum_manifest.csv           # SHA-256 validation log
│   ├── schema_audit.csv                # Data types, null counts, min/max values
│   ├── dataset_inventory.csv           # Registered files and record volumes
│   ├── missingness_report.csv          # Country-indicator missingness analysis
│   └── coverage_report.csv             # Coverage percentages per economy
├── outputs/
│   ├── figures/                        # Scatter plots, trend paths, and radar charts
│   ├── tables/                         # Univariate, bivariate, momentum, and rankings tables
│   └── exports/                        # forecast_results.parquet & forecast_results.csv
├── src/
│   ├── acquisition/                    # Source adapters & download orchestrator
│   ├── ingestion/                      # Schema inspection and raw ingestion
│   ├── validation/                     # Natural key audits and boundary rules
│   ├── preprocessing/                  # Harmonizer, derived metrics, and panel builder
│   ├── analysis/                       # Univariate, bivariate, and momentum estimators
│   ├── scoring/                        # Normalizer, sub-indices, composite scorer, sensitivity
│   ├── forecasting/                    # Naive, Drift, ETS, ARIMA models & backtester
│   └── dashboard/                      # Plotly components and dashboard views
└── tests/                              # Automated unit tests with pytest
```

---

## 🚀 Quickstart Guide

### 1. Requirements & Setup (Windows / VS Code)
Using Python 3.10+ in PowerShell or Command Prompt:

```powershell
# In c:\Users\Asus\Downloads\r_pro
py -m pip install -r requirements.txt
```

### 2. Run the Full Analytical Pipeline
Executes acquisition, data audits, master panel construction, scoring, backtesting, and 2025–2035 forecasting:

```powershell
py run_pipeline.py
```

### 3. Launch the Executive Web Application
Opens the modern, responsive HTML5/Tailwind/Chart.js web portal:

```powershell
& 'C:\Users\Asus\AppData\Local\Programs\Python\Python310\python.exe' server.py
# Or simply run:
.\start_web.bat
```
Navigate to **`http://localhost:8000`** in any web browser.

### 4. Run the Test Suite
Execute automated unit tests:

```powershell
py -m pytest tests/ -v
```

---

## 🔬 Methodological Summary

### 1. Robust Normalization
All core indicators are normalized to a uniform $[0, 100]$ scale using robust min-max scaling with 1st and 99th percentile outlier capping. Negative indicators (such as unemployment, inflation, homicide, PM2.5, and tax wedge) are inverted such that higher scores consistently reflect better outcomes:
$$\text{Score}_{\text{inverted}} = 100 - \text{Score}_{\text{scaled}}$$

### 2. Equal Dimension Weighting
Indicators are aggregated within their respective dimension first, ensuring that dimensions with more indicators do not receive disproportionate weighting merely due to column count.

### 3. Worker-Profile Simulations
Net take-home income and savings capacity are computed for distinct worker archetypes:
* **Single Worker** (Baseline 100% average wage)
* **Early-Career** (75% wage multiplier)
* **Experienced** (125% wage multiplier)
* **Skilled Technical** (155% wage multiplier)
* **General Worker** (95% wage multiplier)

$$\text{Savings Capacity} = \text{Net Income} - \text{Estimated Housing} - \text{Essential Living Costs}$$

### 4. Rolling Backtesting
Econometric forecasting models (Naive, Drift, Holt's Damped ETS, and ARIMA) are evaluated on a holdout period (2021–2024) using symmetric Mean Absolute Percentage Error (sMAPE), MAE, and RMSE.
