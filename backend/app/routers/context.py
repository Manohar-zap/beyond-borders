from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in, years_clause
from ..db import get_connection

router = APIRouter(prefix="/api/context", tags=["country context"])

SOURCE_NOTE = (
    "World Bank World Development Indicators used as country context. "
    "These are whole-economy indicators and are not sector-specific. "
    "GDP per capita and household consumption are in current and constant US dollars respectively."
)

INDICATORS = {
    "NY.GDP.PCAP.CD": ("GDP per capita", "current US$"),
    "NY.GDP.MKTP.CD": ("GDP", "current US$"),
    "SP.POP.TOTL": ("Population", "persons"),
    "SL.UEM.TOTL.ZS": ("Unemployment rate", "% of labour force"),
    "SL.TLF.CACT.ZS": ("Labour force participation rate", "% of population 15+"),
    "FP.CPI.TOTL": ("Consumer price index", "index (2010 = 100)"),
    "PA.NUS.PRVT.PP": ("PPP conversion factor, private consumption", "LCU per international $"),
    "NE.CON.PRVT.PC.KD": ("Household consumption per capita", "constant 2015 US$"),
    "FP.CPI.TOTL.ZG": ("Inflation, consumer prices", "% annual"),
}


@router.get("/indicators")
def indicators() -> dict[str, Any]:
    require_dataset("country_context")
    with get_connection() as con:
        frame = con.execute(
            """
            SELECT indicator_id,
                   any_value(indicator_name) AS indicator_name,
                   any_value(unit) AS unit,
                   count(*) AS observations,
                   count(DISTINCT country_iso3) AS countries,
                   min(year) AS year_min,
                   max(year) AS year_max
            FROM country_context
            GROUP BY indicator_id
            ORDER BY indicator_id
            """
        ).df()
    return envelope(
        records(frame),
        dataset="country_context",
        units=frame["unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )


@router.get("/series")
def series(
    countries: str | None = Query(None),
    indicators: str | None = Query(None),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("country_context")
    country_list = parse_csv(countries)
    indicator_list = parse_csv(indicators)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("indicator_id", indicator_list, params),
        years_clause(start, end, params),
    ]
    sql = f"""
        SELECT country_iso3, country_name, year, indicator_id, indicator_name,
               value, unit, source_name, source_url, retrieved_at
        FROM country_context
        WHERE {' AND '.join(clauses)}
        ORDER BY indicator_id, country_iso3, year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="country_context",
        filters={
            "countries": country_list or "all",
            "indicators": indicator_list or "all",
            "start": start,
            "end": end,
        },
        units=frame["unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )


@router.get("/latest")
def latest(
    countries: str | None = Query(None),
    indicators: str | None = Query(None),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("country_context")
    country_list = parse_csv(countries)
    indicator_list = parse_csv(indicators)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("indicator_id", indicator_list, params),
        "year <= ?",
    ]
    params.append(year)
    sql = f"""
        WITH ranked AS (
            SELECT *,
                   row_number() OVER (
                       PARTITION BY country_iso3, indicator_id
                       ORDER BY year DESC
                   ) AS rn
            FROM country_context
            WHERE {' AND '.join(clauses)}
        )
        SELECT country_iso3, country_name, year, indicator_id, indicator_name,
               value, unit, source_name, source_url, retrieved_at
        FROM ranked
        WHERE rn = 1
        ORDER BY indicator_id, country_iso3
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="country_context",
        filters={
            "countries": country_list or "all",
            "indicators": indicator_list or "all",
            "latest_year_through": year,
        },
        units=frame["unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )
