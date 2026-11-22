"""
Beyond Borders — forecast generation and validation.

Forecasts are produced only from observed annual series that:
  * contain at least 8 annual observations;
  * are consecutive (no missing years);
  * end in 2021 or later.

Each candidate model is backtested on a holdout of the final 2-3 years.
Only series with a completed validation are written. Forecasts are stored in
forecast.parquet and are never merged into the historical datasets.

Run from backend/:
    .venv/Scripts/python.exe scripts/forecast.py
"""

from __future__ import annotations

import json
import math
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
FORECAST_START = 2025
FORECAST_END = 2030
MODEL_VERSION = "bb-forecast-1.0.0"
GENERATED_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
Z80 = 1.2815515655446004


def log(message: str) -> None:
    print(f"[forecast] {message}", flush=True)


def ets_fit(values: np.ndarray):
    series = pd.Series(values, dtype="float64")
    model = ExponentialSmoothing(
        series,
        trend="add",
        damped_trend=True,
        seasonal=None,
        initialization_method="estimated",
    )
    return model.fit(optimized=True, use_brute=False)


def forecast_ets(values: np.ndarray, steps: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str, np.ndarray]:
    result = ets_fit(values)
    point = np.asarray(result.forecast(steps), dtype="float64")
    fitted = np.asarray(result.fittedvalues, dtype="float64")
    residuals = values - fitted
    sigma = float(np.nanstd(residuals, ddof=1))
    if not np.isfinite(sigma) or sigma <= 0:
        sigma = max(abs(float(np.nanmean(values))) * 0.02, 1e-9)
    h = np.arange(1, steps + 1, dtype="float64")
    width = Z80 * sigma * np.sqrt(h)
    lower = point - width
    upper = point + width
    return point, lower, upper, "ETS(A,Ad,N)", residuals


def forecast_linear(values: np.ndarray, steps: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str, np.ndarray]:
    n = len(values)
    x = np.arange(n, dtype="float64")
    slope, intercept = np.polyfit(x, values, 1)
    fitted = intercept + slope * x
    residuals = values - fitted
    dof = max(n - 2, 1)
    sigma = float(np.sqrt(np.sum(residuals**2) / dof))
    x_new = np.arange(n, n + steps, dtype="float64")
    point = intercept + slope * x_new
    denom = float(np.sum((x - x.mean()) ** 2))
    se = sigma * np.sqrt(1.0 + 1.0 / n + ((x_new - x.mean()) ** 2) / denom) if denom else np.full(steps, sigma)
    width = Z80 * se
    return point, point - width, point + width, "OLS linear trend", residuals


def make_forecast(values: np.ndarray, steps: int):
    try:
        return forecast_ets(values, steps)
    except Exception:  # noqa: BLE001 - fall back to a simpler validated model
        return forecast_linear(values, steps)


def validate_series(values: np.ndarray) -> dict[str, Any]:
    """Holdout validation: final 2-3 years held out, rest used for training."""
    n = len(values)
    holdout = 3 if n >= 11 else 2
    train = values[:-holdout]
    test = values[-holdout:]
    if len(train) < 8:
        return {"status": "insufficient_validation", "mape": math.nan, "rmse": math.nan, "n": 0, "coverage": math.nan}
    point, lower, upper, _, _ = make_forecast(train, holdout)
    errors = test - point
    rmse = float(np.sqrt(np.mean(errors**2)))
    mask = test != 0
    mape = float(np.mean(np.abs(errors[mask] / test[mask])) * 100.0) if mask.any() else math.nan
    coverage = float(np.mean((test >= lower) & (test <= upper)) * 100.0)
    if np.isfinite(mape):
        if mape <= 10:
            status = "validated"
        elif mape <= 25:
            status = "moderate_error"
        else:
            status = "high_error"
    else:
        denom = float(np.mean(np.abs(test))) or 1.0
        rel = rmse / denom
        status = "validated" if rel <= 0.10 else "moderate_error" if rel <= 0.25 else "high_error"
    return {
        "status": status,
        "mape": round(mape, 2) if np.isfinite(mape) else math.nan,
        "rmse": round(rmse, 4),
        "n": holdout,
        "coverage": round(coverage, 1),
    }


def rolling_origin_validate(
    values: np.ndarray,
    min_observations: int = 8,
    min_train: int = 8,
    n_rolls: int | None = None,
) -> list[dict[str, Any]]:
    """Rolling-origin (time series cross-validation) evaluation.

    For each roll i:
      - Train on values[0 : n - n_rolls + i]
      - Test on values[n - n_rolls + i : n - n_rolls + i + 1] (one-step-ahead)
    Returns list of per-roll validation results.

    The number of rolls is `n - min_observations - min_train + 1`, so that the
    final training window has at least min_observations points and each test
    period is at least 1 point.
    """
    n = len(values)
    required = min_observations + min_train - 1
    if n < required:
        return []

    n_rolls = n_rolls or (n - min_observations - min_train + 1)
    n_rolls = min(n_rolls, n - min_observations)

    results: list[dict[str, Any]] = []
    for i in range(n_rolls):
        # Training window: values[0 : n - n_rolls + i]
        train_end = n - n_rolls + i
        train = values[:train_end]
        test_start = train_end
        test_end = train_end + 1
        test = values[test_start:test_end]

        if len(train) < min_train:
            break

        point, lower, upper, _, _ = make_forecast(train, 1)
        if point is None or not np.isfinite(float(point)):
            results.append(
                {
                    "mape": math.nan,
                    "rmse": math.nan,
                    "coverage": math.nan,
                    "status": "insufficient_validation",
                }
            )
            continue

        error = float(test[0]) - float(point)
        rmse = float(abs(error))
        mask = test != 0
        mape = float(np.abs(error / test[0]) * 100.0) if mask.any() else math.nan

        if np.isfinite(mape):
            if mape <= 10:
                status = "validated"
            elif mape <= 25:
                status = "moderate_error"
            else:
                status = "high_error"
        else:
            denom = abs(float(test[0])) or 1.0
            rel = rmse / denom
            status = "validated" if rel <= 0.10 else "moderate_error" if rel <= 0.25 else "high_error"

        results.append(
            {
                "mape": round(mape, 2) if np.isfinite(mape) else math.nan,
                "rmse": round(rmse, 4),
                "status": status,
            }
        )

    return results


def clean_series(frame: pd.DataFrame, value_col: str) -> tuple[np.ndarray, np.ndarray] | None:
    subset = frame.dropna(subset=[value_col, "year"]).sort_values("year")
    if subset.empty:
        return None
    years = subset["year"].to_numpy(dtype=int)
    values = subset[value_col].to_numpy(dtype="float64")
    mask = np.isfinite(values)
    years, values = years[mask], values[mask]
    if len(values) < 8:
        return None
    if years[-1] < 2021:
        return None
    if np.any(np.diff(years) != 1):
        return None
    return years, values


def build_rows(
    years: np.ndarray,
    values: np.ndarray,
    *,
    dataset: str,
    country_iso3: str,
    country_name: str,
    sector_id: str,
    sector_name: str,
    occupation_code: str,
    occupation_name: str,
    indicator_id: str,
    indicator_name: str,
    indicator_unit: str,
    series_label: str,
    granularity: str,
    source_name: str,
    source_url: str,
) -> list[dict[str, Any]]:
    last_year = int(years[-1])
    if last_year >= FORECAST_END:
        return []
    steps = FORECAST_END - last_year
    validation = validate_series(values)
    if validation["status"] == "insufficient_validation":
        return []
    point, lower, upper, model_name, _ = make_forecast(values, steps)
    rows: list[dict[str, Any]] = []
    for offset in range(steps):
        target_year = last_year + 1 + offset
        if target_year < FORECAST_START or target_year > FORECAST_END:
            continue
        predicted = float(point[offset])
        low = float(lower[offset])
        high = float(upper[offset])
        # Series in this project are non-negative by construction.
        if np.nanmin(values) >= 0:
            low = max(0.0, low)
            high = max(0.0, high)
        if not np.isfinite(predicted):
            continue
        rows.append(
            {
                "country_iso3": country_iso3,
                "country_name": country_name,
                "sector_id": sector_id,
                "occupation_code": occupation_code,
                "occupation_name": occupation_name,
                "indicator_id": indicator_id,
                "target_year": target_year,
                "predicted_value": predicted,
                "lower_interval": low,
                "upper_interval": high,
                "model_name": model_name,
                "model_version": MODEL_VERSION,
                "forecast_origin": last_year,
                "training_end_year": last_year,
                "scenario": "baseline_trend",
                "validation_status": validation["status"],
                "validation_mape": validation["mape"],
                "validation_rmse": validation["rmse"],
                "validation_n": validation["n"],
                "validation_coverage_pct": validation["coverage"],
                "interval_method": "empirical_residual_80pct",
                "interval_level": 80,
                "series_label": series_label,
                "granularity": granularity,
                "dataset": dataset,
                "indicator_name": indicator_name,
                "indicator_unit": indicator_unit,
                "sector_name": sector_name,
                "source_name": source_name,
                "source_url": source_url,
                "generated_at": GENERATED_AT,
            }
        )
    return rows


def forecast_employment(rows: list[dict[str, Any]]) -> int:
    frame = pd.read_parquet(PROCESSED / "employment.parquet")
    count = 0
    group_cols = [
        "mapping_granularity",
        "country_iso3",
        "country_name",
        "sector_id",
        "sector_name",
        "occupation_code",
        "occupation_name",
    ]
    for keys, group in frame.groupby(group_cols, sort=False):
        granularity, iso3, country, sector_id, sector_name, occ_code, occ_name = keys
        cleaned = clean_series(group, "employment")
        if not cleaned:
            continue
        years, values = cleaned
        label = f"{country} · {sector_name} · {occ_name} — employment"
        new_rows = build_rows(
            years,
            values,
            dataset="employment",
            country_iso3=str(iso3),
            country_name=str(country),
            sector_id=str(sector_id),
            sector_name=str(sector_name),
            occupation_code=str(occ_code),
            occupation_name=str(occ_name),
            indicator_id="employment",
            indicator_name="Employment",
            indicator_unit="thousands of persons",
            series_label=label,
            granularity=str(granularity),
            source_name="ILOSTAT — International Labour Organization",
            source_url=str(group["source_url"].iloc[0]),
        )
        rows.extend(new_rows)
        count += len(new_rows)
    return count


def forecast_salary(rows: list[dict[str, Any]]) -> int:
    frame = pd.read_parquet(PROCESSED / "salary.parquet")
    count = 0
    variants = [
        ("salary_mean", "Mean monthly earnings, nominal", "local currency per month", "salary_mean"),
        ("salary_real_2010", "Mean monthly earnings, real (2010 prices)", "2010 local currency per month", "salary_real_2010"),
        ("salary_ppp_intl", "Mean monthly earnings, PPP-adjusted", "international $ per month", "salary_ppp_intl"),
    ]
    for keys, group in frame.groupby(
        ["country_iso3", "country_name", "occupation_code", "occupation_name"], sort=False
    ):
        iso3, country, occ_code, occ_name = keys
        for indicator_id, indicator_name, unit, column in variants:
            cleaned = clean_series(group, column)
            if not cleaned:
                continue
            years, values = cleaned
            label = f"{country} · {occ_name} — {indicator_name.lower()}"
            new_rows = build_rows(
                years,
                values,
                dataset="salary",
                country_iso3=str(iso3),
                country_name=str(country),
                sector_id="ALL",
                sector_name="All sectors",
                occupation_code=str(occ_code),
                occupation_name=str(occ_name),
                indicator_id=indicator_id,
                indicator_name=indicator_name,
                indicator_unit=unit,
                series_label=label,
                granularity="country_occupation",
                source_name="ILOSTAT — International Labour Organization",
                source_url=str(group["source_url"].iloc[0]),
            )
            rows.extend(new_rows)
            count += len(new_rows)
    return count


def forecast_country_sector(rows: list[dict[str, Any]]) -> int:
    frame = pd.read_parquet(PROCESSED / "country_sector.parquet")
    count = 0
    for keys, group in frame.groupby(
        ["country_iso3", "country_name", "sector_id", "sector_name", "indicator_id", "indicator_name", "indicator_unit"],
        sort=False,
    ):
        iso3, country, sector_id, sector_name, indicator_id, indicator_name, unit = keys
        cleaned = clean_series(group, "indicator_value")
        if not cleaned:
            continue
        years, values = cleaned
        label = f"{country} · {sector_name} — {indicator_name}"
        new_rows = build_rows(
            years,
            values,
            dataset="country_sector",
            country_iso3=str(iso3),
            country_name=str(country),
            sector_id=str(sector_id),
            sector_name=str(sector_name),
            occupation_code="ALL",
            occupation_name="All occupations",
            indicator_id=str(indicator_id),
            indicator_name=str(indicator_name),
            indicator_unit=str(unit),
            series_label=label,
            granularity="country_sector",
            source_name="World Bank — World Development Indicators",
            source_url=str(group["source_url"].iloc[0]),
        )
        rows.extend(new_rows)
        count += len(new_rows)
    return count


def forecast_living_cost(rows: list[dict[str, Any]]) -> int:
    frame = pd.read_parquet(PROCESSED / "living_cost.parquet")
    count = 0
    for keys, group in frame.groupby(
        ["country_iso3", "country_name", "expense_category", "expense_label", "expense_unit"],
        sort=False,
    ):
        iso3, country, category, label_name, unit = keys
        cleaned = clean_series(group, "expense_value")
        if not cleaned:
            continue
        years, values = cleaned
        label = f"{country} — {label_name}"
        new_rows = build_rows(
            years,
            values,
            dataset="living_cost",
            country_iso3=str(iso3),
            country_name=str(country),
            sector_id="ALL",
            sector_name="All sectors",
            occupation_code="ALL",
            occupation_name="All occupations",
            indicator_id=str(category),
            indicator_name=str(label_name),
            indicator_unit=str(unit),
            series_label=label,
            granularity="country",
            source_name="World Bank — World Development Indicators",
            source_url=str(group["source_url"].iloc[0]),
        )
        rows.extend(new_rows)
        count += len(new_rows)
    return count


def main() -> int:
    if not (PROCESSED / "employment.parquet").exists():
        raise SystemExit("Historical datasets not found. Run scripts/ingest.py first.")

    rows: list[dict[str, Any]] = []
    counts = {
        "employment": forecast_employment(rows),
        "salary": forecast_salary(rows),
        "country_sector": forecast_country_sector(rows),
        "living_cost": forecast_living_cost(rows),
    }
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise SystemExit("No series met the forecasting and validation requirements.")

    frame = frame.sort_values(
        ["dataset", "country_iso3", "sector_id", "occupation_code", "indicator_id", "target_year"]
    ).reset_index(drop=True)
    frame.to_parquet(PROCESSED / "forecast.parquet", index=False)
    frame.to_csv(PROCESSED / "forecast.csv", index=False, encoding="utf-8")

    status_counts = frame.groupby(["dataset", "validation_status"]).size().unstack(fill_value=0)
    summary = {
        "generated_at": GENERATED_AT,
        "model_version": MODEL_VERSION,
        "forecast_period": [FORECAST_START, FORECAST_END],
        "rows": int(len(frame)),
        "series": int(
            frame.groupby(["dataset", "country_iso3", "sector_id", "occupation_code", "indicator_id", "granularity"]).ngroups
        ),
        "by_dataset": {k: int(v) for k, v in counts.items()},
        "by_status": {k: int(v) for k, v in frame["validation_status"].value_counts().items()},
        "status_table": {
            str(index): {str(col): int(value) for col, value in row.items()}
            for index, row in status_counts.iterrows()
        },
        "method": {
            "model": "Holt damped additive trend (ETS A,Ad,N); OLS linear-trend fallback",
            "validation": "Holdout of the final 2–3 annual observations; MAPE and RMSE reported per series.",
            "intervals": "80% empirical residual intervals, widening with sqrt(horizon).",
            "status_rules": {
                "validated": "holdout MAPE <= 10%",
                "moderate_error": "holdout MAPE 10–25%",
                "high_error": "holdout MAPE > 25%",
            },
            "eligibility": ">=8 consecutive annual observations; last observation in 2021 or later; completed holdout validation.",
            "scenario": "baseline_trend — no policy or technology scenario is assumed.",
        },
        "notes": [
            "Forecasts are model outputs, not observations.",
            "Series with insufficient history, gaps, or a last observation before 2021 are not forecast.",
            "Intervals reflect historical residual uncertainty only; they do not include structural breaks or policy change.",
        ],
    }
    (PROCESSED / "forecast_metadata.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    log(f"wrote forecast.parquet: {len(frame):,} rows, {summary['series']:,} series")
    log(f"by dataset: {counts}")
    log(f"by validation status: {summary['by_status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
