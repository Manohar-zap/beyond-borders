from __future__ import annotations

import math
from typing import Any, Iterable

import numpy as np
import pandas as pd

from .config import metadata


def parse_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def sql_in(column: str, values: list[str], params: list[Any]) -> str:
    if not values:
        return "TRUE"
    placeholders = ", ".join("?" for _ in values)
    params.extend(values)
    return f"{column} IN ({placeholders})"


def sanitize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    return [
        {str(key): sanitize(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def sources_for(dataset: str) -> list[dict[str, str]]:
    meta = metadata()
    sources = meta.get("sources", [])
    if dataset == "forecast":
        return sources
    mapping = {
        "country_sector": ["world_bank_wdi"],
        "country_context": ["world_bank_wdi"],
        "living_cost": ["world_bank_wdi"],
        "employment": ["ilostat"],
        "salary": ["ilostat", "world_bank_wdi"],
    }
    wanted = set(mapping.get(dataset, []))
    return [s for s in sources if s.get("id") in wanted]


def envelope(
    data: list[dict[str, Any]],
    *,
    dataset: str,
    filters: dict[str, Any] | None = None,
    units: Iterable[str] | None = None,
    warnings: list[str] | None = None,
    source_note: str | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = metadata()
    payload: dict[str, Any] = {
        "meta": {
            "dataset": dataset,
            "row_count": len(data),
            "generated_at": meta.get("generated_at"),
            "historical_period": meta.get("historical_period"),
            "forecast_period": meta.get("forecast_period"),
            "filters": filters or {},
            "units": sorted({u for u in (units or []) if u}),
            "sources": sources_for(dataset),
            "source_note": source_note,
            "warnings": warnings or [],
            "api_version": "1.0.0",
        },
        "data": data,
    }
    if extra_meta:
        payload["meta"].update(extra_meta)
    return payload


def require_dataset(name: str) -> None:
    from fastapi import HTTPException

    from .config import dataset_available

    if not dataset_available(name):
        raise HTTPException(
            status_code=503,
            detail=(
                f"The '{name}' dataset has not been built. Run the ingestion pipeline "
                f"(backend/scripts/ingest.py) to acquire and process the source data."
            ),
        )


def years_clause(start: int | None, end: int | None, params: list[Any], column: str = "year") -> str:
    clauses = []
    if start is not None:
        clauses.append(f"{column} >= ?")
        params.append(int(start))
    if end is not None:
        clauses.append(f"{column} <= ?")
        params.append(int(end))
    return " AND ".join(clauses) if clauses else "TRUE"
