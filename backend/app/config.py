from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_ROOT / "data" / "processed"
RAW_DIR = BACKEND_ROOT / "data" / "raw"

DATASETS = [
    "country_sector",
    "employment",
    "salary",
    "living_cost",
    "country_context",
    "forecast",
]

API_VERSION = "1.0.0"
PROJECT_TITLE = "Beyond Borders — Global Employment Opportunities and Sector Development Intelligence"
FORECAST_START = 2025
FORECAST_END = 2030
HISTORY_START = 2010
HISTORY_END = 2024


def load_json(name: str, default: Any = None) -> Any:
    path = DATA_DIR / name
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def metadata() -> dict[str, Any]:
    return load_json("metadata.json", {}) or {}


def forecast_metadata() -> dict[str, Any]:
    return load_json("forecast_metadata.json", {}) or {}


def dataset_path(name: str) -> Path:
    return DATA_DIR / f"{name}.parquet"


def dataset_available(name: str) -> bool:
    return dataset_path(name).exists()
