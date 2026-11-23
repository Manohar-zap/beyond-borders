"""
Sector Indicator Registry for Beyond Borders

Documented proxy indicators for each sector, with explicit limitations.
Do not treat these as direct sector output measurements.
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from enum import Enum


class IndicatorType(Enum):
    DIRECT = "direct"
    PROXY = "proxy"


@dataclass
class SectorIndicator:
    indicator_id: str
    indicator_name: str
    indicator_unit: str
    indicator_type: IndicatorType
    is_proxy: bool
    proxy_note: str
    source_preference: str
    relevant_for: str  # e.g., "output", "employment", "investment", "capacity"


@dataclass
class SectorDefinition:
    sector_id: str
    sector_name: str
    sector_definition: str
    official_industry_codes: List[str]
    direct_indicators: Optional[List[SectorIndicator]] = None
    proxy_indicators: Optional[List[SectorIndicator]] = None
    mapping_limitations: str = ""

    def __post_init__(self):
        if self.direct_indicators is None:
            self.direct_indicators = []
        if self.proxy_indicators is None:
            self.proxy_indicators = []
        if self.direct_indicators and not self.proxy_indicators:
            proxies = [i for i in self.direct_indicators if getattr(i, 'is_proxy', False)]
            directs = [i for i in self.direct_indicators if not getattr(i, 'is_proxy', False)]
            if proxies:
                self.proxy_indicators = proxies
                self.direct_indicators = directs


# Sector definitions
SECTOR_DEFINITIONS: Dict[str, SectorDefinition] = {
    "semiconductors": SectorDefinition(
        sector_id="semiconductors",
        sector_name="Semiconductors and Electronics",
        sector_definition=
        "Electronic components, computing hardware and semiconductor supply chains. These indicators track enabling conditions and output-related metrics; they are not a harmonised semiconductor industry census.",
        official_industry_codes=[
            "ISIC Code C26: Manufacture of computer, electronic and optical products",
            "ISIC Code C27: Manufacture of electrical equipment",
        ],
        direct_indicators=[
            SectorIndicator(
                indicator_id="TX.VAL.TECH.CD",
                indicator_name="High-technology exports",
                indicator_unit="current US$",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "High-technology exports include computers, optical products, and electrical equipment; not semiconductor-specific.",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
            SectorIndicator(
                indicator_id="IP.PAT.RESD",
                indicator_name="Patent applications, residents",
                indicator_unit="applications",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "Patent applications are a proxy for semiconductor innovation activity; not all semiconductor patents are residents-only.",
                source_preference="World Bank WDI",
                relevant_for="innovation",
            ),
        ],
        mapping_limitations=
        "Sector maps to ISIC Rev.4 section C27 (electrical equipment) and ISIC J (information and communication). Does not capture foundry-specific capacity or fabless design activity.",
    ),
    "ai_software": SectorDefinition(
        sector_id="ai_software",
        sector_name="AI and Software",
        sector_definition=
        "Software production, ICT services and research intensity relevant to AI. These indicators track research and digital infrastructure; they are not AI-specific industry output.",
        official_industry_codes=[
            "ISIC Code J: Information and communication",
            "ISIC Code M: Professional, scientific and technical activities",
        ],
        direct_indicators=[
            SectorIndicator(
                indicator_id="BX.GSR.CCIS.CD",
                indicator_name="ICT service exports",
                indicator_unit="current US$",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "ICT service exports are a broad measure of ICT trade; not AI-specific.",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
            SectorIndicator(
                indicator_id="GB.XPD.RSDV.GD.ZS",
                indicator_name="Research and development expenditure",
                indicator_unit="% of GDP",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "Total R&D expenditure includes all fields; not AI-specific.",
                source_preference="World Bank WDI",
                relevant_for="investment",
            ),
        ],
        mapping_limitations=
        "Sector maps to ISIC J (information and communication) and ISIC M (professional, scientific and technical activities). R&D expenditure is economy-wide; AI-specific investment is not separately reported in free sources.",
    ),
    "renewable_energy": SectorDefinition(
        sector_id="renewable_energy",
        sector_name="Renewable Energy",
        sector_definition=
        "Renewable energy consumption and low-carbon electricity supply. These indicators are directly reported physical-energy metrics.",
        official_industry_codes=[
            "ISIC Code D35: Electricity, gas, steam and air conditioning supply",
        ],
        direct_indicators=[
            SectorIndicator(
                indicator_id="EG.ELC.RNEW.ZS",
                indicator_name="Renewable electricity output",
                indicator_unit="% of total electricity output",
                indicator_type=IndicatorType.DIRECT,
                is_proxy=False,
                proxy_note="",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
            SectorIndicator(
                indicator_id="EG.FEC.RNEW.ZS",
                indicator_name="Renewable energy consumption",
                indicator_unit="% of final energy consumption",
                indicator_type=IndicatorType.DIRECT,
                is_proxy=False,
                proxy_note="",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
        ],
        mapping_limitations=
        "Directly reported physical-energy indicators. Does not include investment, capacity additions, or employment. Hydro and nuclear are included in 'renewable' in some definitions but not others.",
    ),
    "automotive_ev": SectorDefinition(
        sector_id="automotive_ev",
        sector_name="Automotive and Electric Vehicles",
        sector_definition=
        "Motor-vehicle manufacturing, distribution and electrification capacity. These indicators track vehicle production and electrification; they are not a harmonised automotive census.",
        official_industry_codes=[
            "ISIC Code C29: Manufacture of motor vehicles, trailers and semi-trailers",
        ],
        direct_indicators=[
            SectorIndicator(
                indicator_id="NV.IND.MANF.CD",
                indicator_name="Manufacturing value added",
                indicator_unit="current US$",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "Manufacturing value added covers all manufacturing; not automotive-specific.",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
            SectorIndicator(
                indicator_id="NE.GDI.FTOT.ZS",
                indicator_name="Gross fixed capital formation",
                indicator_unit="% of GDP",
                indicator_type=IndicatorType.PROXY,
                is_proxy=True,
                proxy_note=
                "Gross fixed capital formation includes all industries; not automotive-specific.",
                source_preference="World Bank WDI",
                relevant_for="investment",
            ),
        ],
        mapping_limitations=
        "Sector maps to ISIC Rev.4 section C29 (motor vehicles). Does not capture two-wheeler production, commercial vehicle production, or aftermarket activity. EV-specific capacity is not separately reported.",
    ),
    "healthcare_biotech": SectorDefinition(
        sector_id="healthcare_biotech",
        sector_name="Healthcare and Biotechnology",
        sector_definition=
        "Health expenditure, health-sector employment and biomedical research. These indicators track health spending and employment; they are not biotechnology production metrics.",
        official_industry_codes=[
            "ISIC Code Q: Human health and social work activities",
            "ISIC Code R: Arts, entertainment and recreation",
        ],
        direct_indicators=[
            SectorIndicator(
                indicator_id="SH.XPD.CHEX.GD.ZS",
                indicator_name="Current health expenditure",
                indicator_unit="% of GDP",
                indicator_type=IndicatorType.DIRECT,
                is_proxy=False,
                proxy_note="",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
            SectorIndicator(
                indicator_id="SH.XPD.CHEX.PC.CD",
                indicator_name="Current health expenditure per capita",
                indicator_unit="current US$ per capita",
                indicator_type=IndicatorType.DIRECT,
                is_proxy=False,
                proxy_note="",
                source_preference="World Bank WDI",
                relevant_for="output",
            ),
        ],
        mapping_limitations=
        "Directly reported health-expenditure indicators. Does not include pharmaceutical production, biotechnology R&D, or clinical trial activity. Health expenditure is a consumption measure, not a production measure.",
    ),
}

# Export for API use
__all__ = ["SECTOR_DEFINITIONS", "SectorDefinition", "SectorIndicator", "IndicatorType"]


if __name__ == "__main__":
    import json
    for sector_id, definition in SECTOR_DEFINITIONS.items():
        print(f"{sector_id}: {definition.sector_name}")
        print(f"  Direct indicators: {len(definition.direct_indicators)}")
        print(f"  Proxy indicators: {len(definition.proxy_indicators)}")
        print(f"  Limitations: {definition.mapping_limitations[:80]}...")
        print()