from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in, years_clause
from ..config import metadata
from ..db import get_connection

router = APIRouter(prefix="/api/living-cost", tags=["living cost"])

SOURCE_NOTE = (
    "World Bank national-level price and consumption indicators. City-level expense data has "
    "not been acquired, so all rows are labelled 'National'. PPP conversion factors are not "
    "living-cost baskets and should be read as price-level context."
)


@router.get("/series")
def series(
    countries: str | None = Query(None),
    categories: str | None = Query(None),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("living_cost")
    country_list = parse_csv(countries)
    category_list = parse_csv(categories)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("expense_category", category_list, params),
        years_clause(start, end, params),
    ]
    sql = f"""
        SELECT country_iso3, country_name, city, year, expense_category,
               expense_label, expense_value, currency, expense_unit,
               household_profile, indicator_id, source_name, source_url,
               observation_status
        FROM living_cost
        WHERE {' AND '.join(clauses)}
        ORDER BY expense_category, country_iso3, year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="living_cost",
        filters={
            "countries": country_list or "all",
            "categories": category_list or "all",
            "start": start,
            "end": end,
        },
        units=frame["expense_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
        warnings=["Values are national aggregates, not city-specific living costs."],
    )


@router.get("/latest")
def latest(
    countries: str | None = Query(None),
    categories: str | None = Query(None),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("living_cost")
    country_list = parse_csv(countries)
    category_list = parse_csv(categories)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("expense_category", category_list, params),
        "year <= ?",
    ]
    params.append(year)
    sql = f"""
        WITH ranked AS (
            SELECT *,
                   row_number() OVER (
                       PARTITION BY country_iso3, expense_category
                       ORDER BY year DESC
                   ) AS rn
            FROM living_cost
            WHERE {' AND '.join(clauses)}
        )
        SELECT country_iso3, country_name, city, year, expense_category,
               expense_label, expense_value, currency, expense_unit,
               household_profile, indicator_id, source_name, source_url,
               observation_status
        FROM ranked
        WHERE rn = 1
        ORDER BY expense_category, country_iso3
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="living_cost",
        filters={
            "countries": country_list or "all",
            "categories": category_list or "all",
            "latest_year_through": year,
        },
        units=frame["expense_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )


@router.get("/categories")
def categories() -> dict[str, Any]:
    require_dataset("living_cost")
    with get_connection() as con:
        frame = con.execute(
            """
            SELECT expense_category,
                   any_value(expense_label) AS expense_label,
                   any_value(expense_unit) AS expense_unit,
                   any_value(currency) AS currency,
                   count(*) AS observations,
                   count(DISTINCT country_iso3) AS countries,
                   min(year) AS year_min,
                   max(year) AS year_max
            FROM living_cost
            GROUP BY expense_category
            ORDER BY expense_category
            """
        ).df()
    return envelope(
        records(frame),
        dataset="living_cost",
        units=frame["expense_unit"].dropna().unique().tolist() if not frame.empty else [],
        source_note=SOURCE_NOTE,
    )


@router.get("/coverage")
def coverage() -> dict[str, Any]:
    matrix = metadata().get("coverage", {}).get("living_cost_matrix", [])
    return envelope(
        matrix,
        dataset="living_cost",
        source_note="Category × country coverage of the national living-cost indicators.",
        units=["observations"],
    )
