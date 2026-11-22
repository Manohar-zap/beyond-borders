import pandas as pd
import json
import csv
import os

# Load metadata
meta_path = r'C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\metadata.json'
with open(meta_path, 'r') as f:
    meta = json.load(f)

# Ensure reports directory exists
os.makedirs(r'C:\Users\zapma\CODES\R programming\beyond-borders\backend\reports', exist_ok=True)

ds_names = ['country_sector', 'employment', 'salary', 'living_cost', 'country_context']
reports = {}

for ds in ds_names:
    parquet_path = fr'C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\{ds}.parquet'
    csv_path = fr'C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\{ds}.csv'
    
    try:
        df = pd.read_parquet(parquet_path)
        rows = len(df)
        cols = len(df.columns)
        countries = int(df['country_iso3'].nunique()) if 'country_iso3' in df.columns else 'N/A'
        sectors = int(df['sector_id'].nunique()) if 'sector_id' in df.columns else 'N/A'
        occupations = int(df['occupation_code'].nunique()) if 'occupation_code' in df.columns else 'N/A'
        years = sorted(df['year'].unique()) if 'year' in df.columns else []
        year_range = [min(years), max(years)] if years else 'N/A'
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
    out_path = fr'C:\Users\zapma\CODES\R programming\beyond-borders\backend\reports\data_quality_{name}.json'
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'Written: {out_path}')

# Write summary
summary = {k: {kk: vv for kk, vv in v.items() if kk != 'year_range'} for k, v in reports.items()}
with open(r'C:\Users\zapma\CODES\R programming\beyond-borders\backend\reports\data_quality_report.json', 'w') as f:
    json.dump(summary, f, indent=2)

with open(r'C:\Users\zapma\CODES\R programming\beyond-borders\backend\reports\data_quality_report.csv', 'w') as f:
    writer = csv.writer(f)
    writer.writerow(['dataset', 'rows', 'columns', 'countries', 'sectors', 'occupations', 'year_range', 'missing_values', 'missing_pct', 'duplicates'])
    for k, v in reports.items():
        if 'error' not in v:
            writer.writerow([k, v['rows'], v['columns'], v['countries'], v['sectors'], v['occupations'], v['year_range'], v['missing_values'], v['missing_pct'], v['duplicates']])

print('\nAudit reports generated successfully')