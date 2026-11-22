from __future__ import annotations

import io
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..common import parse_csv, require_dataset, sql_in
from ..config import dataset_available
from ..db import get_connection

router = APIRouter(prefix="/api/export", tags=["export"])

ALLOWED = {"country_sector", "employment", "salary", "living_cost", "country_context", "forecast"}


@router.get("/{dataset}.csv")
def export_csv(
    dataset: str,
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    occupations: str | None = Query(None),
    indicators: str | None = Query(None),
    start: int | None = Query(None),
    end: int | None = Query(None),
    granularity: str | None = Query(None),
) -> StreamingResponse:
    if dataset not in ALLOWED:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset}'.")
    require_dataset(dataset)

    params: list[Any] = []
    clauses: list[str] = []
    with get_connection() as con:
        description = con.execute(f"DESCRIBE SELECT * FROM {dataset}").df()
        columns = set(description["column_name"].tolist())
        if "country_iso3" in columns:
            clauses.append(sql_in("country_iso3", parse_csv(countries), params))
        if "sector_id" in columns:
            clauses.append(sql_in("sector_id", parse_csv(sectors), params))
        if "occupation_code" in columns:
            clauses.append(sql_in("occupation_code", parse_csv(occupations), params))
        indicator_column = "indicator_id" if "indicator_id" in columns else "expense_category" if "expense_category" in columns else None
        if indicator_column:
            clauses.append(sql_in(indicator_column, parse_csv(indicators), params))
        time_column = "target_year" if dataset == "forecast" else "year"
        if start is not None:
            clauses.append(f"{time_column} >= ?")
            params.append(int(start))
        if end is not None:
            clauses.append(f"{time_column} <= ?")
            params.append(int(end))
        if granularity and "mapping_granularity" in columns:
            clauses.append("mapping_granularity = ?")
            params.append(granularity)
        where = " AND ".join([c for c in clauses if c and c != "TRUE"]) or "TRUE"
        frame = con.execute(
            f"SELECT * FROM {dataset} WHERE {where} LIMIT 200000", params
        ).df()

    buffer = io.StringIO()
    frame.to_csv(buffer, index=False)
    buffer.seek(0)
    filename = f"beyond-borders_{dataset}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Row-Count": str(len(frame)),
        },
    )
