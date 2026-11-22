from __future__ import annotations

from typing import Any

import json
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in, years_clause
from ..config import metadata
from ..db import get_connection
from ..indicators.sector_registry import SECTOR_DEFINITIONS, SectorDefinition, SectorIndicator, IndicatorType

SOURCE_NOTE = (
    "World Bank World Development Indicators mapped to sectors as documented proxies. "
    "The indicator name and proxy flag are shown on every observation; these are not "
    "sector-specific industrial output series unless the indicator itself is sector-specific."
)


@router.get("/indicators")
def indicators() -> dict[str, Any]:
    require_dataset("country_sector")
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
    return envelope(
        records(frame),
        dataset="country_sector",
        units=frame["indicator_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )


@router.get("/registry")
def registry() -> dict[str, Any]:
    """Serve sector definitions from the indicator registry.

    This endpoint provides the documented proxy/direct indicators for each sector,
    with explicit limitations, without querying the processed country_sector table.
    """
    definitions: list[dict[str, Any]] = []
    for sector_id, definition in SECTOR_DEFINITIONS.items():
        def_dict: dict[str, Any] = {
            "sector_id": definition.sector_id,
            "sector_name": definition.sector_name,
            "sector_definition": definition.sector_definition,
            "official_industry_codes": definition.official_industry_codes,
            "direct_indicators": [
                asdict(ind)
                for ind in definition.direct_indicators
                if ind.indicator_type == IndicatorType.DIRECT
            ],
            "proxy_indicators": [
                asdict(ind)
                for ind in definition.proxy_indicators
                if ind.indicator_type == IndicatorType.PROXY
            ],
            "mapping_limitations": definition.mapping_limitations,
        }
        definitions.append(def_dict)
    return envelope(
        definitions,
        dataset="sector_registry",
        source_note="Documented proxy indicators for each sector, with explicit limitations. Do not treat these as direct sector output measurements.",
    )


@router.get("/series")
def series(
    countries: str | None = Query(None, description="Comma-separated ISO3 codes"),
    sectors: str | None = Query(None, description="Comma-separated sector ids"),
    indicators: str | None = Query(None, description="Comma-separated World Bank indicator ids"),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("country_sector")
    country_list = parse_csv(countries)
    sector_list = parse_csv(sectors)
    indicator_list = parse_csv(indicators)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("sector_id", sector_list, params),
        sql_in("indicator_id", indicator_list, params),
        years_clause(start, end, params),
    ]
    sql = f"""
        SELECT country_iso3, country_name, sector_id, sector_name, year,
               indicator_id, indicator_name, indicator_role, indicator_value,
               indicator_unit, industrial_output, industrial_output_unit,
               output_growth, is_proxy, proxy_note,
               source_name, source_url, observation_status
        FROM country_sector
        WHERE {' AND '.join(clauses)}
        ORDER BY indicator_id, country_iso3, year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="country_sector",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "indicators": indicator_list or "all",
            "start": start,
            "end": end,
        },
        units=frame["indicator_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
        warnings=[
            "Output growth is year-over-year and is blank where the previous year is missing.",
        ],
    )


@router.get("/latest")
def latest(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    indicators: str | None = Query(None),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("country_sector")
    country_list = parse_csv(countries)
    sector_list = parse_csv(sectors)
    indicator_list = parse_csv(indicators)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("sector_id", sector_list, params),
        sql_in("indicator_id", indicator_list, params),
        "year <= ?",
    ]
    params.append(year)
    sql = f"""
        WITH ranked AS (
            SELECT *,
                   row_number() OVER (
                       PARTITION BY country_iso3, sector_id, indicator_id
                       ORDER BY year DESC
                   ) AS rn
            FROM country_sector
            WHERE {' AND '.join(clauses)}
        )
        SELECT country_iso3, country_name, sector_id, sector_name, year,
               indicator_id, indicator_name, indicator_role, indicator_value,
               indicator_unit, output_growth, is_proxy, proxy_note,
               source_name, source_url, observation_status
        FROM ranked
        WHERE rn = 1
        ORDER BY sector_id, indicator_id, country_iso3
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    stale = []
    if not frame.empty:
        stale = sorted(
            {
                f"{row.country_iso3} {row.indicator_id} latest={int(row.year)}"
                for row in frame.itertuples()
                if int(row.year) < year
            }
        )
    return envelope(
        records(frame),
        dataset="country_sector",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "indicators": indicator_list or "all",
            "latest_year_through": year,
        },
        units=frame["indicator_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
        warnings=(
            [f"Latest available observation predates {year} for {len(stale)} series."]
            if stale
            else []
        ),
        extra_meta={"stale_series": stale[:25]},
    )


@router.get("/growth")
def growth(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    indicators: str | None = Query(None),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("country_sector")
    country_list = parse_csv(countries)
    sector_list = parse_csv(sectors)
    indicator_list = parse_csv(indicators)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("sector_id", sector_list, params),
        sql_in("indicator_id", indicator_list, params),
        years_clause(start, end, params),
    ]
    sql = f"""
        SELECT country_iso3, country_name, sector_id, sector_name,
               indicator_id, indicator_name, indicator_unit, is_proxy,
               arg_min(indicator_value, year) AS first_value,
               min(year) AS first_year,
               arg_max(indicator_value, year) AS last_value,
               max(year) AS last_year,
               count(*) AS observations
        FROM country_sector
        WHERE {' AND '.join(clauses)}
        GROUP BY country_iso3, country_name, sector_id, sector_name,
                 indicator_id, indicator_name, indicator_unit, is_proxy
        HAVING count(*) >= 2
        ORDER BY sector_id, indicator_id, country_iso3
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    if not frame.empty:
        span = frame["last_year"] - frame["first_year"]
        valid = (span > 0) & (frame["first_value"] > 0) & (frame["last_value"] > 0)
        frame["cagr_pct"] = None
        frame.loc[valid, "cagr_pct"] = (
            (frame.loc[valid, "last_value"] / frame.loc[valid, "first_value"])
            ** (1.0 / span[valid])
            - 1.0
        ) * 100.0
        frame["years_span"] = span
        frame["note"] = "CAGR uses the first and last observed years in the selected window; gaps are not interpolated."
    return envelope(
        records(frame),
        dataset="country_sector",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "indicators": indicator_list or "all",
            "start": start,
            "end": end,
        },
        units=["% compound annual growth"],
        source_note=SOURCE_NOTE,
        warnings=["A CAGR is only computed when both endpoints are positive and at least two years apart."],
    )


@router.get("/coverage")
def coverage() -> dict[str, Any]:
    matrix = metadata().get("coverage", {}).get("country_sector_matrix", [])
    return envelope(
        matrix,
        dataset="country_sector",
        source_note="Share of expected country–sector indicator cells observed (available indicators × 2010–2024 years).",
        units=["% coverage"],
    )
