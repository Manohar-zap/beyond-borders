from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .config import API_VERSION, PROJECT_TITLE
from .routers import (
    context,
    employment,
    export,
    forecast,
    living_cost,
    meta,
    quality,
    salary,
    sectors,
)

app = FastAPI(
    title=PROJECT_TITLE,
    version=API_VERSION,
    description=(
        "Documented research API for the Beyond Borders dashboard. "
        "Historical observations and model-generated forecasts are stored and served separately. "
        "Every response includes source attribution, filters, units and data-quality warnings."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(context.router)
app.include_router(sectors.router)
app.include_router(employment.router)
app.include_router(salary.router)
app.include_router(living_cost.router)
app.include_router(forecast.router)
app.include_router(quality.router)
app.include_router(export.router)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")
