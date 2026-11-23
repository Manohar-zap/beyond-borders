"use client";

import * as React from "react";
import type { EChartsOption } from "echarts";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  Factory,
  Globe2,
  Layers,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Waves,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import {
  COUNTRY_COLORS,
  barOption,
  statusColor,
  statusLabel,
  timeSeriesOption,
} from "@/lib/chart-theme";
import { FALLBACK_COUNTRIES, FALLBACK_SECTORS } from "@/lib/constants";
import { averageBy, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type {
  CountrySectorRow,
  Envelope,
  EnvelopeMeta,
  ForecastRow,
  ForecastSummaryRow,
  ProjectMeta,
  ValidationRow,
} from "@/lib/types";

type ForecastDataset = "employment" | "salary" | "country_sector" | "living_cost";

const DATASETS: { id: ForecastDataset; label: string }[] = [
  { id: "employment", label: "Employment" },
  { id: "salary", label: "Salary" },
  { id: "country_sector", label: "Sector development" },
  { id: "living_cost", label: "Living cost" },
];

const DATASET_LABELS: Record<string, string> = Object.fromEntries(
  DATASETS.map((dataset) => [dataset.id, dataset.label]),
);

const STATUSES = ["validated", "moderate_error", "high_error"] as const;

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

interface AvailabilityRow {
  dataset: ForecastDataset;
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  occupation_code: string;
  occupation_name: string;
  indicator_id: string;
  indicator_name: string;
  granularity: string;
  validation_status: string;
  forecast_years: number;
  first_target_year: number;
  last_target_year: number;
}

interface OutlookMeta extends EnvelopeMeta {
  actual: {
    year: number;
    value: number | null;
    unit: string;
    source_url: string;
    observation_status: string;
  }[];
  forecast: ForecastRow[];
  unit: string;
  source_url: string;
}

interface OutlookResponse extends Envelope<ForecastRow> {
  meta: OutlookMeta;
}

function seriesKey(row: AvailabilityRow): string {
  return [
    row.dataset,
    row.country_iso3,
    row.sector_id,
    row.occupation_code,
    row.indicator_id,
    row.granularity,
  ].join("|");
}

function seriesLabel(row: AvailabilityRow): string {
  const parts = [row.country_iso3, row.indicator_name];
  if (row.sector_id !== "ALL") parts.push(row.sector_name);
  if (row.occupation_code !== "ALL") parts.push(row.occupation_name);
  if (row.granularity === "division") parts.push("division");
  return parts.join(" · ");
}

export default function ForecastPage() {
  const { countries, countryParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;

  const countryList = projectMeta?.countries?.length ? projectMeta.countries : FALLBACK_COUNTRIES;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;

  // View Mode: 'comparative' vs 'individual'
  const [forecastTab, setForecastTab] = React.useState<"comparative" | "individual">("comparative");

  // -------------------------------------------------------------
  // Comparative Prediction State
  // -------------------------------------------------------------
  const [cmpSector, setCmpSector] = React.useState<string>("semiconductors");
  const [cmpIndicatorId, setCmpIndicatorId] = React.useState<string>("TX.VAL.TECH.CD");
  const [selectedCmpCountries, setSelectedCmpCountries] = React.useState<string[]>([
    "USA", "CHN", "DEU", "JPN", "IND", "GBR"
  ]);
  const [showConfidenceBands, setShowConfidenceBands] = React.useState<boolean>(false);

  const toggleCmpCountry = (iso3: string) => {
    setSelectedCmpCountries((prev) =>
      prev.includes(iso3)
        ? prev.length > 1
          ? prev.filter((c) => c !== iso3)
          : prev
        : [...prev, iso3]
    );
  };
  const selectAllCmpCountries = () => setSelectedCmpCountries(countryList.map((c) => c.iso3));
  const selectTopCmpCountries = () => setSelectedCmpCountries(["USA", "CHN", "DEU", "JPN", "IND", "GBR"]);
  const clearCmpCountries = () => setSelectedCmpCountries([countryList[0]?.iso3 || "USA"]);

  // Keep indicator in sync with sector
  const activeCmpIndicator = React.useMemo(() => {
    const primary = SECTOR_PRIMARY_INDICATORS[cmpSector] || SECTOR_PRIMARY_INDICATORS["semiconductors"];
    if (cmpIndicatorId && (projectMeta?.sector_indicators?.some(
      (si) => si.sector_id === cmpSector && si.indicator_id === cmpIndicatorId
    ) || cmpIndicatorId === primary.id)) {
      return cmpIndicatorId;
    }
    return primary.id;
  }, [cmpIndicatorId, cmpSector, projectMeta]);

  const availableCmpIndicators = React.useMemo(() => {
    const list = (projectMeta?.sector_indicators ?? []).filter((si) => si.sector_id === cmpSector);
    if (list.length > 0) return list;
    const primary = SECTOR_PRIMARY_INDICATORS[cmpSector];
    return primary
      ? [{ sector_id: cmpSector, indicator_id: primary.id, indicator_name: primary.name, indicator_unit: primary.unit }]
      : [];
  }, [projectMeta, cmpSector]);

  // Comparative Forecast Query (all countries)
  const allCountriesParam = countryList.map((c) => c.iso3).join(",");
  const cmpForecastQuery = useApi<Envelope<ForecastRow>>(
    ["cmp-forecast-page", cmpSector, activeCmpIndicator, allCountriesParam],
    "/api/forecast/series",
    {
      countries: allCountriesParam,
      sectors: cmpSector,
      indicators: activeCmpIndicator,
      start: 2025,
      end: 2030,
    },
    { enabled: forecastTab === "comparative" }
  );

  const cmpHistoricalQuery = useApi<Envelope<CountrySectorRow>>(
    ["cmp-forecast-hist-page", cmpSector, activeCmpIndicator, allCountriesParam],
    "/api/sectors/latest",
    {
      countries: allCountriesParam,
      sectors: cmpSector,
      indicators: activeCmpIndicator,
      year: 2024,
    },
    { enabled: forecastTab === "comparative" }
  );

  const cmpForecastRows = cmpForecastQuery.data?.data ?? [];
  const cmpHistoricalRows = cmpHistoricalQuery.data?.data ?? [];

  // Group comparative forecast data per country (filtered by selected comparison countries)
  const comparativeCountryData = React.useMemo(() => {
    return countryList
      .filter((c) => selectedCmpCountries.includes(c.iso3))
      .map((c) => {
        const color = COUNTRY_COLORS[c.iso3] || "#5B6B7C";
        const flag = COUNTRY_FLAGS[c.iso3] || "🌐";

        // 2024 base observation
        const hist = cmpHistoricalRows.find((r) => r.country_iso3 === c.iso3);
        const baseValue = hist?.indicator_value != null ? toNumber(hist.indicator_value) : null;

        // Forecast points 2025-2030 (deduplicated by target_year)
        const fRowsRaw = cmpForecastRows
          .filter((r) => r.country_iso3 === c.iso3 && (r.indicator_id === activeCmpIndicator || !r.indicator_id))
          .sort((a, b) => a.target_year - b.target_year);

        const yearMap = new Map<number, ForecastRow>();
        for (const r of fRowsRaw) {
          if (!yearMap.has(r.target_year)) {
            yearMap.set(r.target_year, r);
          }
        }
        const fRows = Array.from(yearMap.values()).sort((a, b) => a.target_year - b.target_year);

        const f2030 = fRows.find((r) => r.target_year === 2030)?.predicted_value ?? null;
        const status = fRows[0]?.validation_status ?? "validated";
        const mape = fRows[0]?.validation_mape ?? null;
        const unit = fRows[0]?.indicator_unit ?? hist?.indicator_unit ?? "";

        // Compute 5-year CAGR (2024 to 2030 = 6 years)
        let cagr: number | null = null;
        let netChange: number | null = null;
        if (baseValue !== null && f2030 !== null && baseValue > 0 && f2030 > 0) {
          cagr = (Math.pow(f2030 / baseValue, 1 / 6) - 1) * 100;
          netChange = f2030 - baseValue;
        }

        return {
          iso3: c.iso3,
          name: c.name,
          color,
          flag,
          baseValue,
          f2030,
          netChange,
          cagr,
          status,
          mape,
          unit,
          fRows,
        };
      });
  }, [countryList, selectedCmpCountries, cmpHistoricalRows, cmpForecastRows, activeCmpIndicator]);

  // Comparative ECharts Multi-line Option
  const cmpForecastOption: EChartsOption = React.useMemo(() => {
    const seriesData = comparativeCountryData
      .filter((c) => c.fRows.length > 0)
      .map((c) => ({
        name: c.name,
        color: c.color,
        dashed: true,
        points: c.fRows.map((r) => ({ year: r.target_year, value: r.predicted_value })),
      }));

    const bands = showConfidenceBands
      ? comparativeCountryData
          .filter((c) => c.fRows.length > 0)
          .map((c) => ({
            name: `${c.name} 95% Interval`,
            color: c.color,
            points: c.fRows.map((r) => ({
              year: r.target_year,
              lower: r.lower_interval,
              upper: r.upper_interval,
            })),
          }))
      : [];

    const unit = comparativeCountryData[0]?.unit || "";

    return timeSeriesOption({
      series: seriesData,
      bands,
      xMin: 2025,
      xMax: 2030,
      yName: unit,
      valueFormatter: (v) => formatCompact(v),
    });
  }, [comparativeCountryData, showConfidenceBands]);

  // -------------------------------------------------------------
  // Individual Prediction State
  // -------------------------------------------------------------
  const [selectedCountry, setSelectedCountry] = React.useState<string>("ALL");
  const [dataset, setDataset] = React.useState<ForecastDataset>("employment");
  const [selection, setSelection] = React.useState<string>("");
  const [search, setSearch] = React.useState("");

  const validationQuery = useApi<Envelope<ValidationRow>>(
    ["forecast-validation", countryParam],
    "/api/forecast/validation",
    { countries: countryParam },
  );

  const summaryQuery = useApi<Envelope<ForecastSummaryRow>>(
    ["forecast-summary-page"],
    "/api/forecast/summary",
  );

  const availabilityQuery = useApi<Envelope<AvailabilityRow>>(
    ["forecast-availability-all", countryParam],
    "/api/forecast/availability",
    { countries: countryParam },
    { staleTime: 10 * 60 * 1000 },
  );

  const validationRows = validationQuery.data?.data ?? [];
  const summaryRows = summaryQuery.data?.data ?? [];
  const allAvailabilityRows = availabilityQuery.data?.data ?? [];

  // Series count per dataset for the currently selected country
  const datasetSeriesCounts = React.useMemo(() => {
    const counts: Record<ForecastDataset, number> = {
      employment: 0,
      salary: 0,
      country_sector: 0,
      living_cost: 0,
    };
    for (const r of allAvailabilityRows) {
      if (selectedCountry === "ALL" || r.country_iso3 === selectedCountry) {
        if (r.dataset in counts) {
          counts[r.dataset as ForecastDataset]++;
        }
      }
    }
    return counts;
  }, [allAvailabilityRows, selectedCountry]);

  // Auto-switch dataset if current dataset has 0 series for the chosen country
  React.useEffect(() => {
    if (selectedCountry === "ALL") return;
    if (allAvailabilityRows.length === 0) return;
    if ((datasetSeriesCounts[dataset] ?? 0) === 0) {
      const priorityOrder: ForecastDataset[] = ["country_sector", "living_cost", "employment", "salary"];
      const best = priorityOrder.find((d) => (datasetSeriesCounts[d] ?? 0) > 0);
      if (best && best !== dataset) {
        setDataset(best);
        setSelection("");
        setSearch("");
      }
    }
  }, [selectedCountry, datasetSeriesCounts, dataset, allAvailabilityRows.length]);

  const availabilityRows = React.useMemo(() => {
    return allAvailabilityRows.filter((r) => r.dataset === dataset);
  }, [allAvailabilityRows, dataset]);

  const filteredAvailability = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return availabilityRows
      .filter((row) => {
        if (selectedCountry !== "ALL" && row.country_iso3 !== selectedCountry) {
          return false;
        }
        if (query) {
          return `${seriesLabel(row)} ${row.indicator_id} ${row.sector_id} ${row.occupation_code}`
            .toLowerCase()
            .includes(query);
        }
        return true;
      })
      .sort((a, b) => {
        const statusOrder = (value: string) =>
          value === "validated" ? 0 : value === "moderate_error" ? 1 : 2;
        return (
          statusOrder(a.validation_status) - statusOrder(b.validation_status) ||
          a.country_iso3.localeCompare(b.country_iso3) ||
          a.sector_id.localeCompare(b.sector_id) ||
          a.indicator_id.localeCompare(b.indicator_id)
        );
      });
  }, [availabilityRows, search, selectedCountry]);

  React.useEffect(() => {
    if (!filteredAvailability.length) {
      setSelection("");
      return;
    }
    if (!filteredAvailability.some((row) => seriesKey(row) === selection)) {
      setSelection(seriesKey(filteredAvailability[0]));
    }
  }, [filteredAvailability, selection]);

  const selectedRow = filteredAvailability.find((row) => seriesKey(row) === selection) ?? null;

  const outlookQuery = useApi<OutlookResponse>(
    [
      "forecast-outlook",
      selectedRow?.dataset,
      selectedRow?.country_iso3,
      selectedRow?.sector_id,
      selectedRow?.occupation_code,
      selectedRow?.indicator_id,
      selectedRow?.granularity,
    ],
    "/api/forecast/outlook",
    {
      dataset: selectedRow?.dataset,
      country_iso3: selectedRow?.country_iso3,
      sector_id: selectedRow?.sector_id,
      occupation_code: selectedRow?.occupation_code,
      indicator_id: selectedRow?.indicator_id,
      granularity: selectedRow?.granularity,
    },
    { enabled: Boolean(selectedRow) && forecastTab === "individual" },
  );

  // Strictly clear data when there is no valid selected series to prevent ghost graphs from previous countries
  const actualRows = selectedRow ? (outlookQuery.data?.meta?.actual ?? []) : [];
  const forecastRows = selectedRow ? (outlookQuery.data?.meta?.forecast ?? []) : [];
  const unit = selectedRow ? (outlookQuery.data?.meta?.unit ?? selectedRow?.indicator_name ?? "") : "";

  const actualSeries = React.useMemo(
    () => ({
      name: "Observed",
      color: "#101720",
      points: selectedRow
        ? actualRows
            .filter((row) => toNumber(row.value) !== null)
            .map((row) => ({ year: row.year, value: toNumber(row.value) }))
        : [],
    }),
    [actualRows, selectedRow],
  );

  const lastActual = actualSeries.points[actualSeries.points.length - 1];

  const forecastSeries = React.useMemo(
    () => ({
      name: "Forecast (baseline)",
      color: "#A9661B",
      dashed: true,
      points: selectedRow
        ? [
            ...(lastActual ? [{ year: lastActual.year, value: lastActual.value }] : []),
            ...forecastRows.map((row) => ({
              year: row.target_year,
              value: toNumber(row.predicted_value),
            })),
          ]
        : [],
    }),
    [forecastRows, lastActual, selectedRow],
  );

  const bands = React.useMemo(
    () =>
      selectedRow && forecastRows.length > 0
        ? [
            {
              name: "80% interval",
              color: "#A9661B",
              points: [
                ...(lastActual
                  ? [{ year: lastActual.year, lower: lastActual.value ?? 0, upper: lastActual.value ?? 0 }]
                  : []),
                ...forecastRows
                  .filter(
                    (row) =>
                      toNumber(row.lower_interval) !== null && toNumber(row.upper_interval) !== null,
                  )
                  .map((row) => ({
                    year: row.target_year,
                    lower: toNumber(row.lower_interval) as number,
                    upper: toNumber(row.upper_interval) as number,
                  })),
              ],
            },
          ]
        : [],
    [forecastRows, lastActual, selectedRow],
  );

  const forecastOrigin =
    forecastRows[0]?.forecast_origin ??
    (actualSeries.points.length ? actualSeries.points[actualSeries.points.length - 1].year : 2024);

  const validationStatus = forecastRows[0]?.validation_status ?? selectedRow?.validation_status;
  const validationMape = forecastRows[0]?.validation_mape ?? null;
  const validationRmse = forecastRows[0]?.validation_rmse ?? null;
  const validationCoverage = forecastRows[0]?.validation_coverage_pct ?? null;
  const modelName = forecastRows[0]?.model_name ?? "—";

  const totalSeries = validationRows.length;
  const validatedSeries = validationRows.filter(
    (row) => row.validation_status === "validated",
  ).length;
  const totalForecastRows = validationRows.reduce(
    (sum, row) => sum + (row.forecast_rows ?? 0),
    0,
  );
  const meanMape = averageBy(
    validationRows.filter((row) => row.validation_mape !== null),
    (row) => row.validation_mape,
  );
  const modelVersion =
    (meta?.forecast?.model_version as string | undefined) ??
    (summaryQuery.data?.meta as { model_version?: string } | undefined)?.model_version ??
    "bb-forecast-1.0.0";

  const outlookSource =
    outlookQuery.data?.meta?.source_url ?? forecastRows[0]?.source_url ?? "";

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <PageHeader
        eyebrow="Section 04 · Forecast & Future Outlook"
        title="Econometric Forecasts & Horizon Outlook (2025–2030)"
        description="Damped-trend Holt and OLS predictive models for eligible annual series, featuring holdout backtested validation, residual confidence intervals, and comparative multi-country growth horizons."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="warning">Model output · not observed</Badge>
            <Badge variant="outline">2025–2030 Horizon</Badge>
            <Badge variant="outline">{modelVersion}</Badge>
            <Badge variant="secondary">Holdout validated</Badge>
          </div>
        }
      />

      {/* Top Navigation Mode Tabs: Comparative vs Individual */}
      <Card className="border border-border/70 bg-card/60 shadow-xs">
        <CardContent className="p-3 sm:p-4">
          <Tabs
            value={forecastTab}
            onValueChange={(v) => setForecastTab(v as "comparative" | "individual")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-muted/70 p-1">
              <TabsTrigger value="comparative" className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold">
                <Scale className="h-4 w-4 text-teal" /> Multi-Country Horizon Comparison
              </TabsTrigger>
              <TabsTrigger value="individual" className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-amber-600" /> Individual Series Drilldown &amp; Validation
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* ============================================================= */}
      {/* TAB 1: COMPARATIVE HORIZON VIEW */}
      {/* ============================================================= */}
      {forecastTab === "comparative" && (
        <div className="space-y-6">
          {/* Comparative Controls */}
          <Card className="border border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Country Comparison Selector */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-teal" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Compare Countries ({selectedCmpCountries.length} of {countryList.length} Selected)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCmpCountries}
                      className="text-[11px] font-medium text-teal hover:underline"
                    >
                      All (15)
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                      type="button"
                      onClick={selectTopCmpCountries}
                      className="text-[11px] font-medium text-teal hover:underline"
                    >
                      Top 6 (G6)
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                      type="button"
                      onClick={clearCmpCountries}
                      className="text-[11px] font-medium text-muted-foreground hover:underline"
                    >
                      Reset
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                      type="button"
                      onClick={() => setShowConfidenceBands(!showConfidenceBands)}
                      className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        showConfidenceBands
                          ? "bg-teal/15 text-teal border border-teal/30"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {showConfidenceBands ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      95% Confidence Bounds
                    </button>
                  </div>
                </div>

                {/* Country Toggle Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {countryList.map((c) => {
                    const isSelected = selectedCmpCountries.includes(c.iso3);
                    const color = COUNTRY_COLORS[c.iso3] || "#5B6B7C";
                    const flag = COUNTRY_FLAGS[c.iso3] || "🌐";
                    return (
                      <button
                        key={c.iso3}
                        type="button"
                        onClick={() => toggleCmpCountry(c.iso3)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-surface shadow-xs border border-border text-foreground font-semibold"
                            : "bg-muted/20 text-muted-foreground hover:bg-muted/50 border border-transparent opacity-65"
                        }`}
                        style={isSelected ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
                      >
                        <span>{flag}</span>
                        <span>{c.name}</span>
                        {isSelected && <Check className="h-3 w-3 text-teal ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sector & Indicator Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-12 items-end border-t border-border/50 pt-4">
                {/* Sector Selector */}
                <div className="md:col-span-6">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Factory className="h-3.5 w-3.5 text-blue-600" /> Target Industrial Sector
                  </label>
                  <Select value={cmpSector} onValueChange={(val) => { setCmpSector(val); setCmpIndicatorId(""); }}>
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

                {/* Indicator Selector */}
                <div className="md:col-span-6">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5 text-teal" /> Target Metric Indicator
                  </label>
                  <Select value={activeCmpIndicator} onValueChange={setCmpIndicatorId}>
                    <SelectTrigger className="h-10 bg-background font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCmpIndicators.map((ind) => (
                        <SelectItem key={ind.indicator_id} value={ind.indicator_id}>
                          {ind.indicator_name} ({ind.indicator_unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparative Horizon Line Chart */}
          <ChartCard
            title={`${sectorList.find((s) => s.id === cmpSector)?.name ?? cmpSector} — Comparative Horizon (2025–2030)`}
            eyebrow="Comparative Cross-Country Forecast"
            description={`Model projections across ${comparativeCountryData.length} selected economies on identical indicator (${availableCmpIndicators.find((i) => i.indicator_id === activeCmpIndicator)?.indicator_name ?? "Core indicator"}).`}
            option={cmpForecastOption}
            height={380}
            badge={<Badge variant="outline" className="border-teal/30 bg-teal/5 text-teal font-mono text-[10px]">{comparativeCountryData.length} COUNTRIES OVERLAY</Badge>}
            source={{
              name: "Beyond Borders Econometric Horizon Engine v1.0",
              note: "Damped Holt/OLS trend projections with 95% confidence bounds.",
            }}
          />

          {/* 2025-2030 Growth & CAGR Ranking Table */}
          <Card className="border border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Expansion Momentum Rankings
                  </span>
                  <CardTitle className="font-display text-lg">Projected 2024–2030 Growth League Table</CardTitle>
                </div>
                <Badge variant="outline" className="w-fit font-mono text-xs text-muted-foreground">
                  Sorted by Projected CAGR
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Rank</TableHead>
                      <TableHead className="min-w-[160px]">Country</TableHead>
                      <TableHead className="text-right min-w-[120px]">2024 Baseline</TableHead>
                      <TableHead className="text-right min-w-[120px]">2030 Projected</TableHead>
                      <TableHead className="text-right min-w-[130px]">Net Expansion</TableHead>
                      <TableHead className="text-right min-w-[120px]">Projected CAGR</TableHead>
                      <TableHead className="min-w-[120px]">Model Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Holdout MAPE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {comparativeCountryData
                      .slice()
                      .sort((a, b) => (b.cagr ?? -999) - (a.cagr ?? -999))
                      .map((c, index) => (
                        <TableRow key={c.iso3}>
                          <TableCell className="font-mono font-bold text-muted-foreground">
                            #{index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="mr-1.5">{c.flag}</span>
                            <span>{c.name}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {c.baseValue != null ? formatCompact(c.baseValue) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {c.f2030 != null ? formatCompact(c.f2030) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {c.netChange != null ? `+${formatCompact(c.netChange)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {c.cagr != null ? formatSignedPercent(c.cagr) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                c.status === "validated"
                                  ? "success"
                                  : c.status === "moderate_error"
                                  ? "warning"
                                  : "danger"
                              }
                              className="text-[10px]"
                            >
                              {statusLabel(c.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {c.mape != null ? formatPercent(c.mape) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: INDIVIDUAL SERIES PREDICTION VIEW */}
      {/* ============================================================= */}
      {forecastTab === "individual" && (
        <div className="space-y-8">
          {/* Top KPI Portfolio Cards */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Forecast series"
              value={formatCompact(totalSeries)}
              unit="series"
              hint={`${countries.length} selected countries`}
              tone="violet"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Validated series"
              value={formatCompact(validatedSeries)}
              unit={`of ${totalSeries}`}
              hint="Holdout MAPE ≤ 10%"
              tone="teal"
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <KpiCard
              label="Forecast rows"
              value={formatCompact(totalForecastRows)}
              unit="rows"
              hint="Six target years per series"
              tone="blue"
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <KpiCard
              label="Mean holdout MAPE"
              value={meanMape === null ? "—" : formatPercent(meanMape)}
              unit=""
              hint="Average across selected series"
              tone={meanMape !== null && meanMape <= 0.1 ? "teal" : "amber"}
              icon={<Waves className="h-4 w-4" />}
            />
          </section>

          {/* Series Picker Card */}
          <Card className="border border-border/70 shadow-xs">
            <CardContent className="grid gap-3 pt-5 lg:grid-cols-12">
              <div className="space-y-1.5 lg:col-span-3">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-1">
                  <Globe2 className="h-3 w-3 text-teal" /> Country Filter
                </label>
                <Select
                  value={selectedCountry}
                  onValueChange={(value) => {
                    setSelectedCountry(value);
                    setSelection("");
                  }}
                >
                  <SelectTrigger className="h-10 bg-background font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">🌐 All Countries ({countryList.length})</SelectItem>
                    {countryList.map((c) => (
                      <SelectItem key={c.iso3} value={c.iso3}>
                        {COUNTRY_FLAGS[c.iso3] ?? "🌐"} {c.name} ({c.iso3})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 lg:col-span-3">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Dataset
                </label>
                <Select
                  value={dataset}
                  onValueChange={(value) => {
                    setDataset(value as ForecastDataset);
                    setSelection("");
                    setSearch("");
                  }}
                >
                  <SelectTrigger className="h-10 bg-background font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATASETS.map((item) => {
                      const count = datasetSeriesCounts[item.id] ?? 0;
                      return (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{item.label}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                count > 0
                                  ? "bg-teal/15 text-teal font-semibold"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {count} series
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Search series
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Indicator, sector…"
                    className="pl-8 h-10 bg-background text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5 lg:col-span-4">
                <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Series ({filteredAvailability.length} eligible)
                </label>
                <Select value={selection} onValueChange={setSelection}>
                  <SelectTrigger className="h-10 bg-background font-medium">
                    <SelectValue placeholder="Select a validated series" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredAvailability.map((row) => (
                      <SelectItem key={seriesKey(row)} value={seriesKey(row)} className="text-xs">
                        {seriesLabel(row)} — {statusLabel(row.validation_status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Informative notification if the chosen dataset has 0 series for this country */}
              {datasetSeriesCounts[dataset] === 0 && selectedCountry !== "ALL" && (
                <div className="lg:col-span-12 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 mt-1">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {countryList.find((c) => c.iso3 === selectedCountry)?.name || selectedCountry} has no eligible {DATASETS.find((d) => d.id === dataset)?.label.toLowerCase()} forecast series.
                    </p>
                    <p className="text-muted-foreground">
                      Holdout validation requires at least 8 consecutive annual observations. Official ILOSTAT reporting has fewer than 8 observations for this domain in {countryList.find((c) => c.iso3 === selectedCountry)?.name || selectedCountry}.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 font-medium text-xs">
                      <span>Available forecast domains:</span>
                      {datasetSeriesCounts.country_sector > 0 && (
                        <button
                          type="button"
                          onClick={() => setDataset("country_sector")}
                          className="text-teal underline font-bold hover:opacity-80"
                        >
                          Sector Development ({datasetSeriesCounts.country_sector} series)
                        </button>
                      )}
                      {datasetSeriesCounts.living_cost > 0 && (
                        <button
                          type="button"
                          onClick={() => setDataset("living_cost")}
                          className="text-teal underline font-bold hover:opacity-80"
                        >
                          Living Cost ({datasetSeriesCounts.living_cost} series)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Individual Chart & Metadata */}
          <section className="grid gap-4 lg:grid-cols-12">
            <ChartCard
              className="lg:col-span-8"
              eyebrow="Observed vs model"
              title={selectedRow ? seriesLabel(selectedRow) : "Select a series"}
              description={
                selectedRow
                  ? `${selectedRow.indicator_name} in ${unit}. Solid line: observed history. Dashed line and shaded band: baseline forecast with 80% residual interval.`
                  : "Select an eligible series above to inspect historical observations and model projections."
              }
              option={timeSeriesOption({
                series: selectedRow && actualSeries.points.length ? [actualSeries, forecastSeries] : [],
                bands,
                xMin: actualSeries.points[0]?.year ?? 2010,
                xMax: 2030,
                yName: unit,
                valueFormatter: (value) => `${formatNumber(value)} ${unit}`,
                markLine:
                  actualSeries.points.length && forecastRows.length
                    ? { year: forecastOrigin + 0.5, label: "Forecast →" }
                    : undefined,
              })}
              height={400}
              source={{
                name: "ILOSTAT / World Bank observations; model-generated forecast",
                url: outlookSource || "https://ilostat.ilo.org/",
                note: "Forecast path is not an observation. Intervals reflect historical residual uncertainty only.",
              }}
              csvRows={[
                ...actualRows.map((row) => ({
                  series: selectedRow ? seriesLabel(selectedRow) : "",
                  year: row.year,
                  value: row.value,
                  lower_interval: null,
                  upper_interval: null,
                  type: "observed",
                  unit: row.unit,
                })),
                ...forecastRows.map((row) => ({
                  series: row.series_label,
                  year: row.target_year,
                  value: row.predicted_value,
                  lower_interval: row.lower_interval,
                  upper_interval: row.upper_interval,
                  type: "forecast",
                  unit: row.indicator_unit,
                  validation_status: row.validation_status,
                  validation_mape: row.validation_mape,
                  model_name: row.model_name,
                })),
              ]}
              csvFilename={selectedRow ? `forecast-${seriesKey(selectedRow)}` : "forecast-outlook"}
              badge={<Badge variant="warning">Model output</Badge>}
              isLoading={outlookQuery.isLoading}
              error={outlookQuery.error}
              isEmpty={!selectedRow || (!forecastRows.length && !actualRows.length)}
              onRetry={() => void outlookQuery.refetch()}
              footnote={
                selectedRow
                  ? `Origin year ${forecastOrigin}. ${actualRows.length} observed years and ${forecastRows.length} forecast years. Intervals are 80% empirical residual intervals, widening with horizon.`
                  : undefined
              }
            />

            <Card className="lg:col-span-4 border border-border/70 shadow-xs">
              <CardHeader className="pb-3">
                <div className="eyebrow">Series card</div>
                <CardTitle className="text-[15px]">Validation and provenance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                {selectedRow ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        variant={
                          validationStatus === "validated"
                            ? "success"
                            : validationStatus === "moderate_error"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {validationStatus ? statusLabel(validationStatus) : "—"}
                      </Badge>
                    </div>
                    <Row label="Holdout MAPE" value={validationMape === null ? "Unavailable" : formatPercent(validationMape)} />
                    <Row label="Holdout RMSE" value={validationRmse === null ? "Unavailable" : formatNumber(validationRmse, { maximumFractionDigits: 2 })} />
                    <Row label="Interval coverage" value={validationCoverage === null ? "Unavailable" : formatPercent(validationCoverage)} />
                    <Row label="Model" value={modelName} />
                    <Row label="Origin" value={String(forecastOrigin)} />
                    <Row label="Horizon" value="2025–2030" />
                    <Row label="Granularity" value={selectedRow.granularity} />
                    <div className="border-t border-border/60 pt-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Series label
                      </p>
                      <p className="mt-1 leading-relaxed text-foreground font-medium">{seriesLabel(selectedRow)}</p>
                    </div>
                    <div className="rounded-sm border border-[#E7D3B3] bg-[#FAF1E3] p-2.5 text-[11px] leading-relaxed text-[#6E4512] dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                      Baseline trend projection. It does not incorporate policy changes, technology shocks, or structural turning points.
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a series to inspect holdout validation and model metadata.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Full Validation Detail Table */}
          <Card className="border border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Validation detail
              </span>
              <CardTitle className="font-display text-lg">Holdout Backtest Portfolio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Series</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">MAPE</TableHead>
                      <TableHead className="text-right">RMSE</TableHead>
                      <TableHead className="text-right">Holdout N</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Years</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationRows
                      .slice()
                      .sort((a, b) => {
                        const order = (value: string) =>
                          value === "validated" ? 0 : value === "moderate_error" ? 1 : 2;
                        return (
                          order(a.validation_status) - order(b.validation_status) ||
                          a.dataset.localeCompare(b.dataset) ||
                          a.country_iso3.localeCompare(b.country_iso3)
                        );
                      })
                      .slice(0, 150)
                      .map((row, index) => (
                        <TableRow key={`${row.dataset}-${row.country_iso3}-${row.indicator_id}-${row.sector_id}-${row.occupation_code}-${index}`}>
                          <TableCell className="text-xs">{DATASET_LABELS[row.dataset] ?? row.dataset}</TableCell>
                          <TableCell className="font-mono text-xs">{row.country_iso3}</TableCell>
                          <TableCell className="max-w-[320px]">
                            <span className="block truncate text-xs">{row.series_label}</span>
                            <span className="font-mono text-[9px] text-muted-foreground">
                              {row.indicator_id} · {row.granularity}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.validation_status === "validated"
                                  ? "success"
                                  : row.validation_status === "moderate_error"
                                  ? "warning"
                                  : "danger"
                              }
                              className="text-[10px]"
                            >
                              {statusLabel(row.validation_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.validation_mape === null ? "—" : formatPercent(row.validation_mape)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.validation_rmse === null ? "—" : formatNumber(row.validation_rmse, { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{row.validation_n ?? "—"}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs">{row.model_name}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{row.forecast_rows}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-[11px] font-medium text-foreground">{value}</span>
    </div>
  );
}
