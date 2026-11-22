"""
Beyond Borders — research data ingestion.

Pulls real observations from the World Bank WDI API and the ILOSTAT API,
maps them to the five research datasets defined in the project brief, and
writes both Parquet (analytical) and CSV (portable) outputs.

Design rules enforced here:
  * no synthetic or imputed observations;
  * missing source values are dropped, never replaced with zero;
  * every row carries source, URL and observation status;
  * sector mappings are explicit and marked as proxies where the source
    classification cannot isolate the sector.

Run from backend/:
    .venv/Scripts/python.exe scripts/ingest.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)

START_YEAR = 2010
END_YEAR = 2024
RETRIEVED_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

COUNTRIES = [
    {"iso3": "IND", "name": "India", "currency": "INR", "region": "South Asia"},
    {"iso3": "DEU", "name": "Germany", "currency": "EUR", "region": "Europe"},
    {"iso3": "CAN", "name": "Canada", "currency": "CAD", "region": "North America"},
    {"iso3": "USA", "name": "United States", "currency": "USD", "region": "North America"},
    {"iso3": "GBR", "name": "United Kingdom", "currency": "GBP", "region": "Europe"},
    {"iso3": "JPN", "name": "Japan", "currency": "JPY", "region": "East Asia"},
]
COUNTRY_BY_ISO = {c["iso3"]: c for c in COUNTRIES}
ISO_LIST = [c["iso3"] for c in COUNTRIES]

SECTORS = [
    {
        "id": "semiconductors",
        "name": "Semiconductors and Electronics",
        "short": "Semiconductors",
        "description": "Electronic components, computing hardware and semiconductor supply chains.",
    },
    {
        "id": "ai_software",
        "name": "AI and Software",
        "short": "AI & Software",
        "description": "Software production, ICT services and research intensity relevant to AI.",
    },
    {
        "id": "renewable_energy",
        "name": "Renewable Energy",
        "short": "Renewable Energy",
        "description": "Renewable energy consumption and low-carbon electricity supply.",
    },
    {
        "id": "automotive_ev",
        "name": "Automotive and Electric Vehicles",
        "short": "Automotive & EV",
        "description": "Motor-vehicle manufacturing, distribution and electrification capacity.",
    },
    {
        "id": "healthcare_biotech",
        "name": "Healthcare and Biotechnology",
        "short": "Healthcare & Biotech",
        "description": "Health expenditure, health-sector employment and biomedical research.",
    },
]
SECTOR_BY_ID = {s["id"]: s for s in SECTORS}

OCCUPATIONS = [
    ("OCU_ISCO08_TOTAL", "TOTAL", "All occupations"),
    ("OCU_ISCO08_1", "1", "Managers"),
    ("OCU_ISCO08_2", "2", "Professionals"),
    ("OCU_ISCO08_3", "3", "Technicians and associate professionals"),
    ("OCU_ISCO08_4", "4", "Clerical support workers"),
    ("OCU_ISCO08_5", "5", "Service and sales workers"),
    ("OCU_ISCO08_6", "6", "Skilled agricultural, forestry and fishery workers"),
    ("OCU_ISCO08_7", "7", "Craft and related trades workers"),
    ("OCU_ISCO08_8", "8", "Plant and machine operators, and assemblers"),
    ("OCU_ISCO08_9", "9", "Elementary occupations"),
]
OCC_CODE = {c: (code, name) for c, code, name in OCCUPATIONS}
OCC_FILTER = [c for c, _, _ in OCCUPATIONS]
OCC88_CODE = {
    f"OCU_ISCO88_{code}": (code, name)
    for code, name in [
        ("TOTAL", "All occupations"),
        ("1", "Managers"),
        ("2", "Professionals"),
        ("3", "Technicians and associate professionals"),
        ("4", "Clerical support workers"),
        ("5", "Service and sales workers"),
        ("6", "Skilled agricultural, forestry and fishery workers"),
        ("7", "Craft and related trades workers"),
        ("8", "Plant and machine operators, and assemblers"),
        ("9", "Elementary occupations"),
    ]
}
OCC88_FILTER = list(OCC88_CODE.keys())

# ---------------------------------------------------------------------------
# Sector indicator definitions (World Bank WDI)
# ---------------------------------------------------------------------------

SECTOR_INDICATORS = [
    {
        "code": "TX.VAL.TECH.CD",
        "sector": "semiconductors",
        "name": "High-technology exports",
        "unit": "current US$",
        "role": "output",
        "is_proxy": True,
        "note": "World Bank high-technology exports. A broad trade proxy for electronics and semiconductor export capacity; it is not semiconductor output.",
    },
    {
        "code": "IP.PAT.RESD",
        "sector": "semiconductors",
        "name": "Patent applications, residents",
        "unit": "applications",
        "role": "innovation",
        "is_proxy": True,
        "note": "Resident patent applications. An innovation-capacity context indicator, not a semiconductor production measure.",
    },
    {
        "code": "BX.GSR.CCIS.CD",
        "sector": "ai_software",
        "name": "ICT service exports",
        "unit": "current US$",
        "role": "output",
        "is_proxy": True,
        "note": "ICT service exports (BoP). A trade proxy for software and ICT service capability, not AI output.",
    },
    {
        "code": "GB.XPD.RSDV.GD.ZS",
        "sector": "ai_software",
        "name": "Research and development expenditure",
        "unit": "% of GDP",
        "role": "investment",
        "is_proxy": True,
        "note": "Economy-wide R&D expenditure. An investment-context proxy, not sector-specific AI investment.",
    },
    {
        "code": "EG.FEC.RNEW.ZS",
        "sector": "renewable_energy",
        "name": "Renewable energy consumption",
        "unit": "% of final energy consumption",
        "role": "output",
        "is_proxy": False,
        "note": "Share of final energy consumption from renewable sources (World Bank/WDI).",
    },
    {
        "code": "EG.ELC.RNEW.ZS",
        "sector": "renewable_energy",
        "name": "Renewable electricity output",
        "unit": "% of total electricity output",
        "role": "output",
        "is_proxy": False,
        "note": "Share of electricity generated from renewable sources (World Bank/WDI).",
    },
    {
        "code": "NV.IND.MANF.CD",
        "sector": "automotive_ev",
        "name": "Manufacturing value added",
        "unit": "current US$",
        "role": "output",
        "is_proxy": True,
        "note": "Total manufacturing value added. A broad proxy for automotive production capacity; it includes all manufacturing.",
    },
    {
        "code": "NE.GDI.FTOT.ZS",
        "sector": "automotive_ev",
        "name": "Gross fixed capital formation",
        "unit": "% of GDP",
        "role": "investment",
        "is_proxy": True,
        "note": "Economy-wide gross fixed capital formation. Investment context only; announced and realized automotive investment are not available.",
    },
    {
        "code": "SH.XPD.CHEX.GD.ZS",
        "sector": "healthcare_biotech",
        "name": "Current health expenditure",
        "unit": "% of GDP",
        "role": "output",
        "is_proxy": False,
        "note": "Current health expenditure as a share of GDP (World Bank/WDI, WHO GHED).",
    },
    {
        "code": "SH.XPD.CHEX.PC.CD",
        "sector": "healthcare_biotech",
        "name": "Current health expenditure per capita",
        "unit": "current US$ per capita",
        "role": "output",
        "is_proxy": False,
        "note": "Current health expenditure per capita (World Bank/WDI, WHO GHED).",
    },
]

CONTEXT_INDICATORS = [
    ("NY.GDP.MKTP.CD", "GDP", "current US$"),
    ("NY.GDP.PCAP.CD", "GDP per capita", "current US$"),
    ("SP.POP.TOTL", "Population", "persons"),
    ("SL.UEM.TOTL.ZS", "Unemployment rate", "% of labour force"),
    ("SL.TLF.CACT.ZS", "Labour force participation rate", "% of population 15+"),
    ("FP.CPI.TOTL", "Consumer price index", "index (2010 = 100)"),
    ("PA.NUS.PRVT.PP", "PPP conversion factor, private consumption", "LCU per international $"),
    ("PA.NUS.PPP", "PPP conversion factor, GDP", "LCU per international $"),
    ("NE.CON.PRVT.PC.KD", "Household consumption per capita", "constant 2015 US$"),
    ("FP.CPI.TOTL.ZG", "Inflation, consumer prices", "% annual"),
]

WB_INDICATOR_NAMES = {
    code: name for code, name, _ in CONTEXT_INDICATORS
}
WB_INDICATOR_UNITS = {code: unit for code, _, unit in CONTEXT_INDICATORS}
for item in SECTOR_INDICATORS:
    WB_INDICATOR_NAMES[item["code"]] = item["name"]
    WB_INDICATOR_UNITS[item["code"]] = item["unit"]

WB_API = "https://api.worldbank.org/v2"
ILO_API = "https://rplumber.ilo.org/data/indicator"

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "BeyondBorders-Research/1.0 (academic data visualisation project)",
        "Accept": "application/json,text/csv,*/*",
    }
)


def log(message: str) -> None:
    print(f"[ingest] {message}", flush=True)


def get_json(url: str, params: dict[str, Any] | None = None, attempts: int = 4) -> Any:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            response = SESSION.get(url, params=params, timeout=90)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001 - retry network failures
            last = exc
            log(f"retry {attempt + 1}/{attempts}: {exc}")
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Request failed: {url} ({last})")


def get_csv(url: str, params: dict[str, Any] | None = None, attempts: int = 4) -> pd.DataFrame:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            response = SESSION.get(url, params=params, timeout=180)
            response.raise_for_status()
            from io import StringIO

            text = response.content.decode("utf-8-sig")
            if not text.strip():
                return pd.DataFrame()
            return pd.read_csv(StringIO(text), dtype=str)
        except Exception as exc:  # noqa: BLE001
            last = exc
            log(f"retry {attempt + 1}/{attempts}: {exc}")
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"CSV request failed: {url} ({last})")


# ---------------------------------------------------------------------------
# World Bank
# ---------------------------------------------------------------------------


def fetch_world_bank_indicator(code: str) -> pd.DataFrame:
    cache = RAW / f"wb_{code}.csv"
    if cache.exists():
        log(f"cache hit wb {code}")
        return pd.read_csv(cache, dtype={"country_iso3": str})
    log(f"fetching World Bank {code}")
    payload = get_json(
        f"{WB_API}/country/{';'.join(ISO_LIST)}/indicator/{code}",
        params={
            "format": "json",
            "per_page": 20000,
            "date": f"{START_YEAR}:{END_YEAR}",
        },
    )
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"Unexpected World Bank payload for {code}")
    rows = []
    for item in payload[1]:
        if item.get("value") is None:
            continue
        iso3 = (item.get("countryiso3code") or "").strip()
        if iso3 not in COUNTRY_BY_ISO:
            continue
        try:
            year = int(item["date"])
        except (TypeError, ValueError):
            continue
        if year < START_YEAR or year > END_YEAR:
            continue
        rows.append(
            {
                "country_iso3": iso3,
                "year": year,
                "indicator_id": code,
                "value": float(item["value"]),
                "obs_status": item.get("obs_status") or "",
            }
        )
    frame = pd.DataFrame(rows)
    frame.to_csv(cache, index=False, encoding="utf-8")
    return frame


def fetch_all_world_bank() -> dict[str, pd.DataFrame]:
    codes = list(dict.fromkeys([i["code"] for i in SECTOR_INDICATORS] + [c for c, _, _ in CONTEXT_INDICATORS]))
    result: dict[str, pd.DataFrame] = {}
    for code in codes:
        result[code] = fetch_world_bank_indicator(code)
    return result


# ---------------------------------------------------------------------------
# ILOSTAT
# ---------------------------------------------------------------------------


def ilo_url(indicator: str) -> str:
    return f"https://rplumber.ilo.org/dataexplorer/?id={indicator}&lang=en"


def fetch_ilo(
    indicator: str,
    *,
    classif1: list[str] | None = None,
    classif2: list[str] | None = None,
    cache_name: str | None = None,
) -> pd.DataFrame:
    cache = RAW / f"ilo_{cache_name or indicator}.csv"
    if cache.exists():
        log(f"cache hit ilo {cache_name or indicator}")
        return pd.read_csv(cache, dtype=str)
    log(f"fetching ILOSTAT {indicator} {cache_name or ''}")
    params: dict[str, Any] = {
        "id": indicator,
        "ref_area": "+".join(ISO_LIST),
        "sex": "SEX_T",
        "timefrom": str(START_YEAR),
        "timeto": str(END_YEAR),
        "format": "csv",
        "best_source": "yes",
    }
    if classif1:
        params["classif1"] = "+".join(classif1)
    if classif2:
        params["classif2"] = "+".join(classif2)
    frame = get_csv(ILO_API, params=params)
    frame.to_csv(cache, index=False, encoding="utf-8")
    return frame


def prepare_ilo(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    frame = frame.copy()
    frame.columns = [c.strip().lstrip("\ufeff") for c in frame.columns]
    for col in ("ref_area", "classif1", "classif2", "time", "obs_value"):
        if col not in frame.columns:
            frame[col] = ""
    frame["year"] = pd.to_numeric(frame["time"], errors="coerce")
    frame["value"] = pd.to_numeric(frame["obs_value"], errors="coerce")
    frame = frame.dropna(subset=["year", "value"])
    frame["year"] = frame["year"].astype(int)
    frame = frame[frame["ref_area"].isin(ISO_LIST)]
    # One observation per country/classification/year. The API's best_source
    # option already selects a preferred source; keep the first non-null.
    frame = frame.drop_duplicates(
        subset=["ref_area", "classif1", "classif2", "year"], keep="first"
    )
    return frame


# ---------------------------------------------------------------------------
# Dataset builders
# ---------------------------------------------------------------------------


def build_country_sector(wb: dict[str, pd.DataFrame]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for item in SECTOR_INDICATORS:
        frame = wb.get(item["code"], pd.DataFrame())
        if frame.empty:
            continue
        sector = SECTOR_BY_ID[item["sector"]]
        source_url = f"https://data.worldbank.org/indicator/{item['code']}"
        api_url = (
            f"{WB_API}/country/{';'.join(ISO_LIST)}/indicator/{item['code']}"
            f"?format=json&date={START_YEAR}:{END_YEAR}"
        )
        for _, row in frame.iterrows():
            iso3 = row["country_iso3"]
            country = COUNTRY_BY_ISO[iso3]
            rows.append(
                {
                    "country_iso3": iso3,
                    "country_name": country["name"],
                    "sector_id": sector["id"],
                    "sector_name": sector["name"],
                    "year": int(row["year"]),
                    "industrial_output": float(row["value"]) if item["role"] == "output" else math.nan,
                    "industrial_output_unit": item["unit"] if item["role"] == "output" else "",
                    "output_growth": math.nan,
                    "investment_announced": math.nan,
                    "investment_realized": math.nan,
                    "investment_currency": "",
                    "capacity_addition": math.nan,
                    "capacity_unit": "",
                    "source_name": "World Bank — World Development Indicators",
                    "source_url": source_url,
                    "observation_status": "observed_proxy_indicator" if item["is_proxy"] else "observed",
                    "indicator_id": item["code"],
                    "indicator_name": item["name"],
                    "indicator_role": item["role"],
                    "indicator_value": float(row["value"]),
                    "indicator_unit": item["unit"],
                    "is_proxy": bool(item["is_proxy"]),
                    "proxy_note": item["note"],
                    "api_url": api_url,
                    "retrieved_at": RETRIEVED_AT,
                }
            )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame = frame.sort_values(
        ["sector_id", "indicator_id", "country_iso3", "year"]
    ).reset_index(drop=True)
    # Year-over-year growth for output indicators only, computed within a
    # complete country-sector-indicator series. No gap filling.
    frame["output_growth"] = math.nan
    for (iso3, sector_id, indicator_id), group in frame.groupby(
        ["country_iso3", "sector_id", "indicator_id"], sort=False
    ):
        group = group.sort_values("year")
        if not group["indicator_role"].eq("output").all():
            continue
        values = group.set_index("year")["indicator_value"]
        growth = values.pct_change(fill_method=None) * 100.0
        for year, value in growth.items():
            if pd.notna(value):
                frame.loc[
                    (frame["country_iso3"] == iso3)
                    & (frame["sector_id"] == sector_id)
                    & (frame["indicator_id"] == indicator_id)
                    & (frame["year"] == year),
                    "output_growth",
                ] = float(value)
    return frame


def build_employment(
    section_frame: pd.DataFrame,
    division_frame: pd.DataFrame,
    canada_frame: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    section_map = {
        "ECO_ISIC4_C": ("semiconductors", "C", "C. Manufacturing", "Broad manufacturing proxy; cannot isolate semiconductors."),
        "ECO_ISIC4_J": ("ai_software", "J", "J. Information and communication", "Broad ICT proxy; includes telecommunications and publishing."),
        "ECO_ISIC4_D": ("renewable_energy", "D", "D. Electricity, gas, steam and air conditioning supply", "All electricity supply; cannot isolate renewables."),
        "ECO_ISIC4_G": ("automotive_ev", "G", "G. Wholesale and retail trade; repair of motor vehicles and motorcycles", "Trade and repair proxy; excludes vehicle manufacturing."),
        "ECO_ISIC4_Q": ("healthcare_biotech", "Q", "Q. Human health and social work activities", "Broad health-sector proxy; includes social work."),
    }
    division_map = {
        "EC2_ISIC4_C26": ("semiconductors", "C26", "C26. Manufacture of computer, electronic and optical products", "Division-level electronics manufacturing; still broader than semiconductors."),
        "EC2_ISIC4_J62": ("ai_software", "J62", "J62. Computer programming, consultancy and related activities", "Division-level software services; excludes AI research in other industries."),
        "EC2_ISIC4_D35": ("renewable_energy", "D35", "D35. Electricity, gas, steam and air conditioning supply", "All electricity supply; cannot isolate renewables."),
        "EC2_ISIC4_C29": ("automotive_ev", "C29", "C29. Manufacture of motor vehicles, trailers and semi-trailers", "Division-level vehicle manufacturing; includes non-electric vehicles."),
        "EC2_ISIC4_Q86": ("healthcare_biotech", "Q86", "Q86. Human health activities", "Division-level human health activities; excludes social work."),
    }
    canada_map = {
        "ECO_ISIC3_D": ("semiconductors", "D", "D. Manufacturing (ISIC Rev.3)", "Canada reports ISIC Rev.3; manufacturing is a broad proxy for electronics production."),
        "ECO_ISIC3_E": ("renewable_energy", "E", "E. Electricity, gas and water supply (ISIC Rev.3)", "Canada reports ISIC Rev.3; all electricity supply, not renewables alone."),
        "ECO_ISIC3_N": ("healthcare_biotech", "N", "N. Health and social work (ISIC Rev.3)", "Canada reports ISIC Rev.3; health and social work, broader than healthcare."),
    }

    def add_rows(
        frame: pd.DataFrame,
        mapping: dict[str, tuple[str, str, str, str]],
        granularity: str,
        source_indicator: str,
        classification_system: str,
        occ_lookup: dict[str, tuple[str, str]],
        occ_classification: str,
        mapping_quality: str,
        observation_status: str,
        division_layout: bool = False,
    ) -> None:
        if frame.empty:
            return
        for _, row in frame.iterrows():
            industry_code = str(row.get("classif1") or "")
            occ_code_raw = str(row.get("classif2") or "")
            if division_layout:
                # EC2 dataset: classif1 = occupation, classif2 = industry
                industry_code = str(row.get("classif2") or "")
                occ_code_raw = str(row.get("classif1") or "")
            if industry_code not in mapping or occ_code_raw not in occ_lookup:
                continue
            sector_id, short_code, industry_name, note = mapping[industry_code]
            sector = SECTOR_BY_ID[sector_id]
            occ_code, occ_name = occ_lookup[occ_code_raw]
            iso3 = str(row["ref_area"])
            country = COUNTRY_BY_ISO[iso3]
            rows.append(
                {
                    "country_iso3": iso3,
                    "country_name": country["name"],
                    "sector_id": sector_id,
                    "sector_name": sector["name"],
                    "occupation_code": occ_code,
                    "occupation_name": occ_name,
                    "year": int(row["year"]),
                    "employment": float(row["value"]),
                    "employment_unit": "thousands of persons",
                    "employment_growth": math.nan,
                    "vacancies": math.nan,
                    "vacancy_rate": math.nan,
                    "source_name": "ILOSTAT — International Labour Organization",
                    "source_url": ilo_url(source_indicator),
                    "observation_status": observation_status,
                    "industry_code": short_code,
                    "industry_name": industry_name,
                    "mapping_granularity": granularity,
                    "mapping_quality": mapping_quality,
                    "mapping_note": note,
                    "classification_system": classification_system,
                    "occupation_classification": occ_classification,
                    "api_url": f"{ILO_API}?id={source_indicator}",
                    "retrieved_at": RETRIEVED_AT,
                }
            )

    add_rows(
        prepare_ilo(section_frame), section_map, "section", "EMP_TEMP_ECO_OCU_NB_A",
        "ISIC Rev.4", OCC_CODE, "ISCO-08", "broad_proxy", "observed_proxy_mapping",
    )
    add_rows(
        prepare_ilo(division_frame), division_map, "division", "EMP_TEMP_SEX_OCU_EC2_NB_A",
        "ISIC Rev.4 (division)", OCC_CODE, "ISCO-08", "detailed_proxy", "observed_division_mapping",
        division_layout=True,
    )
    add_rows(
        prepare_ilo(canada_frame), canada_map, "section", "EMP_TEMP_ECO_OCU_NB_A",
        "ISIC Rev.3", OCC88_CODE, "ISCO-88", "broad_proxy_classification_variant",
        "observed_proxy_mapping",
    )

    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame = frame.sort_values(
        ["mapping_granularity", "sector_id", "country_iso3", "occupation_code", "year"]
    ).reset_index(drop=True)
    # Growth within a complete series. Missing years are left missing.
    for keys, group in frame.groupby(
        ["mapping_granularity", "country_iso3", "sector_id", "occupation_code"], sort=False
    ):
        group = group.sort_values("year")
        growth = group.set_index("year")["employment"].pct_change(fill_method=None) * 100.0
        for year, value in growth.items():
            if pd.notna(value):
                mask = (
                    (frame["mapping_granularity"] == keys[0])
                    & (frame["country_iso3"] == keys[1])
                    & (frame["sector_id"] == keys[2])
                    & (frame["occupation_code"] == keys[3])
                    & (frame["year"] == year)
                )
                frame.loc[mask, "employment_growth"] = float(value)
    return frame


def build_salary(
    mean_frame: pd.DataFrame,
    median_frame: pd.DataFrame,
    canada_mean_frame: pd.DataFrame,
    canada_median_frame: pd.DataFrame,
    wb: dict[str, pd.DataFrame],
) -> pd.DataFrame:
    batches = [
        (
            prepare_ilo(mean_frame),
            prepare_ilo(median_frame),
            OCC_CODE,
            "ISCO-08",
            "EAR_EMTA_SEX_OCU_NB_A",
        ),
        (
            prepare_ilo(canada_mean_frame),
            prepare_ilo(canada_median_frame),
            OCC88_CODE,
            "ISCO-88",
            "EAR_EMTA_SEX_OCU_NB_A",
        ),
    ]

    cpi = wb.get("FP.CPI.TOTL", pd.DataFrame())
    ppp = wb.get("PA.NUS.PRVT.PP", pd.DataFrame())
    cpi_map = {
        (r["country_iso3"], int(r["year"])): float(r["value"])
        for _, r in cpi.iterrows()
    } if not cpi.empty else {}
    ppp_map = {
        (r["country_iso3"], int(r["year"])): float(r["value"])
        for _, r in ppp.iterrows()
    } if not ppp.empty else {}

    rows: list[dict[str, Any]] = []
    for mean, median, occ_lookup, occ_classification, source_indicator in batches:
        if mean.empty:
            continue
        median_lookup: dict[tuple[str, str, int], float] = {}
        if not median.empty:
            for _, row in median.iterrows():
                occ = occ_lookup.get(str(row.get("classif1") or ""))
                if not occ:
                    continue
                median_lookup[(str(row["ref_area"]), occ[0], int(row["year"]))] = float(row["value"])

        for _, row in mean.iterrows():
            occ = occ_lookup.get(str(row.get("classif1") or ""))
            if not occ:
                continue
            occ_code, occ_name = occ
            iso3 = str(row["ref_area"])
            country = COUNTRY_BY_ISO[iso3]
            year = int(row["year"])
            mean_value = float(row["value"])
            cpi_value = cpi_map.get((iso3, year))
            ppp_value = ppp_map.get((iso3, year))
            real_value = mean_value / (cpi_value / 100.0) if cpi_value else math.nan
            ppp_value_converted = mean_value / ppp_value if ppp_value else math.nan
            notes = []
            if cpi_value:
                notes.append(f"Deflated with World Bank CPI (2010 = 100); expressed in 2010 {country['currency']}.")
            if ppp_value:
                notes.append(
                    f"Divided by World Bank PPP conversion factor for private consumption ({ppp_value:.3f} {country['currency']} per international $)."
                )
            rows.append(
                {
                    "country_iso3": iso3,
                    "country_name": country["name"],
                    "sector_id": "ALL",
                    "occupation_code": occ_code,
                    "occupation_name": occ_name,
                    "year": year,
                    "experience_level": "all",
                    "salary_mean": mean_value,
                    "salary_median": median_lookup.get((iso3, occ_code, year), math.nan),
                    "currency": country["currency"],
                    "pay_period": "monthly",
                    "gross_or_net": "gross",
                    "nominal_or_real": "nominal",
                    "source_name": "ILOSTAT — International Labour Organization",
                    "source_url": ilo_url(source_indicator),
                    "observation_status": "observed",
                    "occupation_classification": occ_classification,
                    "salary_real_2010": real_value,
                    "salary_ppp_intl": ppp_value_converted,
                    "conversion_note": " ".join(notes) if notes else "No CPI or PPP conversion available for this year.",
                    "api_url": f"{ILO_API}?id={source_indicator}",
                    "retrieved_at": RETRIEVED_AT,
                }
            )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    # Prefer ISCO-08 when both classifications are present for a country-year.
    frame["_pref"] = frame["occupation_classification"].map({"ISCO-08": 0, "ISCO-88": 1}).fillna(2)
    frame = (
        frame.sort_values(["country_iso3", "occupation_code", "year", "_pref"])
        .drop_duplicates(subset=["country_iso3", "occupation_code", "year"], keep="first")
        .drop(columns="_pref")
    )
    return frame.sort_values(
        ["country_iso3", "occupation_code", "year"]
    ).reset_index(drop=True)


def build_living_cost(wb: dict[str, pd.DataFrame]) -> pd.DataFrame:
    categories = {
        "FP.CPI.TOTL": (
            "consumer_price_index",
            "Consumer price index, all items",
            "index (2010 = 100)",
            "index",
            "All households",
        ),
        "FP.CPI.TOTL.ZG": (
            "consumer_price_inflation",
            "Consumer price inflation",
            "% annual",
            "%",
            "All households",
        ),
        "PA.NUS.PRVT.PP": (
            "ppp_private_consumption",
            "PPP conversion factor, private consumption",
            "LCU per international $",
            "LCU",
            "All households",
        ),
        "PA.NUS.PPP": (
            "ppp_gdp",
            "PPP conversion factor, GDP",
            "LCU per international $",
            "LCU",
            "All households",
        ),
        "NE.CON.PRVT.PC.KD": (
            "household_consumption_per_capita",
            "Household final consumption expenditure per capita",
            "constant 2015 US$",
            "USD",
            "All households",
        ),
    }
    rows: list[dict[str, Any]] = []
    for code, (category, label, unit, currency, profile) in categories.items():
        frame = wb.get(code, pd.DataFrame())
        if frame.empty:
            continue
        for _, row in frame.iterrows():
            iso3 = row["country_iso3"]
            country = COUNTRY_BY_ISO[iso3]
            rows.append(
                {
                    "country_iso3": iso3,
                    "country_name": country["name"],
                    "city": "National",
                    "year": int(row["year"]),
                    "expense_category": category,
                    "expense_label": label,
                    "expense_value": float(row["value"]),
                    "currency": currency,
                    "expense_unit": unit,
                    "household_profile": profile,
                    "source_name": "World Bank — World Development Indicators",
                    "source_url": f"https://data.worldbank.org/indicator/{code}",
                    "observation_status": "observed",
                    "indicator_id": code,
                    "api_url": f"{WB_API}/country/{';'.join(ISO_LIST)}/indicator/{code}",
                    "retrieved_at": RETRIEVED_AT,
                }
            )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    return frame.sort_values(
        ["expense_category", "country_iso3", "year"]
    ).reset_index(drop=True)


def build_context(wb: dict[str, pd.DataFrame]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for code, name, unit in CONTEXT_INDICATORS:
        frame = wb.get(code, pd.DataFrame())
        if frame.empty:
            continue
        for _, row in frame.iterrows():
            iso3 = row["country_iso3"]
            rows.append(
                {
                    "country_iso3": iso3,
                    "country_name": COUNTRY_BY_ISO[iso3]["name"],
                    "year": int(row["year"]),
                    "indicator_id": code,
                    "indicator_name": name,
                    "value": float(row["value"]),
                    "unit": unit,
                    "source_name": "World Bank — World Development Indicators",
                    "source_url": f"https://data.worldbank.org/indicator/{code}",
                    "retrieved_at": RETRIEVED_AT,
                }
            )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Coverage / metadata
# ---------------------------------------------------------------------------


def pct(part: float, whole: float) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def build_metadata(
    country_sector: pd.DataFrame,
    employment: pd.DataFrame,
    salary: pd.DataFrame,
    living_cost: pd.DataFrame,
) -> dict[str, Any]:
    years = list(range(START_YEAR, END_YEAR + 1))
    coverage: dict[str, Any] = {}

    def dataset_summary(frame: pd.DataFrame, value_col: str) -> dict[str, Any]:
        if frame.empty:
            return {"rows": 0, "countries": [], "sectors": [], "year_min": None, "year_max": None, "value_column": value_col}
        return {
            "rows": int(len(frame)),
            "countries": sorted(frame["country_iso3"].unique().tolist()),
            "sectors": sorted(frame["sector_id"].unique().tolist()) if "sector_id" in frame else [],
            "year_min": int(frame["year"].min()),
            "year_max": int(frame["year"].max()),
            "value_column": value_col,
        }

    coverage["country_sector"] = dataset_summary(country_sector, "indicator_value")
    coverage["employment"] = dataset_summary(employment, "employment")
    coverage["salary"] = dataset_summary(salary, "salary_mean")
    coverage["living_cost"] = dataset_summary(living_cost, "expense_value")

    # Country × sector availability for sector indicators.
    matrix = []
    for iso3 in ISO_LIST:
        for sector in SECTORS:
            subset = country_sector[
                (country_sector["country_iso3"] == iso3)
                & (country_sector["sector_id"] == sector["id"])
            ] if not country_sector.empty else pd.DataFrame()
            indicators = subset["indicator_id"].nunique() if not subset.empty else 0
            observed = len(subset)
            expected = indicators * len(years)
            matrix.append(
                {
                    "country_iso3": iso3,
                    "country_name": COUNTRY_BY_ISO[iso3]["name"],
                    "sector_id": sector["id"],
                    "sector_name": sector["name"],
                    "indicators": int(indicators),
                    "observations": int(observed),
                    "expected": int(expected),
                    "coverage_pct": pct(observed, expected),
                }
            )
    coverage["country_sector_matrix"] = matrix

    # Employment coverage by country × sector × granularity.
    emp_matrix = []
    if not employment.empty:
        for granularity in ["section", "division"]:
            for iso3 in ISO_LIST:
                for sector in SECTORS:
                    subset = employment[
                        (employment["mapping_granularity"] == granularity)
                        & (employment["country_iso3"] == iso3)
                        & (employment["sector_id"] == sector["id"])
                        & (employment["occupation_code"] != "TOTAL")
                    ]
                    emp_matrix.append(
                        {
                            "granularity": granularity,
                            "country_iso3": iso3,
                            "sector_id": sector["id"],
                            "observations": int(len(subset)),
                            "occupations": int(subset["occupation_code"].nunique()),
                            "year_min": int(subset["year"].min()) if not subset.empty else None,
                            "year_max": int(subset["year"].max()) if not subset.empty else None,
                            "status": "available" if not subset.empty else "not_available",
                        }
                    )
    coverage["employment_matrix"] = emp_matrix

    # Salary coverage by country × occupation.
    sal_matrix = []
    for iso3 in ISO_LIST:
        for occ_code, occ_name in [(c, n) for _, c, n in OCCUPATIONS]:
            subset = salary[
                (salary["country_iso3"] == iso3)
                & (salary["occupation_code"] == occ_code)
            ] if not salary.empty else pd.DataFrame()
            sal_matrix.append(
                {
                    "country_iso3": iso3,
                    "occupation_code": occ_code,
                    "occupation_name": occ_name,
                    "observations": int(len(subset)),
                    "year_min": int(subset["year"].min()) if not subset.empty else None,
                    "year_max": int(subset["year"].max()) if not subset.empty else None,
                    "status": "available" if not subset.empty else "not_available",
                }
            )
    coverage["salary_matrix"] = sal_matrix

    # Living-cost coverage by category × country.
    lc_matrix = []
    if not living_cost.empty:
        for category, group in living_cost.groupby("expense_category"):
            for iso3 in ISO_LIST:
                subset = group[group["country_iso3"] == iso3]
                lc_matrix.append(
                    {
                        "expense_category": category,
                        "country_iso3": iso3,
                        "observations": int(len(subset)),
                        "year_min": int(subset["year"].min()) if not subset.empty else None,
                        "year_max": int(subset["year"].max()) if not subset.empty else None,
                        "status": "available" if not subset.empty else "not_available",
                    }
                )
    coverage["living_cost_matrix"] = lc_matrix

    missing = []
    if salary.empty or "JPN" not in set(salary["country_iso3"]):
        missing.append(
            {
                "dataset": "salary",
                "scope": "JPN",
                "issue": "No occupation-level earnings observations for Japan in the ILOSTAT series used.",
                "treatment": "Shown as unavailable; no estimate is substituted.",
            }
        )
    missing.append(
        {
            "dataset": "salary",
            "scope": "CAN",
            "issue": "Canada reports occupation earnings under ISCO-88 rather than ISCO-08.",
            "treatment": "Included with an explicit ISCO-88 major-group mapping and classification flag; not silently harmonised.",
        }
    )
    missing.append(
        {
            "dataset": "employment",
            "scope": "CAN — AI and automotive",
            "issue": "Canada reports ISIC Rev.3, which does not isolate information/communication (J) or motor-vehicle manufacturing (C29).",
            "treatment": "These Canada sector series are shown as unavailable rather than approximated.",
        }
    )
    missing.append(
        {
            "dataset": "country_sector",
            "scope": "investment_announced / investment_realized",
            "issue": "Sector-specific announced and realized investment are not available from the free official sources used.",
            "treatment": "Columns are present but empty; the interface labels them unavailable.",
        }
    )
    missing.append(
        {
            "dataset": "employment",
            "scope": "vacancies / vacancy_rate",
            "issue": "Harmonised vacancy series across all six countries were not acquired.",
            "treatment": "Columns are present but empty; vacancy views are disabled.",
        }
    )
    missing.append(
        {
            "dataset": "living_cost",
            "scope": "city-level expenses",
            "issue": "City-level expense observations are not available in the official series used; values are national.",
            "treatment": "City is recorded as 'National'; no city-level estimate is fabricated.",
        }
    )
    missing.append(
        {
            "dataset": "country_sector",
            "scope": "capacity_addition",
            "issue": "Installed-capacity additions by sector are not available in the free series used.",
            "treatment": "Column is present but empty.",
        }
    )

    sources = [
        {
            "id": "world_bank_wdi",
            "name": "World Bank — World Development Indicators",
            "url": "https://data.worldbank.org/",
            "api": "https://api.worldbank.org/v2/",
            "license": "CC BY 4.0 (World Bank open data)",
            "retrieved_at": RETRIEVED_AT,
            "used_for": ["country_sector indicators", "country context", "living cost indicators", "salary deflators and PPP conversion"],
        },
        {
            "id": "ilostat",
            "name": "ILOSTAT — International Labour Organization",
            "url": "https://ilostat.ilo.org/",
            "api": "https://rplumber.ilo.org/data/indicator",
            "license": "ILO open data (CC BY 4.0 unless otherwise stated)",
            "retrieved_at": RETRIEVED_AT,
            "used_for": ["employment by industry and occupation", "mean and median monthly earnings by occupation"],
        },
    ]

    return {
        "project": "Beyond Borders — Global Employment Opportunities and Sector Development Intelligence",
        "generated_at": RETRIEVED_AT,
        "historical_period": {"start": START_YEAR, "end": END_YEAR},
        "forecast_period": {"start": 2025, "end": 2030},
        "frequency": "annual",
        "countries": COUNTRIES,
        "sectors": SECTORS,
        "occupations": [{"code": c, "name": n} for _, c, n in OCCUPATIONS],
        "coverage": coverage,
        "missing_data": missing,
        "sources": sources,
        "method_notes": {
            "employment": "ILOSTAT employment by economic activity × occupation. Section-level rows are available for all six countries and are broad proxies. Division-level rows are available only where ILOSTAT publishes ISIC Rev.4 two-digit data (India, Japan, United Kingdom, United States).",
            "salary": "ILOSTAT average monthly earnings of employees by occupation, local currency, nominal. Real values use World Bank CPI (2010 = 100). PPP values divide by the World Bank private-consumption PPP conversion factor. No currency conversion is applied without one of these documented methods.",
            "country_sector": "World Bank WDI indicators mapped to sectors as documented proxies. industrial_output is populated only for indicators with role='output'; all indicators also expose indicator_value and indicator_role.",
            "living_cost": "National-level World Bank price and consumption indicators. City-level expense data has not been acquired.",
            "forecast": "Forecasts are produced separately by scripts/forecast.py and are never mixed into historical files.",
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def write_dataset(frame: pd.DataFrame, name: str) -> None:
    parquet_path = PROCESSED / f"{name}.parquet"
    csv_path = PROCESSED / f"{name}.csv"
    frame.to_parquet(parquet_path, index=False)
    frame.to_csv(csv_path, index=False, encoding="utf-8")
    log(f"wrote {name}: {len(frame):,} rows -> {parquet_path.name} / {csv_path.name}")


def main() -> int:
    log("starting ingestion")
    wb = fetch_all_world_bank()

    section_frame = fetch_ilo(
        "EMP_TEMP_ECO_OCU_NB_A",
        classif1=["ECO_ISIC4_C", "ECO_ISIC4_J", "ECO_ISIC4_D", "ECO_ISIC4_G", "ECO_ISIC4_Q"],
        classif2=OCC_FILTER,
        cache_name="emp_section_occ",
    )
    division_frame = fetch_ilo(
        "EMP_TEMP_SEX_OCU_EC2_NB_A",
        classif1=OCC_FILTER,
        classif2=["EC2_ISIC4_C26", "EC2_ISIC4_J62", "EC2_ISIC4_D35", "EC2_ISIC4_C29", "EC2_ISIC4_Q86"],
        cache_name="emp_division_occ",
    )
    earnings_mean = fetch_ilo(
        "EAR_EMTA_SEX_OCU_NB_A",
        classif1=OCC_FILTER,
        cache_name="earnings_mean_occ",
    )
    earnings_median = fetch_ilo(
        "EAR_EMTM_SEX_OCU_NB_A",
        classif1=OCC_FILTER,
        cache_name="earnings_median_occ",
    )
    canada_section = fetch_ilo(
        "EMP_TEMP_ECO_OCU_NB_A",
        classif1=["ECO_ISIC3_D", "ECO_ISIC3_E", "ECO_ISIC3_N"],
        classif2=OCC88_FILTER,
        cache_name="emp_canada_isic3",
    )
    canada_earnings_mean = fetch_ilo(
        "EAR_EMTA_SEX_OCU_NB_A",
        classif1=OCC88_FILTER,
        cache_name="earnings_canada_mean",
    )
    canada_earnings_median = fetch_ilo(
        "EAR_EMTM_SEX_OCU_NB_A",
        classif1=OCC88_FILTER,
        cache_name="earnings_canada_median",
    )

    country_sector = build_country_sector(wb)
    employment = build_employment(section_frame, division_frame, canada_section)
    salary = build_salary(
        earnings_mean,
        earnings_median,
        canada_earnings_mean,
        canada_earnings_median,
        wb,
    )
    living_cost = build_living_cost(wb)
    context = build_context(wb)

    write_dataset(country_sector, "country_sector")
    write_dataset(employment, "employment")
    write_dataset(salary, "salary")
    write_dataset(living_cost, "living_cost")
    write_dataset(context, "country_context")

    metadata = build_metadata(country_sector, employment, salary, living_cost)
    metadata_path = PROCESSED / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    log(f"wrote {metadata_path.name}")

    log("coverage summary")
    for key, value in metadata["coverage"].items():
        if isinstance(value, dict) and "rows" in value:
            log(
                f"  {key}: {value['rows']:,} rows | {len(value['countries'])} countries | "
                f"{value['year_min']}–{value['year_max']}"
            )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:  # noqa: BLE001
        log(f"FATAL: {exc}")
        raise
