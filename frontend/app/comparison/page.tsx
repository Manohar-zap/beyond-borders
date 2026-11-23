"use client";

import * as React from "react";
import type { EChartsOption } from "echarts";
import {
  ArrowLeftRight,
  Award,
  Banknote,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Compass,
  DollarSign,
  Factory,
  Globe2,
  HelpCircle,
  Layers,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import {
  AXIS_LABEL,
  COUNTRY_COLORS,
  LINE,
  MUTED,
  SECTOR_COLORS,
  SPLIT_LINE,
  TOOLTIP_STYLE,
  barOption,
  baseOption,
  compactAxis,
  timeSeriesOption,
} from "@/lib/chart-theme";
import { FALLBACK_COUNTRIES, FALLBACK_OCCUPATIONS, FALLBACK_SECTORS } from "@/lib/constants";
import { averageBy, groupRows, latestRows, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type {
  CountryContextRow,
  CountrySectorRow,
  EmploymentRow,
  Envelope,
  ForecastRow,
  IndustrialProjectRow,
  LivingCostRow,
  ProjectMeta,
  SalaryRow,
} from "@/lib/types";

type Basis = "ppp" | "nominal" | "real";

const BASIS_LABELS: Record<Basis, string> = {
  ppp: "PPP intl $ (Comparable)",
  nominal: "Nominal Local Currency",
  real: "Real 2010 Constant",
};

const BASIS_KEYS: Record<Basis, "salary_ppp_intl" | "salary_mean" | "salary_real_2010"> = {
  ppp: "salary_ppp_intl",
  nominal: "salary_mean",
  real: "salary_real_2010",
};

const COUNTRY_FLAGS: Record<string, string> = {
  USA: "🇺🇸",
  CHN: "🇨🇳",
  DEU: "🇩🇪",
  JPN: "🇯🇵",
  IND: "🇮🇳",
  GBR: "🇬🇧",
  FRA: "🇫🇷",
  ITA: "🇮🇹",
  CAN: "🇨🇦",
  BRA: "🇧🇷",
  KOR: "🇰🇷",
  MEX: "🇲🇽",
  AUS: "🇦🇺",
  ESP: "🇪🇸",
  IDN: "🇮🇩",
};

const SECTOR_PRIMARY_INDICATORS: Record<string, { id: string; name: string; unit: string }> = {
  semiconductors: {
    id: "TX.VAL.TECH.CD",
    name: "High-technology exports",
    unit: "current US$",
  },
  ai_software: {
    id: "BX.GSR.CCIS.CD",
    name: "ICT service exports",
    unit: "current US$",
  },
  renewable_energy: {
    id: "EG.ELC.RNEW.ZS",
    name: "Renewable electricity output",
    unit: "% of total electricity output",
  },
  automotive_ev: {
    id: "NV.IND.MANF.CD",
    name: "Manufacturing value added",
    unit: "current US$",
  },
  healthcare_biotech: {
    id: "SH.XPD.CHEX.PC.CD",
    name: "Current health expenditure per capita",
    unit: "current US$ per capita",
  },
};

export default function ComparisonPage() {
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;

  const countryList = projectMeta?.countries?.length ? projectMeta.countries : FALLBACK_COUNTRIES;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;
  const occupationList = projectMeta?.occupations?.length ? projectMeta.occupations : FALLBACK_OCCUPATIONS;

  // Dynamic Country Selection: starts with 2, can scale to 3, 4, 5, 6
  const [selectedCountries, setSelectedCountries] = React.useState<string[]>(["USA", "DEU"]);
  const [selectedSector, setSelectedSector] = React.useState<string>("semiconductors");
  const [selectedYear, setSelectedYear] = React.useState<number>(2024);
  const [basis, setBasis] = React.useState<Basis>("ppp");
  const [selectedIndicatorId, setSelectedIndicatorId] = React.useState<string>("");

  // Country actions: Add, Remove, Update, Swap/Reverse
  const addCountry = () => {
    const next = countryList.find((c) => !selectedCountries.includes(c.iso3));
    if (next) {
      setSelectedCountries([...selectedCountries, next.iso3]);
    }
  };

  const removeCountry = (iso3: string) => {
    if (selectedCountries.length <= 2) return;
    setSelectedCountries(selectedCountries.filter((c) => c !== iso3));
  };

  const updateCountry = (index: number, newIso3: string) => {
    const existingIndex = selectedCountries.indexOf(newIso3);
    if (existingIndex !== -1 && existingIndex !== index) {
      const updated = [...selectedCountries];
      updated[existingIndex] = selectedCountries[index];
      updated[index] = newIso3;
      setSelectedCountries(updated);
    } else {
      const updated = [...selectedCountries];
      updated[index] = newIso3;
      setSelectedCountries(updated);
    }
  };

  const handleSwap = () => {
    if (selectedCountries.length === 2) {
      setSelectedCountries([selectedCountries[1], selectedCountries[0]]);
    } else {
      setSelectedCountries([...selectedCountries].reverse());
    }
  };

  const countriesParam = selectedCountries.join(",");

  // Primary or user-selected indicator for the active sector
  const activeIndicatorId = React.useMemo(() => {
    const primary = SECTOR_PRIMARY_INDICATORS[selectedSector]?.id || "TX.VAL.TECH.CD";
    if (
      selectedIndicatorId &&
      (projectMeta?.sector_indicators?.some(
        (si) => si.sector_id === selectedSector && si.indicator_id === selectedIndicatorId
      ) ||
        selectedIndicatorId === primary)
    ) {
      return selectedIndicatorId;
    }
    return primary;
  }, [selectedIndicatorId, selectedSector, projectMeta]);

  // List of available indicators for the active sector
  const availableSectorIndicators = React.useMemo(() => {
    const list = (projectMeta?.sector_indicators ?? []).filter((si) => si.sector_id === selectedSector);
    if (list.length > 0) return list;
    const primary = SECTOR_PRIMARY_INDICATORS[selectedSector];
    return primary
      ? [
          {
            sector_id: selectedSector,
            indicator_id: primary.id,
            indicator_name: primary.name,
            indicator_unit: primary.unit,
          },
        ]
      : [];
  }, [projectMeta, selectedSector]);

  // 1. Sector Series & Latest Data
  const sectorSeriesApi = useApi<Envelope<CountrySectorRow>>(
    ["cmp-sec-series", countriesParam, selectedSector, activeIndicatorId],
    "/api/sectors/series",
    { countries: countriesParam, sectors: selectedSector, indicators: activeIndicatorId, start: 2010, end: 2024 }
  );

  const sectorLatestApi = useApi<Envelope<CountrySectorRow>>(
    ["cmp-sec-latest", countriesParam, selectedSector, activeIndicatorId, selectedYear],
    "/api/sectors/latest",
    { countries: countriesParam, sectors: selectedSector, indicators: activeIndicatorId, year: selectedYear }
  );

  // 2. Employment Data
  const employmentApi = useApi<Envelope<EmploymentRow>>(
    ["cmp-emp-latest", countriesParam, selectedSector, selectedYear],
    "/api/employment/latest",
    { countries: countriesParam, sectors: selectedSector, granularity: "section", year: selectedYear }
  );

  // 3. Salary Data across Occupations
  const salaryApi = useApi<Envelope<SalaryRow>>(
    ["cmp-salary-latest", countriesParam, basis, selectedYear],
    "/api/salary/latest",
    { countries: countriesParam, basis, year: selectedYear }
  );

  // 4. Macro Context (GDP, CPI, Unemployment, Consumption)
  const contextApi = useApi<Envelope<CountryContextRow>>(
    ["cmp-context", countriesParam, selectedYear],
    "/api/context/latest",
    { countries: countriesParam, year: selectedYear }
  );

  // 5. Forecast Data (2025-2030)
  const forecastApi = useApi<Envelope<ForecastRow>>(
    ["cmp-forecast", countriesParam, selectedSector, activeIndicatorId],
    "/api/forecast/series",
    { countries: countriesParam, sectors: selectedSector, indicators: activeIndicatorId, start: 2025, end: 2030 }
  );

  // 6. Industrial Mega-Projects
  const projectsApi = useApi<Envelope<IndustrialProjectRow>>(
    ["cmp-projects", countriesParam, selectedSector],
    "/api/sectors/projects",
    { countries: countriesParam, sectors: selectedSector }
  );

  // Extract raw rows
  const sectorSeriesRows = sectorSeriesApi.data?.data ?? [];
  const sectorLatestRows = sectorLatestApi.data?.data ?? [];
  const employmentRows = employmentApi.data?.data ?? [];
  const salaryRows = salaryApi.data?.data ?? [];
  const contextRows = contextApi.data?.data ?? [];
  const forecastRows = forecastApi.data?.data ?? [];
  const projectRows = projectsApi.data?.data ?? [];

  const currentSectorObj = sectorList.find((s) => s.id === selectedSector);
  const sectorTitle = currentSectorObj?.name ?? selectedSector;

  // Unified structured metrics for ALL selected countries
  const countryData = React.useMemo(() => {
    return selectedCountries.map((iso3) => {
      const name = countryList.find((c) => c.iso3 === iso3)?.name ?? iso3;
      const color = COUNTRY_COLORS[iso3] || "#5B6B7C";
      const flag = COUNTRY_FLAGS[iso3] || "🌐";

      const latestSector =
        sectorLatestRows.find(
          (r) => r.country_iso3 === iso3 && (r.indicator_id === activeIndicatorId || !r.indicator_id)
        ) || sectorLatestRows.find((r) => r.country_iso3 === iso3);

      const emp_raw =
        employmentRows.find(
          (r) => r.country_iso3 === iso3 && (r.occupation_code === "TOTAL" || !r.occupation_code)
        )?.employment ?? employmentRows.find((r) => r.country_iso3 === iso3)?.employment;
      // ILOSTAT reports employment in thousands of persons
      const emp = emp_raw != null ? emp_raw * 1000 : null;

      const salaryKey = BASIS_KEYS[basis];
      const profSalary = salaryRows.find(
        (r) => r.country_iso3 === iso3 && r.occupation_code === "2"
      )?.[salaryKey];

      const ctx = Object.fromEntries(
        contextRows.filter((r) => r.country_iso3 === iso3).map((r) => [r.indicator_id, r.value])
      );
      const gdp = ctx["NY.GDP.PCAP.CD"] ?? null;
      const uem = ctx["SL.UEM.TOTL.ZS"] ?? null;
      const cpi = ctx["FP.CPI.TOTL"] ?? null;
      const inv = latestSector?.investment_announced ?? null;

      return {
        iso3,
        name,
        color,
        flag,
        latestSector,
        emp,
        profSalary,
        gdp,
        uem,
        cpi,
        inv,
      };
    });
  }, [
    selectedCountries,
    countryList,
    sectorLatestRows,
    activeIndicatorId,
    employmentRows,
    salaryRows,
    basis,
    contextRows,
  ]);

  // -------------------------------------------------------------
  // Chart 1: Multi-Pillar Strategic Competitiveness Radar (0-100)
  // -------------------------------------------------------------
  const radarOption: EChartsOption = React.useMemo(() => {
    const maxOutput = Math.max(...countryData.map((d) => d.latestSector?.indicator_value ?? 0), 1);
    const maxEmp = Math.max(...countryData.map((d) => d.emp ?? 0), 1);
    const maxWage = Math.max(...countryData.map((d) => d.profSalary ?? 0), 1);
    const maxInv = Math.max(...countryData.map((d) => d.inv ?? 20), 20);

    const radarSeriesData = countryData.map((c) => {
      const normOutput = Math.min(
        100,
        Math.round(((c.latestSector?.indicator_value ?? 0) / maxOutput) * 100)
      );
      const normEmp = Math.min(100, Math.round(((c.emp ?? 0) / maxEmp) * 100));
      const normWage = Math.min(100, Math.round(((c.profSalary ?? 0) / maxWage) * 100));
      const aff =
        c.gdp && c.profSalary ? Math.min(100, Math.round(((c.profSalary * 12) / c.gdp) * 75)) : 65;
      const normInv = Math.min(100, Math.round(((c.inv ?? 20) / maxInv) * 100));
      const res = Math.max(10, Math.min(100, Math.round(100 - (c.uem ?? 5) * 5)));

      return {
        value: [normOutput, normEmp, normWage, aff, normInv, res],
        name: c.name,
        itemStyle: { color: c.color },
        lineStyle: { width: 2.2, color: c.color },
        areaStyle: { color: c.color, opacity: countryData.length > 2 ? 0.1 : 0.2 },
      };
    });

    return {
      ...baseOption(),
      tooltip: {
        ...TOOLTIP_STYLE,
        trigger: "item",
      },
      legend: {
        top: 2,
        right: 12,
        type: "scroll",
        textStyle: { color: MUTED, fontSize: 11 },
        data: countryData.map((c) => c.name),
      },
      radar: {
        center: ["50%", "58%"],
        radius: "56%",
        indicator: [
          { name: "Sector Output", max: 100 },
          { name: "Workforce Pool", max: 100 },
          { name: "Compensation", max: 100 },
          { name: "Affordability", max: 100 },
          { name: "Capital Inflow", max: 100 },
          { name: "Macro Stability", max: 100 },
        ],
        shape: "polygon",
        splitNumber: 4,
        axisName: {
          color: "#4A463D",
          fontSize: 10.5,
          fontFamily: "var(--font-sans)",
        },
        splitLine: { lineStyle: { color: "#E0DAD0" } },
        splitArea: {
          show: true,
          areaStyle: { color: ["rgba(255,255,255,0.8)", "rgba(247,244,238,0.4)"] },
        },
        axisLine: { lineStyle: { color: "#D6CFC4" } },
      },
      series: [
        {
          name: "Bilateral Competitiveness Index",
          type: "radar",
          data: radarSeriesData,
        },
      ],
    };
  }, [countryData]);

  // -------------------------------------------------------------
  // Chart 2: Historical Sector Trajectory (2010-2024 Multi-Line)
  // -------------------------------------------------------------
  const trajectoryOption: EChartsOption = React.useMemo(() => {
    const seriesData = countryData.map((c) => {
      const rows = sectorSeriesRows
        .filter((r) => r.country_iso3 === c.iso3 && (r.indicator_id === activeIndicatorId || !r.indicator_id))
        .sort((a, b) => a.year - b.year);

      // Ensure strictly 1 observation per year per country (prevents duplicate points & sawtooth artifacts)
      const yearMap = new Map<number, number>();
      for (const r of rows) {
        if (r.indicator_value != null && !yearMap.has(r.year)) {
          yearMap.set(r.year, r.indicator_value);
        }
      }
      const points = Array.from(yearMap.entries())
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year - b.year);

      return {
        name: c.name,
        color: c.color,
        points,
      };
    });

    const unit = countryData[0]?.latestSector?.indicator_unit || "";

    return timeSeriesOption({
      series: seriesData,
      xMin: 2010,
      xMax: 2024,
      yName: unit,
      valueFormatter: (v) => formatCompact(v),
    });
  }, [sectorSeriesRows, countryData, activeIndicatorId]);

  // -------------------------------------------------------------
  // Chart 3: Occupational Wage Structure (ISCO 1-9 Grouped Bar)
  // -------------------------------------------------------------
  const occupationalWageOption: EChartsOption = React.useMemo(() => {
    const salaryKey = BASIS_KEYS[basis];
    const occCodes = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const categories = occCodes.map((code) => {
      const occ = occupationList.find((o) => o.code === code);
      return occ?.name ?? `ISCO ${code}`;
    });

    const series = countryData.map((c) => {
      const values = occCodes.map((code) => {
        const row = salaryRows.find((r) => r.country_iso3 === c.iso3 && r.occupation_code === code);
        return row ? toNumber(row[salaryKey]) : null;
      });
      return { name: c.name, values, color: c.color };
    });

    return barOption({
      categories,
      series,
      horizontal: true,
      valueFormatter: (v) =>
        basis === "ppp"
          ? `$${formatNumber(v, { maximumFractionDigits: 0 })}`
          : formatNumber(v, { maximumFractionDigits: 0 }),
      yName: basis === "ppp" ? "PPP Intl $/mo" : "Monthly Earnings",
    });
  }, [occupationList, salaryRows, countryData, basis]);

  // -------------------------------------------------------------
  // Chart 4: Econometric Forecast Horizon (2025-2030 Outlook)
  // -------------------------------------------------------------
  const forecastOption: EChartsOption = React.useMemo(() => {
    const seriesData = countryData.map((c) => {
      const rows = forecastRows
        .filter((r) => r.country_iso3 === c.iso3 && (r.indicator_id === activeIndicatorId || !r.indicator_id))
        .sort((a, b) => a.target_year - b.target_year);

      const yearMap = new Map<number, number>();
      for (const r of rows) {
        if (r.predicted_value != null && !yearMap.has(r.target_year)) {
          yearMap.set(r.target_year, r.predicted_value);
        }
      }
      const points = Array.from(yearMap.entries())
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year - b.year);

      return {
        name: `${c.name} (Projected)`,
        color: c.color,
        dashed: true,
        points,
      };
    });

    const bands = countryData.map((c) => {
      const rows = forecastRows
        .filter((r) => r.country_iso3 === c.iso3 && (r.indicator_id === activeIndicatorId || !r.indicator_id))
        .sort((a, b) => a.target_year - b.target_year);

      const bandMap = new Map<number, { lower: number; upper: number }>();
      for (const r of rows) {
        if (r.lower_interval != null && r.upper_interval != null && !bandMap.has(r.target_year)) {
          bandMap.set(r.target_year, { lower: r.lower_interval, upper: r.upper_interval });
        }
      }
      const points = Array.from(bandMap.entries())
        .map(([year, { lower, upper }]) => ({ year, lower, upper }))
        .sort((a, b) => a.year - b.year);

      return {
        name: `${c.name} 95% Interval`,
        color: c.color,
        points,
      };
    });

    const unit =
      forecastRows[0]?.indicator_unit ?? countryData[0]?.latestSector?.indicator_unit ?? "Projected Index";

    return timeSeriesOption({
      series: seriesData,
      bands,
      xMin: 2025,
      xMax: 2030,
      yName: unit,
      valueFormatter: (v) => formatCompact(v),
    });
  }, [forecastRows, countryData, activeIndicatorId]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <PageHeader
        eyebrow="Comparative Intelligence Hub"
        title="Country & Sector Head-to-Head Comparison"
        description="Multi-country structural benchmark comparing national industrial output, talent density, real wage competitiveness, living affordability, and capital projects across leading economies."
        actions={
          <Badge variant="outline" className="border-teal/30 bg-teal/10 font-mono text-[11px] text-teal">
            {selectedCountries.length} COUNTRIES BENCHMARKED
          </Badge>
        }
      />

      {/* Control Station: Dynamic Country Selectors + '+ Add Country' Button + Sector + Year + Basis */}
      <Card className="border border-border/70 bg-card/60 shadow-sm backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          {/* Countries Control Row */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5 text-teal" /> Benchmark Countries ({selectedCountries.length} active)
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwap}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  title="Reverse comparison order"
                >
                  <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                  Reverse Order
                </Button>
                {selectedCountries.length < countryList.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCountry}
                    className="h-7 border-teal/40 bg-teal/5 text-xs text-teal hover:bg-teal/15 font-medium"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Country
                  </Button>
                )}
              </div>
            </div>

            {/* Country Selectors Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
              {selectedCountries.map((iso3, idx) => {
                const color = COUNTRY_COLORS[iso3] || "#5B6B7C";
                return (
                  <div key={idx} className="relative group">
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
                      style={{ backgroundColor: color }}
                    />
                    <Select
                      value={iso3}
                      onValueChange={(val) => updateCountry(idx, val)}
                    >
                      <SelectTrigger className="h-10 pl-3 pr-7 bg-background font-medium text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {countryList.map((c) => (
                          <SelectItem key={c.iso3} value={c.iso3} className="text-xs">
                            <span className="mr-1.5">{COUNTRY_FLAGS[c.iso3] || "🌐"}</span>
                            {c.name} ({c.iso3})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCountries.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeCountry(iso3)}
                        className="absolute right-2 top-2.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                        title={`Remove ${iso3}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add Country placeholder button if < total */}
              {selectedCountries.length < countryList.length && (
                <button
                  type="button"
                  onClick={addCountry}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground transition-colors hover:border-teal/60 hover:bg-teal/5 hover:text-teal"
                >
                  <Plus className="h-4 w-4" /> Add Country
                </button>
              )}
            </div>
          </div>

          {/* Sector, Year, and Basis Controls */}
          <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-12 border-t border-border/50 pt-4">
            {/* Target Sector */}
            <div className="sm:col-span-5">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Factory className="h-3.5 w-3.5 text-blue-600" /> Target Industrial Sector
              </label>
              <Select
                value={selectedSector}
                onValueChange={(val) => {
                  setSelectedSector(val);
                  setSelectedIndicatorId("");
                }}
              >
                <SelectTrigger className="h-10 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectorList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.short || s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observed Year */}
            <div className="sm:col-span-3">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Observed Year
              </label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="h-10 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => 2024 - i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Valuation Currency Basis */}
            <div className="sm:col-span-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Wage Valuation Basis
              </label>
              <Tabs value={basis} onValueChange={(v) => setBasis(v as Basis)} className="h-10">
                <TabsList className="h-10 w-full bg-muted/60 p-1">
                  <TabsTrigger value="ppp" className="h-8 flex-1 text-xs">
                    PPP intl $
                  </TabsTrigger>
                  <TabsTrigger value="nominal" className="h-8 flex-1 text-xs">
                    Nominal
                  </TabsTrigger>
                  <TabsTrigger value="real" className="h-8 flex-1 text-xs">
                    Real 2010
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Country Scorecard Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Sector Core Metric */}
        <Card className="border border-border/70 bg-card shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Sector Core Indicator</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {selectedYear}
              </Badge>
            </div>
            <div className="mt-3 space-y-1.5">
              {countryData.map((c) => (
                <div key={c.iso3} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span>{c.flag}</span>
                    <span className="font-medium">{c.name}:</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {c.latestSector?.indicator_value != null
                      ? formatCompact(c.latestSector.indicator_value)
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Workforce Talent Pool */}
        <Card className="border border-border/70 bg-card shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Workforce Headcount</span>
              <Users className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="mt-3 space-y-1.5">
              {countryData.map((c) => (
                <div key={c.iso3} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span>{c.flag}</span>
                    <span className="font-medium">{c.name}:</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {c.emp != null ? formatCompact(c.emp) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Professional Compensation */}
        <Card className="border border-border/70 bg-card shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Professional Earnings</span>
              <Banknote className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="mt-3 space-y-1.5">
              {countryData.map((c) => (
                <div key={c.iso3} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span>{c.flag}</span>
                    <span className="font-medium">{c.name}:</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {c.profSalary != null
                      ? basis === "ppp"
                        ? `$${formatNumber(c.profSalary, { maximumFractionDigits: 0 })}`
                        : formatNumber(c.profSalary, { maximumFractionDigits: 0 })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: GDP per Capita */}
        <Card className="border border-border/70 bg-card shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">GDP Per Capita (US$)</span>
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="mt-3 space-y-1.5">
              {countryData.map((c) => (
                <div key={c.iso3} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span>{c.flag}</span>
                    <span className="font-medium">{c.name}:</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {c.gdp != null ? `$${formatCompact(c.gdp)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Strategic Multi-Pillar Radar & Historical Trajectory */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Radar Chart (5 cols) */}
        <div className="lg:col-span-5">
          <ChartCard
            title="Strategic Competitiveness Polygon"
            eyebrow="Multi-Country Benchmark"
            description={`Holistic benchmark across 6 structural pillars normalized among ${selectedCountries.length} countries.`}
            option={radarOption}
            height={360}
            source={{
              name: "Consolidated ILOSTAT, World Bank WDI & Industrial Data",
              note: "Values normalized on a relative 0–100 scale.",
            }}
          />
        </div>

        {/* Historical Trajectory (7 cols) */}
        <div className="lg:col-span-7">
          <ChartCard
            title={`${sectorTitle} Trajectory (2010–2024)`}
            eyebrow="Historical Longitudinal Trend"
            description={`Observed evolution of ${countryData[0]?.latestSector?.indicator_name || "industrial proxy output"}.`}
            toolbar={
              availableSectorIndicators.length > 1 ? (
                <Select
                  value={activeIndicatorId}
                  onValueChange={(val) => setSelectedIndicatorId(val)}
                >
                  <SelectTrigger className="h-7 max-w-[200px] text-[11px] bg-background/90 px-2 py-0 border-border/80 truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSectorIndicators.map((ind) => (
                      <SelectItem key={ind.indicator_id} value={ind.indicator_id} className="text-xs">
                        {ind.indicator_name} ({ind.indicator_unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
            option={trajectoryOption}
            height={360}
            source={{
              name: countryData[0]?.latestSector?.source_name || "World Bank WDI",
              url: countryData[0]?.latestSector?.source_url,
              note: countryData[0]?.latestSector?.proxy_note || "Official sector proxy indicator.",
            }}
          />
        </div>
      </div>

      {/* Section 2: Occupational Compensation Breakdown across ISCO 1-9 */}
      <ChartCard
        title={`Occupational Compensation Structure (${BASIS_LABELS[basis]})`}
        eyebrow="Multi-Country Labor Cost Analysis"
        description={`Comparative monthly earnings across all major ILO ISCO-08 occupational groups in ${selectedYear}.`}
        option={occupationalWageOption}
        height={430}
        source={{
          name: "ILOSTAT Average Monthly Earnings of Employees by Occupation",
          note:
            basis === "ppp"
              ? "Converted to international dollars using World Bank private-consumption PPP factor."
              : "Deflated with World Bank CPI (2010=100) or nominal local currency.",
        }}
      />

      {/* Section 3: 2025-2030 Econometric Horizon Outlook & Macro Parity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Forecast Line Chart (7 cols) */}
        <div className="lg:col-span-7">
          <ChartCard
            title={`Forward Econometric Horizon (2025–2030)`}
            eyebrow="Rolling-Origin Predictive Modeling"
            description={`Model projections with 95% confidence bounds in ${sectorTitle}.`}
            option={forecastOption}
            height={340}
            badge={
              <Badge variant="outline" className="border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                Validated Horizon
              </Badge>
            }
            source={{
              name: "Beyond Borders Horizon Engine v1.0",
              note: "Forecast origin: 2024. Exogenous macroeconomic scenario: continuation of trend.",
            }}
          />
        </div>

        {/* Macro Parity Card (5 cols) */}
        <div className="lg:col-span-5">
          <Card className="h-full border border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Macro Parity &amp; Living Affordability
              </span>
              <CardTitle className="font-display text-lg">Purchasing Power Parity Context</CardTitle>
              <CardDescription className="text-xs">
                Comparative macro indicators across all {selectedCountries.length} active benchmark economies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {countryData.map((c) => (
                <div key={c.iso3} className="rounded-sm border border-border/60 bg-muted/20 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{c.flag}</span>
                      <span>{c.name}</span>
                    </span>
                    <span className="font-mono font-semibold">
                      {c.gdp ? `$${formatNumber(c.gdp, { maximumFractionDigits: 0 })}` : "—"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/30 pt-1">
                    <span>Unemployment: <strong className="text-foreground">{c.uem != null ? `${c.uem.toFixed(1)}%` : "—"}</strong></span>
                    <span>CPI: <strong className="text-foreground">{c.cpi != null ? formatNumber(c.cpi, { maximumFractionDigits: 1 }) : "—"}</strong></span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 4: Documented Industrial Mega-Projects Showcase */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Capital Expenditure &amp; Industrial Footprint
            </span>
            <h3 className="font-display text-xl font-bold tracking-tight">
              Documented Mega-Projects in {sectorTitle}
            </h3>
          </div>
          <Badge variant="outline" className="w-fit font-mono text-[11px] text-muted-foreground">
            {projectRows.length} Real Projects Registered
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {countryData.map((c) => {
            const countryProjects = projectRows.filter((p) => p.country_iso3 === c.iso3);
            return (
              <div key={c.iso3} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                  <span className="text-lg">{c.flag}</span>
                  <h4 className="font-display font-semibold text-foreground text-sm">{c.name}</h4>
                  <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                    {countryProjects.length} Active
                  </Badge>
                </div>

                {countryProjects.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No active mega-projects documented for {c.name} in {sectorTitle}.
                  </p>
                ) : (
                  countryProjects.map((p, idx) => (
                    <Card key={idx} className="border border-border/70 bg-card/60 shadow-xs">
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h5 className="font-semibold text-xs text-foreground">{p.project_name}</h5>
                            <p className="text-[11px] text-muted-foreground">
                              Sponsor: <span className="font-medium text-foreground">{p.sponsor}</span>
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono shrink-0 ${
                              p.status.toLowerCase().includes("construction")
                                ? "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                                : p.status.toLowerCase().includes("operational")
                                ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                            }`}
                          >
                            {p.status}
                          </Badge>
                        </div>

                        <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-border/40 pt-2 text-[11px]">
                          <div>
                            <span className="text-[9px] uppercase text-muted-foreground block">Outlay</span>
                            <span className="font-mono font-semibold text-foreground">
                              {p.investment_usd_million ? `$${formatNumber(p.investment_usd_million)}M` : "Disclosed"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase text-muted-foreground block">Capacity</span>
                            <span className="font-medium text-foreground truncate block" title={p.capacity || ""}>
                              {p.capacity || "Commercial"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase text-muted-foreground block">Jobs</span>
                            <span className="font-mono font-semibold text-foreground">
                              {p.jobs_created ? `${formatNumber(p.jobs_created)}` : "—"}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 5: Granular Multi-Country Evidence Matrix Table */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quantitative Evidence Matrix
              </span>
              <CardTitle className="font-display text-lg">Multi-Country Cross-Sectional Statistics</CardTitle>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              Year {selectedYear} • {selectedCountries.length} Countries Compared
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Metric Dimension</TableHead>
                  <TableHead className="min-w-[100px]">Domain</TableHead>
                  {countryData.map((c) => (
                    <TableHead key={c.iso3} className="min-w-[120px] font-medium">
                      <span className="mr-1">{c.flag}</span>
                      {c.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {/* Sector Core Metric */}
                <TableRow>
                  <TableCell className="font-medium">
                    Sector Core Indicator ({countryData[0]?.latestSector?.indicator_unit || "Unit"})
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Industrial</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.latestSector?.indicator_value != null ? formatNumber(c.latestSector.indicator_value) : "—"}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Workforce */}
                <TableRow>
                  <TableCell className="font-medium">Total Sector Employment</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Workforce</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.emp != null ? formatNumber(c.emp) : "—"}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Professional Wage */}
                <TableRow>
                  <TableCell className="font-medium">
                    Professionals Mean Wage (ISCO 2, {BASIS_LABELS[basis]})
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Compensation</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.profSalary != null ? formatNumber(c.profSalary, { maximumFractionDigits: 0 }) : "—"}
                    </TableCell>
                  ))}
                </TableRow>

                {/* GDP per capita */}
                <TableRow>
                  <TableCell className="font-medium">GDP per Capita (current US$)</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Macro</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.gdp != null ? `$${formatNumber(c.gdp, { maximumFractionDigits: 0 })}` : "—"}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Unemployment */}
                <TableRow>
                  <TableCell className="font-medium">Unemployment Rate (%)</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Macro</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.uem != null ? `${c.uem.toFixed(1)}%` : "—"}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Consumer Price Index */}
                <TableRow>
                  <TableCell className="font-medium">Consumer Price Index (2010=100)</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">Living Cost</Badge>
                  </TableCell>
                  {countryData.map((c) => (
                    <TableCell key={c.iso3} className="font-mono font-medium">
                      {c.cpi != null ? formatNumber(c.cpi, { maximumFractionDigits: 1 }) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
