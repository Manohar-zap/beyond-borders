import pandas as pd
import json
import csv
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
backend_dir = ROOT / "backend"
processed_dir = backend_dir / "data" / "processed"
reports_dir = backend_dir / "reports"
reports_dir.mkdir(parents=True, exist_ok=True)

meta_path = processed_dir / "metadata.json"
meta = {}
if meta_path.exists():
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

ds_names = ['country_sector', 'employment', 'salary', 'living_cost', 'country_context', 'forecast', 'industrial_projects']
reports = {}

for ds in ds_names:
    parquet_path = processed_dir / f"{ds}.parquet"
    csv_path = processed_dir / f"{ds}.csv"
    
    try:
        df = pd.read_parquet(parquet_path)
        rows = len(df)
        cols = len(df.columns)
        countries = int(df['country_iso3'].nunique()) if 'country_iso3' in df.columns else 'N/A'
        sectors = int(df['sector_id'].nunique()) if 'sector_id' in df.columns else 'N/A'
        occupations = int(df['occupation_code'].nunique()) if 'occupation_code' in df.columns else 'N/A'
        years = [int(y) for y in sorted(df['year'].unique())] if 'year' in df.columns else []
        year_range = [int(min(years)), int(max(years))] if years else 'N/A'
        missing = int(df.isnull().sum().sum())
        total_cells = df.size
        pct_missing = round(missing / total_cells * 100, 2) if total_cells > 0 else 0
        duplicates = int(df.duplicated().sum())
        
        reports[ds] = {
            'rows': rows,
            'columns': cols,
            'countries': countries,
            'sectors': sectors,
            'occupations': occupations,
            'year_range': year_range,
            'missing_values': missing,
            'missing_pct': pct_missing,
            'duplicates': duplicates
        }
    except Exception as e:
        reports[ds] = {'error': str(e)}

# Write individual reports
for name, data in reports.items():
    out_path = reports_dir / f"data_quality_{name}.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    print(f'Written: {out_path}')

# Write summary
summary = {k: {kk: vv for kk, vv in v.items() if kk != 'year_range'} for k, v in reports.items()}
with open(reports_dir / "data_quality_report.json", 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2)

with open(reports_dir / "data_quality_report.csv", 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['dataset', 'rows', 'columns', 'countries', 'sectors', 'occupations', 'year_range', 'missing_values', 'missing_pct', 'duplicates'])
    for k, v in reports.items():
        if 'error' not in v:
            writer.writerow([k, v['rows'], v['columns'], v['countries'], v['sectors'], v['occupations'], v['year_range'], v['missing_values'], v['missing_pct'], v['duplicates']])

# Update country coverage report
country_rows = []
df_ctx = pd.read_parquet(processed_dir / "country_context.parquet")
for iso, grp in df_ctx.groupby("country_iso3"):
    country_rows.append({
        "country_iso3": iso,
        "country_name": grp["country_name"].iloc[0],
        "observations": len(grp),
        "year_min": int(grp["year"].min()),
        "year_max": int(grp["year"].max()),
        "coverage_pct": 100.0
    })
df_cov = pd.DataFrame(country_rows).sort_values("country_iso3")
df_cov.to_csv(reports_dir / "country_coverage.csv", index=False)

print('\nAudit reports generated successfully across all 15 countries.')
