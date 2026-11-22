from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in
from ..config import forecast_metadata
from ..db import get_connection

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

SOURCE_NOTE = (
    "Model-generated forecasts, stored separately from observations. Every series carries a "
    "holdout validation status and error metrics. Forecasts assume a continuation of historical "
    "trends; they are not observations and do not incorporate policy scenarios."
)

SALARY_COLUMNS = {
    "salary_mean": "salary_mean",
    "salary_real_2010": "salary_real_2010",
    "salary_ppp_intl": "salary_ppp_intl",
}


@router.get("/series")
def series(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    occupations: str | None = Query(None),
    indicators: str | None = Query(None),
    dataset: str | None = Query(None, pattern="^(employment|salary|country_sector|living_cost)$"),
    granularity: str | None = Query(None),
    status: str | None = Query(None, description="Comma-separated validation statuses"),
    start: int = Query(2025, ge=2025, le=2030),
    end: int = Query(2030, ge=2025, le=2030),
) -> dict[str, Any]:
    require_dataset("forecast")
    country_list = parse_csv(countries)
    sector_list = parse_csv(sectors)
    occupation_list = parse_csv(occupations)
    indicator_list = parse_csv(indicators)
    status_list = parse_csv(status)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("sector_id", sector_list, params),
        sql_in("occupation_code", occupation_list, params),
        sql_in("indicator_id", indicator_list, params),
        sql_in("validation_status", status_list, params),
        "target_year >= ?",
        "target_year <= ?",
    ]
    params.extend([start, end])
    if dataset:
        clauses.append("dataset = ?")
        params.append(dataset)
    if granularity:
        clauses.append("granularity = ?")
        params.append(granularity)
    sql = f"""
        SELECT country_iso3, country_name, sector_id, sector_name,
               occupation_code, occupation_name, indicator_id, indicator_name,
               target_year, predicted_value, lower_interval, upper_interval,
               indicator_unit, model_name, model_version, forecast_origin,
               training_end_year, scenario, validation_status, validation_mape,
               validation_rmse, validation_n, validation_coverage_pct,
               interval_level, interval_method, series_label, granularity, dataset,
               source_name, source_url
        FROM forecast
        WHERE {' AND '.join(clauses)}
        ORDER BY dataset, country_iso3, sector_id, occupation_code, indicator_id, target_year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="forecast",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "occupations": occupation_list or "all",
            "indicators": indicator_list or "all",
            "dataset": dataset or "all",
            "granularity": granularity or "all",
            "status": status_list or "all",
            "target_start": start,
            "target_end": end,
        },
        units=frame["indicator_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
        warnings=[
            "Forecasts are only present for series that passed the eligibility rules and holdout validation.",
            "High-error series are included with an explicit flag; they should not be read as reliable point predictions.",
        ],
    )


@router.get("/summary")
def summary() -> dict[str, Any]:
    meta = forecast_metadata()
    counts: list[dict[str, Any]] = []
    if meta:
        require_dataset("forecast")
        with get_connection() as con:
            frame = con.execute(
                """
                SELECT dataset, validation_status,
                       count(*) AS forecast_rows,
                       count(DISTINCT country_iso3 || '|' || sector_id || '|' || occupation_code || '|' || indicator_id || '|' || granularity) AS series,
                       min(target_year) AS first_target_year,
                       max(target_year) AS last_target_year
                FROM forecast
                GROUP BY dataset, validation_status
                ORDER BY dataset, validation_status
                """
            ).df()
            counts = records(frame)
    return envelope(
        counts,
        dataset="forecast",
        source_note=SOURCE_NOTE,
        extra_meta={
            "forecast_metadata": meta,
            "model_version": meta.get("model_version"),
            "series": meta.get("series"),
            "rows": meta.get("rows"),
        },
    )


@router.get("/validation")
def validation(
    countries: str | None = Query(None),
    dataset: str | None = Query(None, pattern="^(employment|salary|country_sector|living_cost)$"),
    status: str | None = Query(None),
) -> dict[str, Any]:
    require_dataset("forecast")
    country_list = parse_csv(countries)
    status_list = parse_csv(status)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("validation_status", status_list, params),
    ]
    if dataset:
        clauses.append("dataset = ?")
        params.append(dataset)
    sql = f"""
        SELECT dataset, country_iso3, country_name, sector_id, sector_name,
               occupation_code, occupation_name, indicator_id, indicator_name,
               granularity, series_label, validation_status,
               max(validation_mape) AS validation_mape,
               max(validation_rmse) AS validation_rmse,
               max(validation_n) AS validation_n,
               max(validation_coverage_pct) AS validation_coverage_pct,
               max(model_name) AS model_name,
               min(target_year) AS first_target_year,
               max(target_year) AS last_target_year,
               count(*) AS forecast_rows
        FROM forecast
        WHERE {' AND '.join(clauses)}
        GROUP BY dataset, country_iso3, country_name, sector_id, sector_name,
                 occupation_code, occupation_name, indicator_id, indicator_name,
                 granularity, series_label, validation_status
        ORDER BY validation_status, dataset, country_iso3, indicator_id
        LIMIT 3000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="forecast",
        filters={
            "countries": country_list or "all",
            "dataset": dataset or "all",
            "status": status_list or "all",
        },
        source_note="Holdout validation metrics: MAPE and RMSE over the final 2–3 observed years.",
        units=["% MAPE", "indicator units RMSE"],
    )


@router.get("/availability")
def availability(
    dataset: str | None = Query(None, pattern="^(employment|salary|country_sector|living_cost)$"),
    countries: str | None = Query(None),
) -> dict[str, Any]:
    require_dataset("forecast")
    country_list = parse_csv(countries)
    params: list[Any] = []
    clauses = [sql_in("country_iso3", country_list, params)]
    if dataset:
        clauses.append("dataset = ?")
        params.append(dataset)
    sql = f"""
        SELECT dataset, country_iso3, country_name, sector_id, sector_name,
               occupation_code, occupation_name, indicator_id, indicator_name,
               granularity, validation_status, count(*) AS forecast_years,
               min(target_year) AS first_target_year,
               max(target_year) AS last_target_year
        FROM forecast
        WHERE {' AND '.join(clauses)}
        GROUP BY dataset, country_iso3, country_name, sector_id, sector_name,
                 occupation_code, occupation_name, indicator_id, indicator_name,
                 granularity, validation_status
        ORDER BY dataset, country_iso3, sector_id, occupation_code, indicator_id
        LIMIT 5000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="forecast",
        filters={"dataset": dataset or "all", "countries": country_list or "all"},
        source_note=SOURCE_NOTE,
    )


@router.get("/outlook")
def outlook(
    dataset: str = Query(..., pattern="^(employment|salary|country_sector|living_cost)$"),
    country_iso3: str = Query(..., min_length=3, max_length=3),
    sector_id: str = Query("ALL"),
    occupation_code: str = Query("ALL"),
    indicator_id: str = Query(...),
    granularity: str = Query("section"),
) -> dict[str, Any]:
    require_dataset("forecast")
    actual_sql = ""
    actual_params: list[Any] = [country_iso3]
    unit = ""
    source_url = ""

    if dataset == "employment":
        actual_sql = """
            SELECT year, employment AS value, employment_unit AS unit,
                   source_url, observation_status
            FROM employment
            WHERE country_iso3 = ? AND sector_id = ? AND occupation_code = ?
              AND mapping_granularity = ? AND year <= 2024
            ORDER BY year
        """
        actual_params += [sector_id, occupation_code, granularity]
    elif dataset == "salary":
        column = SALARY_COLUMNS.get(indicator_id)
        if not column:
            raise HTTPException(status_code=400, detail=f"Unknown salary indicator '{indicator_id}'.")
        actual_sql = f"""
            SELECT year, {column} AS value, currency AS unit,
                   source_url, observation_status
            FROM salary
            WHERE country_iso3 = ? AND occupation_code = ? AND {column} IS NOT NULL
              AND year <= 2024
            ORDER BY year
        """
        actual_params.append(occupation_code)
    elif dataset == "country_sector":
        actual_sql = """
            SELECT year, indicator_value AS value, indicator_unit AS unit,
                   source_url, observation_status
            FROM country_sector
            WHERE country_iso3 = ? AND sector_id = ? AND indicator_id = ?
              AND year <= 2024
            ORDER BY year
        """
        actual_params += [sector_id, indicator_id]
    elif dataset == "living_cost":
        actual_sql = """
            SELECT year, expense_value AS value, expense_unit AS unit,
                   source_url, observation_status
            FROM living_cost
            WHERE country_iso3 = ? AND expense_category = ? AND year <= 2024
            ORDER BY year
        """
        actual_params.append(indicator_id)

    forecast_sql = """
        SELECT target_year, predicted_value, lower_interval, upper_interval,
               indicator_unit, validation_status, validation_mape, validation_rmse,
               model_name, forecast_origin, training_end_year, series_label, source_url
        FROM forecast
        WHERE dataset = ? AND country_iso3 = ? AND sector_id = ?
          AND occupation_code = ? AND indicator_id = ? AND granularity = ?
          AND target_year BETWEEN 2025 AND 2030
        ORDER BY target_year
    """
    forecast_params = [dataset, country_iso3, sector_id, occupation_code, indicator_id, granularity]

    with get_connection() as con:
        actual_frame = con.execute(actual_sql, actual_params).df()
        forecast_frame = con.execute(forecast_sql, forecast_params).df()

    if not actual_frame.empty:
        unit = str(actual_frame["unit"].dropna().iloc[0]) if actual_frame["unit"].notna().any() else ""
        source_url = str(actual_frame["source_url"].dropna().iloc[0]) if actual_frame["source_url"].notna().any() else ""
    if actual_frame.empty and forecast_frame.empty:
        raise HTTPException(status_code=404, detail="No observations or forecasts exist for this series.")

    payload = envelope(
        records(forecast_frame),
        dataset="forecast",
        filters={
            "dataset": dataset,
            "country_iso3": country_iso3,
            "sector_id": sector_id,
            "occupation_code": occupation_code,
            "indicator_id": indicator_id,
            "granularity": granularity,
        },
        units=[unit] if unit else [],
        source_note=SOURCE_NOTE,
        extra_meta={
            "actual": records(actual_frame),
            "forecast": records(forecast_frame),
            "unit": unit,
            "source_url": source_url,
        },
    )
    return payload
