from __future__ import annotations

from typing import Any

import pyarrow.parquet as pq
from fastapi import APIRouter

from ..common import envelope, records, require_dataset
from ..config import DATASETS, dataset_available, dataset_path, forecast_metadata, metadata
from ..db import get_connection

router = APIRouter(prefix="/api/quality", tags=["data quality"])

KEY_NULL_COLUMNS = {
    "country_sector": ["industrial_output", "output_growth", "investment_announced", "investment_realized", "capacity_addition"],
    "employment": ["vacancies", "vacancy_rate"],
    "salary": ["salary_median", "salary_real_2010", "salary_ppp_intl"],
    "living_cost": [],
    "country_context": [],
    "forecast": ["validation_mape", "validation_rmse"],
}


@router.get("/summary")
def summary() -> dict[str, Any]:
    stats: list[dict[str, Any]] = []
    with get_connection() as con:
        for name in DATASETS:
            if not dataset_available(name):
                stats.append({"dataset": name, "available": False, "rows": 0})
                continue
            rows = con.execute(f"SELECT count(*) AS n FROM {name}").fetchone()[0]
            entry: dict[str, Any] = {
                "dataset": name,
                "available": True,
                "rows": int(rows),
                "columns": int(len(pq.ParquetFile(dataset_path(name)).schema.names)),
                "file_bytes": dataset_path(name).stat().st_size,
                "null_counts": {},
            }
            for column in KEY_NULL_COLUMNS.get(name, []):
                try:
                    nulls = con.execute(
                        f'SELECT count(*) - count("{column}") FROM {name}'
                    ).fetchone()[0]
                    entry["null_counts"][column] = int(nulls)
                except Exception:
                    entry["null_counts"][column] = None
            stats.append(entry)

    meta = metadata()
    return envelope(
        stats,
        dataset="quality",
        source_note="Computed directly from the processed Parquet files at request time.",
        extra_meta={
            "missing_data": meta.get("missing_data", []),
            "sources": meta.get("sources", []),
            "generated_at": meta.get("generated_at"),
            "forecast_metadata": forecast_metadata(),
        },
    )


@router.get("/coverage")
def coverage() -> dict[str, Any]:
    meta = metadata()
    return envelope(
        [],
        dataset="quality",
        source_note="Coverage matrices from the ingestion metadata.",
        extra_meta={"coverage": meta.get("coverage", {})},
    )


@router.get("/missing")
def missing() -> dict[str, Any]:
    meta = metadata()
    return envelope(
        meta.get("missing_data", []),
        dataset="quality",
        source_note="Known gaps and their treatment. Missing data is never replaced with zero or a synthetic observation.",
    )


@router.get("/schema")
def schema() -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    with get_connection() as con:
        for name in DATASETS:
            if not dataset_available(name):
                continue
            description = con.execute(f"DESCRIBE SELECT * FROM {name}").df()
            for _, row in description.iterrows():
                rows.append(
                    {
                        "dataset": name,
                        "column": row["column_name"],
                        "type": row["column_type"],
                        "nullable": row["null"] == "YES",
                    }
                )
    return envelope(rows, dataset="quality", source_note="Physical schema of the processed datasets.")


@router.get("/sources")
def sources() -> dict[str, Any]:
    meta = metadata()
    return envelope(
        meta.get("sources", []),
        dataset="quality",
        source_note="Source register with retrieval timestamps and licences.",
    )


@router.get("/lineage")
def lineage() -> dict[str, Any]:
    meta = metadata()
    lineage_rows = [
        {
            "dataset": "country_sector",
            "source": "World Bank WDI",
            "raw_files": "wb_*.csv",
            "transformation": "Indicator values mapped to sector proxies; no gap filling; output growth computed within series.",
            "output": "country_sector.parquet",
        },
        {
            "dataset": "employment",
            "source": "ILOSTAT",
            "raw_files": "ilo_emp_section_occ.csv, ilo_emp_division_occ.csv, ilo_emp_canada_isic3.csv",
            "transformation": "ISIC section/division × ISCO major group filtered and mapped to sector ids; classification variants retained.",
            "output": "employment.parquet",
        },
        {
            "dataset": "salary",
            "source": "ILOSTAT + World Bank",
            "raw_files": "ilo_earnings_*.csv, wb_FP.CPI.TOTL.csv, wb_PA.NUS.PRVT.PP.csv",
            "transformation": "Occupation earnings merged with CPI and PPP conversion factors; real and PPP columns computed explicitly.",
            "output": "salary.parquet",
        },
        {
            "dataset": "living_cost",
            "source": "World Bank WDI",
            "raw_files": "wb_FP.CPI.TOTL.csv, wb_PA.NUS.*.csv, wb_NE.CON.PRVT.PC.KD.csv",
            "transformation": "National price and consumption indicators reshaped to category rows.",
            "output": "living_cost.parquet",
        },
        {
            "dataset": "forecast",
            "source": "Derived from employment, salary, country_sector, living_cost",
            "raw_files": "processed historical Parquet files",
            "transformation": "ETS damped trend with holdout validation; only eligible series written.",
            "output": "forecast.parquet",
        },
    ]
    return envelope(
        lineage_rows,
        dataset="quality",
        source_note="Dataset-level lineage from source to processed file.",
        extra_meta={"method_notes": meta.get("method_notes", {})},
    )
