import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
meta_path = ROOT / "data" / "processed" / "metadata.json"
df_cs_path = ROOT / "data" / "processed" / "country_sector.parquet"
df_emp_path = ROOT / "data" / "processed" / "employment.parquet"
df_sal_path = ROOT / "data" / "processed" / "salary.parquet"
df_lc_path = ROOT / "data" / "processed" / "living_cost.parquet"

with open(meta_path, "r", encoding="utf-8") as f:
    meta = json.load(f)

df_cs = pd.read_parquet(df_cs_path)
df_emp = pd.read_parquet(df_emp_path)
df_sal = pd.read_parquet(df_sal_path)
df_lc = pd.read_parquet(df_lc_path)

sectors = meta.get("sectors", [])
countries = meta.get("countries", [])
years = list(range(2010, 2025))

# 1. country_sector_matrix (5 sectors x 15 countries = 75 cells)
matrix = []
for c in countries:
    iso = c["iso3"]
    cname = c["name"]
    c_df = df_cs[df_cs["country_iso3"] == iso]
    for s in sectors:
        sid = s["id"]
        sname = s["name"]
        s_df = c_df[c_df["sector_id"] == sid]
        inds = int(s_df["indicator_id"].nunique())
        obs = int(len(s_df[s_df["indicator_value"].notna()]))
        # 2 indicators x 15 years = 30 expected observations per sector
        expected = 30
        pct = round((obs / expected) * 100.0, 1) if expected > 0 else 0.0
        matrix.append({
            "country_iso3": iso,
            "country_name": cname,
            "sector_id": sid,
            "sector_name": sname,
            "indicators": inds,
            "observations": obs,
            "expected": expected,
            "coverage_pct": min(100.0, pct),
        })

print(f"Generated country_sector_matrix: {len(matrix)} cells across {len(countries)} countries")

# 2. Update metadata coverage object
if "coverage" not in meta:
    meta["coverage"] = {}

meta["coverage"]["country_sector_matrix"] = matrix
meta["coverage"]["countries_count"] = len(countries)
meta["coverage"]["sectors_count"] = len(sectors)

with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

print("Updated metadata.json coverage matrix for all 15 countries.")
