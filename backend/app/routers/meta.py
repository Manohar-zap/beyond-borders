from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
from fastapi import APIRouter

from ..common import envelope, records
from ..config import DATASETS, DATA_DIR, dataset_available, dataset_path, forecast_metadata, metadata
from ..db import get_connection

router = APIRouter(prefix="/api", tags=["metadata"])


def _dataset_status() -> list[dict[str, Any]]:
    status = []
    for name in DATASETS:
        path = dataset_path(name)
        entry: dict[str, Any] = {
            "name": name,
            "available": path.exists(),
            "file": f"{name}.parquet",
        }
        if path.exists():
            stat = path.stat()
            entry.update(
                {
                    "rows": int(pq.ParquetFile(path).metadata.num_rows),
                    "bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
        status.append(entry)
    return status


@router.get("/health")
def health() -> dict[str, Any]:
    available = [name for name in DATASETS if dataset_available(name)]
    return {
        "status": "ok" if "country_sector" in available and "employment" in available else "degraded",
        "api_version": "1.0.0",
        "datasets_available": available,
        "datasets_missing": [name for name in DATASETS if name not in available],
        "data_generated_at": metadata().get("generated_at"),
    }


@router.get("/meta")
def get_meta() -> dict[str, Any]:
    meta = metadata()
    forecast = forecast_metadata()
    indicators: list[dict[str, Any]] = []
    living_categories: list[dict[str, Any]] = []
    employment_coverage: list[dict[str, Any]] = []

    if dataset_available("country_sector"):
        with get_connection() as con:
            frame = con.execute(
                """
                SELECT sector_id,
                       any_value(sector_name) AS sector_name,
                       indicator_id,
                       any_value(indicator_name) AS indicator_name,
                       any_value(indicator_unit) AS indicator_unit,
                       any_value(indicator_role) AS indicator_role,
                       bool_or(is_proxy) AS is_proxy,
                       any_value(proxy_note) AS proxy_note,
                       count(*) AS observations,
                       count(DISTINCT country_iso3) AS countries,
                       min(year) AS year_min,
                       max(year) AS year_max
                FROM country_sector
                GROUP BY sector_id, indicator_id
                ORDER BY sector_id, indicator_id
                """
            ).df()
            indicators = records(frame)

    if dataset_available("living_cost"):
        with get_connection() as con:
            frame = con.execute(
                """
                SELECT expense_category,
                       any_value(expense_label) AS expense_label,
                       any_value(expense_unit) AS expense_unit,
                       count(*) AS observations,
                       min(year) AS year_min,
                       max(year) AS year_max
                FROM living_cost
                GROUP BY expense_category
                ORDER BY expense_category
                """
            ).df()
            living_categories = records(frame)

    if dataset_available("employment"):
        with get_connection() as con:
            frame = con.execute(
                """
                SELECT mapping_granularity,
                       count(*) AS observations,
                       count(DISTINCT country_iso3) AS countries,
                       count(DISTINCT sector_id) AS sectors,
                       count(DISTINCT occupation_code) AS occupations,
                       min(year) AS year_min,
                       max(year) AS year_max
                FROM employment
                GROUP BY mapping_granularity
                ORDER BY mapping_granularity
                """
            ).df()
            employment_coverage = records(frame)

    return {
        "project": meta.get("project"),
        "generated_at": meta.get("generated_at"),
        "historical_period": meta.get("historical_period"),
        "forecast_period": meta.get("forecast_period"),
        "frequency": meta.get("frequency"),
        "countries": meta.get("countries", []),
        "sectors": meta.get("sectors", []),
        "occupations": meta.get("occupations", []),
        "sector_indicators": indicators,
        "living_cost_categories": living_categories,
        "employment_coverage": employment_coverage,
        "datasets": _dataset_status(),
        "sources": meta.get("sources", []),
        "missing_data": meta.get("missing_data", []),
        "method_notes": meta.get("method_notes", {}),
        "forecast": {
            "model_version": forecast.get("model_version"),
            "rows": forecast.get("rows"),
            "series": forecast.get("series"),
            "by_status": forecast.get("by_status", {}),
            "method": forecast.get("method", {}),
            "notes": forecast.get("notes", []),
        },
    }


@router.get("/coverage")
def get_coverage() -> dict[str, Any]:
    meta = metadata()
    return envelope(
        [],
        dataset="coverage",
        source_note="Coverage is computed from the processed research datasets; expected cells use the 2010–2024 annual grid and available indicators.",
        extra_meta={"coverage": meta.get("coverage", {})},
    )


@router.get("/sources")
def get_sources() -> dict[str, Any]:
    meta = metadata()
    return envelope(
        meta.get("sources", []),
        dataset="sources",
        source_note="Official or clearly documented statistical sources used in this build.",
    )


@router.get("/search")
def search(q: str = "") -> dict[str, Any]:
    query = q.strip().lower()
    meta = metadata()
    results: list[dict[str, Any]] = []
    if not query:
        return envelope([], dataset="search", warnings=["Provide a search query."])
    for country in meta.get("countries", []):
        if query in country["name"].lower() or query in country["iso3"].lower():
            results.append({"type": "country", "id": country["iso3"], "label": country["name"]})
    for sector in meta.get("sectors", []):
        if query in sector["name"].lower() or query in sector["id"].lower():
            results.append({"type": "sector", "id": sector["id"], "label": sector["name"]})
    for occupation in meta.get("occupations", []):
        if query in occupation["name"].lower() or query in occupation["code"].lower():
            results.append({"type": "occupation", "id": occupation["code"], "label": occupation["name"]})
    return envelope(results[:30], dataset="search", filters={"q": q})
