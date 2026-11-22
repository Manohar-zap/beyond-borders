from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..common import envelope, parse_csv, records, require_dataset, sql_in, years_clause
from ..config import metadata
from ..db import get_connection

router = APIRouter(prefix="/api/salary", tags=["salary"])

SOURCE_NOTE = (
    "ILOSTAT average monthly earnings of employees by occupation, local currency, nominal. "
    "Real values are deflated with World Bank CPI (2010 = 100). PPP values divide by the "
    "World Bank private-consumption PPP conversion factor. Local-currency levels are not "
    "directly comparable across countries without the PPP view."
)

BASIS = {
    "nominal": ("salary_mean", "Mean monthly earnings, nominal local currency"),
    "real": ("salary_real_2010", "Mean monthly earnings, constant 2010 local currency"),
    "ppp": ("salary_ppp_intl", "Mean monthly earnings, PPP-adjusted international dollars"),
}


def _basis(value: str) -> tuple[str, str]:
    if value not in BASIS:
        return BASIS["nominal"]
    return BASIS[value]


@router.get("/series")
def series(
    countries: str | None = Query(None),
    occupations: str | None = Query(None),
    basis: str = Query("nominal", pattern="^(nominal|real|ppp)$"),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("salary")
    country_list = parse_csv(countries)
    occupation_list = parse_csv(occupations)
    column, label = _basis(basis)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("occupation_code", occupation_list, params),
        years_clause(start, end, params),
    ]
    sql = f"""
        SELECT country_iso3, country_name, occupation_code, occupation_name, year,
               salary_mean, salary_median, salary_real_2010, salary_ppp_intl,
               currency, pay_period, gross_or_net, nominal_or_real,
               occupation_classification, conversion_note,
               source_name, source_url, observation_status
        FROM salary
        WHERE {' AND '.join(clauses)}
        ORDER BY country_iso3, occupation_code, year
        LIMIT 50000
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="salary",
        filters={
            "countries": country_list or "all",
            "occupations": occupation_list or "all",
            "basis": basis,
            "start": start,
            "end": end,
        },
        units=["local currency per month", "international $ per month", "constant 2010 local currency per month"],
        source_note=SOURCE_NOTE,
        warnings=[
            "Experience level is not available in the harmonised ILOSTAT series; all values refer to all employees.",
            "Japan has no occupation-level earnings observations in this source series.",
        ],
        extra_meta={"value_column": column, "value_label": label},
    )


@router.get("/latest")
def latest(
    countries: str | None = Query(None),
    occupations: str | None = Query(None),
    basis: str = Query("nominal", pattern="^(nominal|real|ppp)$"),
    year: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("salary")
    country_list = parse_csv(countries)
    occupation_list = parse_csv(occupations)
    column, label = _basis(basis)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("occupation_code", occupation_list, params),
        "year <= ?",
    ]
    params.append(year)
    sql = f"""
        WITH ranked AS (
            SELECT *,
                   row_number() OVER (
                       PARTITION BY country_iso3, occupation_code
                       ORDER BY year DESC
                   ) AS rn
            FROM salary
            WHERE {' AND '.join(clauses)}
        )
        SELECT country_iso3, country_name, occupation_code, occupation_name, year,
               salary_mean, salary_median, salary_real_2010, salary_ppp_intl,
               currency, pay_period, gross_or_net, occupation_classification,
               conversion_note, source_name, source_url, observation_status
        FROM ranked
        WHERE rn = 1
        ORDER BY country_iso3, occupation_code
    """
    with get_connection() as con:
        frame = con.execute(sql, params).df()
    return envelope(
        records(frame),
        dataset="salary",
        filters={
            "countries": country_list or "all",
            "occupations": occupation_list or "all",
            "basis": basis,
            "latest_year_through": year,
        },
        units=["local currency per month", "international $ per month"],
        source_note=SOURCE_NOTE,
        extra_meta={"value_column": column, "value_label": label},
    )


@router.get("/growth")
def growth(
    countries: str | None = Query(None),
    occupations: str | None = Query(None),
    basis: str = Query("real", pattern="^(nominal|real|ppp)$"),
    start: int = Query(2010, ge=2010, le=2024),
    end: int = Query(2024, ge=2010, le=2024),
) -> dict[str, Any]:
    require_dataset("salary")
    country_list = parse_csv(countries)
    occupation_list = parse_csv(occupations)
    column, label = _basis(basis)
    params: list[Any] = []
    clauses = [
        sql_in("country_iso3", country_list, params),
        sql_in("occupation_code", occupation_list, params),
        years_clause(start, end, params),
        f"{column} IS NOT NULL",
    ]
    sql = f"""
        SELECT country_iso3, country_name, occupation_code, occupation_name,
               arg_min({column}, year) AS first_value,
               min(year) AS first_year,
               arg_max({column}, year) AS last_value,
               max(year) AS last_year,
               count(*) AS observations
        FROM salary
        WHERE {' AND '.join(clauses)}
        GROUP BY country_iso3, country_name, occupation_code, occupation_name
        HAVING count(*) >= 2
        ORDER BY country_iso3, occupation_code
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
        frame["note"] = "CAGR uses observed endpoints only; missing years are not interpolated."
    return envelope(
        records(frame),
        dataset="salary",
        filters={
            "countries": country_list or "all",
            "occupations": occupation_list or "all",
            "basis": basis,
            "start": start,
            "end": end,
        },
        units=["% compound annual growth"],
        source_note=SOURCE_NOTE,
        extra_meta={"value_column": column, "value_label": label},
    )


@router.get("/coverage")
def coverage() -> dict[str, Any]:
    matrix = metadata().get("coverage", {}).get("salary_matrix", [])
    return envelope(
        matrix,
        dataset="salary",
        source_note="Country–occupation earnings coverage. Canada uses ISCO-88; Japan is unavailable.",
        units=["observations"],
    )
