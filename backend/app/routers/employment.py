from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in, years_clause
from ..config import metadata
from ..db import get_connection

router = APIRouter(prefix="/api/employment", tags=["employment"])

SOURCE_NOTE = (
    "ILOSTAT employment by economic activity and occupation (thousands of persons, total sex). "
    "Section-level industry mappings are broad proxies and are flagged. Division-level series are "
    "available only for countries that publish ISIC Rev.4 two-digit data."
)


def _filters(
    countries: str | None,
    sectors: str | None,
    occupations: str | None,
    granularity: str | None,
) -> tuple[list[str], list[str], list[str], str, list[Any], list[str]]:
    country_list = parse_csv(countries)
    sector_list = parse_csv(sectors)
    occupation_list = parse_csv(occupations)
    grain = granularity or "section"
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("sector_id", sector_list, params),
        sql_in("occupation_code", occupation_list, params),
    ]
    if grain in {"section", "division"}:
        clauses.append("mapping_granularity = ?")
        params.append(grain)
    return country_list, sector_list, occupation_list, grain, params, clauses


@router.get("/series")
def series(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    occupations: str | None = Query(None),
    granularity: str = Query("section", pattern="^(section|division)$"),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("employment")
    country_list, sector_list, occupation_list, grain, params, clauses = _filters(
        countries, sectors, occupations, granularity
    )
    clauses.append(years_clause(start, end, params))
    sql = f"""
        SELECT country_iso3, country_name, sector_id, sector_name,
               occupation_code, occupation_name, year, employment,
               employment_unit, employment_growth, vacancies, vacancy_rate,
               industry_code, industry_name, mapping_granularity, mapping_quality,
               classification_system, occupation_classification, mapping_note,
               source_name, source_url, observation_status
        FROM employment
        WHERE {' AND '.join(clauses)}
        ORDER BY country_iso3, sector_id, occupation_code, year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    warnings = []
    if grain == "section":
        warnings.append(
            "Section-level mappings are broad proxies. For example, semiconductors map to all manufacturing and automotive maps to motor-vehicle trade and repair."
        )
    if grain == "division":
        warnings.append(
            "Division-level series are available only for India, Japan, the United Kingdom and the United States. Germany and Canada are absent because they do not publish this classification in the source series."
        )
    return envelope(
        records(frame),
        dataset="employment",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "occupations": occupation_list or "all",
            "granularity": grain,
            "start": start,
            "end": end,
        },
        units=frame["employment_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
        warnings=warnings,
    )


@router.get("/latest")
def latest(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    occupations: str | None = Query(None),
    granularity: str = Query("section", pattern="^(section|division)$"),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("employment")
    country_list, sector_list, occupation_list, grain, params, clauses = _filters(
        countries, sectors, occupations, granularity
    )
    clauses.append("year <= ?")
    params.append(year)
    sql = f"""
        WITH ranked AS (
            SELECT *,
                   row_number() OVER (
                       PARTITION BY country_iso3, sector_id, occupation_code
                       ORDER BY year DESC
                   ) AS rn
            FROM employment
            WHERE {' AND '.join(clauses)}
        )
        SELECT country_iso3, country_name, sector_id, sector_name,
               occupation_code, occupation_name, year, employment,
               employment_unit, employment_growth, industry_name,
               mapping_granularity, mapping_quality, classification_system,
               occupation_classification, mapping_note, source_name, source_url,
               observation_status
        FROM ranked
        WHERE rn = 1
        ORDER BY sector_id, country_iso3, occupation_code
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="employment",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "occupations": occupation_list or "all",
            "granularity": grain,
            "latest_year_through": year,
        },
        units=["thousands of persons"],
        source_note=SOURCE_NOTE,
    )


@router.get("/sector-totals")
def sector_totals(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    granularity: str = Query("section", pattern="^(section|division)$"),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("employment")
    country_list, sector_list, _, grain, params, clauses = _filters(
        countries, sectors, "TOTAL", granularity
    )
    clauses.append(years_clause(start, end, params))
    sql = f"""
        SELECT country_iso3, country_name, sector_id, sector_name, year,
               employment, employment_unit, employment_growth, industry_name,
               mapping_granularity, mapping_quality, classification_system,
               source_name, source_url, observation_status
        FROM employment
        WHERE {' AND '.join(clauses)}
        ORDER BY country_iso3, sector_id, year
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="employment",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "occupations": ["TOTAL"],
            "granularity": grain,
            "start": start,
            "end": end,
        },
        units=["thousands of persons"],
        source_note=SOURCE_NOTE,
        warnings=["Sector totals use the mapped industry only; they are not whole-economy employment."],
    )


@router.get("/occupation-share")
def occupation_share(
    countries: str | None = Query(None),
    sectors: str | None = Query(None),
    granularity: str = Query("section", pattern="^(section|division)$"),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("employment")
    country_list, sector_list, _, grain, params, clauses = _filters(
        countries, sectors, None, granularity
    )
    clauses.append("occupation_code <> 'TOTAL'")
    clauses.append("year = ?")
    params.append(year)
    sql = f"""
        WITH base AS (
            SELECT country_iso3, country_name, sector_id, sector_name,
                   occupation_code, occupation_name, year, employment,
                   mapping_granularity, mapping_quality
            FROM employment
            WHERE {' AND '.join(clauses)}
        ),
        totals AS (
            SELECT country_iso3, sector_id, year, sum(employment) AS total_employment
            FROM base
            GROUP BY country_iso3, sector_id, year
        )
        SELECT b.*, t.total_employment,
               CASE WHEN t.total_employment > 0
                    THEN 100.0 * b.employment / t.total_employment
                    ELSE NULL END AS share_pct
        FROM base b
        JOIN totals t
          ON b.country_iso3 = t.country_iso3
         AND b.sector_id = t.sector_id
         AND b.year = t.year
        ORDER BY b.country_iso3, b.sector_id, b.occupation_code
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="employment",
        filters={
            "countries": country_list or "all",
            "sectors": sector_list or "all",
            "granularity": grain,
            "year": year,
        },
        units=["thousands of persons", "% of mapped sector employment"],
        source_note=SOURCE_NOTE,
        warnings=[
            "Shares use only occupations observed in the mapped industry; they do not sum to 100% when categories are missing."
        ],
    )


@router.get("/coverage")
def coverage() -> dict[str, Any]:
    matrix = metadata().get("coverage", {}).get("employment_matrix", [])
    return envelope(
        matrix,
        dataset="employment",
        source_note="Country–sector observation counts for each mapping granularity.",
        units=["observations"],
    )
