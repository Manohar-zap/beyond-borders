"use client";

import * as React from "react";
import { AlertTriangle, Database, Info, Layers3, TrendingUp } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useApi } from "@/lib/api";
import { COUNTRY_COLORS, SECTOR_COLORS, barOption, timeSeriesOption } from "@/lib/chart-theme";
import { FALLBACK_SECTORS } from "@/lib/constants";
import { cagr, groupRows, latestRows, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type {
  CountrySectorRow,
  Envelope,
  ProjectMeta,
  SectorGrowthRow,
  SectorIndicator,
} from "@/lib/types";
import { useMeta } from "@/components/providers/meta-provider";

export default function SectorsPage() {
  const { countries, sectors, from, to, countryParam, sectorParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;

  const indicatorsQuery = useApi<Envelope<SectorIndicator>>(
    ["sector-indicators"],
    "/api/sectors/indicators",
  );

  const [indicatorId, setIndicatorId] = React.useState<string>("");
  const allIndicators = indicatorsQuery.data?.data ?? projectMeta?.sector_indicators ?? [];
  const available = React.useMemo(
    () => allIndicators.filter((indicator) => sectors.includes(indicator.sector_id)),
    [allIndicators, sectors],
  );
  const active =
    available.find((indicator) => indicator.indicator_id === indicatorId) ?? available[0];

  React.useEffect(() => {
    if (active && active.indicator_id !== indicatorId) {
      setIndicatorId(active.indicator_id);
    }
  }, [active, indicatorId]);

  const sectorName =
    projectMeta?.sectors?.find((sector) => sector.id === active?.sector_id)?.name ??
    FALLBACK_SECTORS.find((sector) => sector.id === active?.sector_id)?.name ??
    active?.sector_name ??
    "Sector";

  const seriesQuery = useApi<Envelope<CountrySectorRow>>(
    ["sector-series", countryParam, active?.sector_id, active?.indicator_id, from, to],
    "/api/sectors/series",
    {
      countries: countryParam,
      sectors: active?.sector_id,
      indicators: active?.indicator_id,
      start: from,
      end: to,
    },
    { enabled: Boolean(active) },
  );

  const growthQuery = useApi<Envelope<SectorGrowthRow>>(
    ["sector-growth", countryParam, sectorParam, from, to],
    "/api/sectors/growth",
    {
      countries: countryParam,
      sectors: sectorParam,
      start: from,
      end: to,
    },
  );

  const rows = seriesQuery.data?.data ?? [];
  const growthRows = growthQuery.data?.data ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );

  const series = React.useMemo(() => {
    const groups = groupRows(rows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row.indicator_value) })),
    }));
  }, [rows, countryNames]);

  const latest = React.useMemo(
    () =>
      latestRows(rows, {
        time: (row) => row.year,
        group: (row) => row.country_iso3,
        value: (row) => row.indicator_value,
      })
        .filter((row) => toNumber(row.indicator_value) !== null)
        .sort((a, b) => (toNumber(b.indicator_value) ?? 0) - (toNumber(a.indicator_value) ?? 0)),
    [rows],
  );

  const latestYear = latest.length ? Math.max(...latest.map((row) => row.year)) : to;
  const unit = active?.indicator_unit ?? rows[0]?.indicator_unit ?? "";
  const sourceUrl =
    rows[0]?.source_url ?? `https://data.worldbank.org/indicator/${active?.indicator_id ?? ""}`;

  const latestValue = latest[0] ? toNumber(latest[0].indicator_value) : null;
  const firstSeries = latest[0]
    ? rows
        .filter((row) => row.country_iso3 === latest[0].country_iso3)
        .sort((a, b) => a.year - b.year)
    : [];
  const firstValue = firstSeries.length ? toNumber(firstSeries[0].indicator_value) : null;
  const firstYear = firstSeries.length ? firstSeries[0].year : null;
  const growthRate =
    firstYear !== null ? cagr(firstValue, latestValue, latestYear - firstYear) : null;

  const growthChartRows = React.useMemo(
    () =>
      growthRows
        .filter((row) => row.cagr_pct !== null)
        .sort((a, b) => (b.cagr_pct ?? 0) - (a.cagr_pct ?? 0))
        .slice(0, 12),
    [growthRows],
  );

  const activeIndicators = allIndicators.filter((indicator) =>
    sectors.includes(indicator.sector_id),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 02 · Global sector development"
        title="Sector development, read through documented indicators"
        description="Five sectors are tracked with World Bank indicators selected as transparent proxies. Every observation exposes its indicator name, unit, proxy status and source URL. These series describe enabling conditions and outputs; they are not a harmonised sector accounts system."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{sectors.length} sectors selected</Badge>
            <Badge variant="outline">{activeIndicators.length} indicators in view</Badge>
            <Badge variant="warning">Proxy indicators flagged</Badge>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active indicator"
          value={active?.indicator_id ?? "—"}
          hint={active?.indicator_name ?? "Select a sector"}
          tone="blue"
          icon={<Database className="h-4 w-4" />}
        />
        <KpiCard
          label="Latest observed"
          value={latest[0] ? formatCompact(latestValue) : "Unavailable"}
          unit={unit}
          hint={latest[0] ? `${latest[0].country_name} · ${latest[0].year}` : "No observations"}
          tone="teal"
          icon={<Layers3 className="h-4 w-4" />}
        />
        <KpiCard
          label="Selected-window growth"
          value={growthRate === null ? "Unavailable" : formatSignedPercent(growthRate)}
          unit={growthRate === null ? undefined : "CAGR"}
          hint={
            firstYear !== null
              ? `${latest[0]?.country_name ?? "Lead country"} · ${firstYear}–${latestYear}`
              : "At least two positive endpoints required"
          }
          delta={growthRate}
          deltaLabel="compound annual"
          tone="amber"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Indicator coverage"
          value={formatPercent(active?.observations ? (active.observations / (active.countries * 15)) * 100 : null)}
          hint={
            active
              ? `${active.countries} countries · ${active.year_min}–${active.year_max}`
              : "No indicator selected"
          }
          tone="violet"
          icon={<Info className="h-4 w-4" />}
        />
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="space-y-1">
          <div className="eyebrow">Indicator explorer</div>
          <p className="text-sm font-medium text-ink">{sectorName}</p>
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            {active?.indicator_name ?? "Choose an indicator to inspect observed values."}{" "}
            {active?.is_proxy ? "This indicator is a proxy for the sector, not sector-specific output." : "Directly reported sector indicator."}
          </p>
        </div>
        <div className="w-full sm:w-[360px]">
          <Select value={active?.indicator_id ?? ""} onValueChange={setIndicatorId}>
            <SelectTrigger>
              <SelectValue placeholder="Select indicator" />
            </SelectTrigger>
            <SelectContent>
              {available.map((indicator) => (
                <SelectItem key={`${indicator.sector_id}-${indicator.indicator_id}`} value={indicator.indicator_id}>
                  {indicator.sector_name} — {indicator.indicator_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-8"
          eyebrow="Observed annual series"
          title={`${active?.indicator_name ?? "Sector indicator"} — country trajectories`}
          description={`${sectorName}. ${active?.indicator_name ?? ""} in ${unit}. Solid lines are observed values; gaps are not interpolated.`}
          option={timeSeriesOption({
            series,
            xMin: from,
            xMax: to,
            yName: unit,
            valueFormatter: (value) => `${formatNumber(value)} ${unit}`,
          })}
          height={360}
          source={{
            name: "World Bank — World Development Indicators",
            url: sourceUrl,
            note: active?.is_proxy
              ? `Proxy: ${active.proxy_note}`
              : "Directly reported indicator in the selected sector frame.",
          }}
          csvRows={rows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            sector_id: row.sector_id,
            sector_name: row.sector_name,
            year: row.year,
            indicator_id: row.indicator_id,
            indicator_name: row.indicator_name,
            indicator_value: row.indicator_value,
            indicator_unit: row.indicator_unit,
            is_proxy: row.is_proxy,
            source_url: row.source_url,
          }))}
          csvFilename={`sector-${active?.indicator_id ?? "indicator"}-series`}
          isLoading={seriesQuery.isLoading || indicatorsQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!rows.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-4"
          eyebrow="Latest snapshot"
          title="Most recent value by country"
          description="Each bar is the latest observation available for that country, not necessarily the same year."
          option={barOption({
            categories: latest.map((row) => row.country_iso3),
            series: [
              {
                name: active?.indicator_name ?? "Latest value",
                values: latest.map((row) => toNumber(row.indicator_value)),
                color: "#A9661B",
              },
            ],
            valueFormatter: (value) => `${formatNumber(value)} ${unit}`,
            yName: unit,
          })}
          height={360}
          source={{
            name: "World Bank — World Development Indicators",
            url: sourceUrl,
            note: "Latest available value within the selected year window.",
          }}
          csvRows={latest.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            indicator_id: row.indicator_id,
            indicator_name: row.indicator_name,
            value: row.indicator_value,
            unit: row.indicator_unit,
            is_proxy: row.is_proxy,
            source_url: row.source_url,
          }))}
          csvFilename={`sector-${active?.indicator_id ?? "indicator"}-latest`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!latest.length}
          onRetry={() => void seriesQuery.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Cross-sector comparison"
        title="Compound annual growth in the selected window"
        description="Top positive and negative CAGRs across the selected countries, sectors and indicators. A CAGR is computed only when both endpoints are observed and positive; gaps are never filled."
      />

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Growth ranking"
          title="Largest CAGR by country · sector · indicator"
          description="Ranked by compound annual growth across the first and last observed years inside the global year filter."
          option={barOption({
            categories: growthChartRows.map(
              (row) => `${row.country_iso3} · ${row.sector_name.split(" ")[0]} · ${row.indicator_id}`,
            ),
            series: [
              {
                name: "CAGR",
                values: growthChartRows.map((row) => row.cagr_pct),
                color: "#2457A6",
              },
            ],
            horizontal: true,
            valueFormatter: (value) => formatSignedPercent(value),
          })}
          height={420}
          source={{
            name: "World Bank WDI; CAGR computed in the API",
            url: "https://data.worldbank.org/",
            note: "Uses first and last observed values in the selected window.",
          }}
          csvRows={growthChartRows.map((row) => ({
            country_iso3: row.country_iso3,
            sector_id: row.sector_id,
            indicator_id: row.indicator_id,
            first_year: row.first_year,
            first_value: row.first_value,
            last_year: row.last_year,
            last_value: row.last_value,
            cagr_pct: row.cagr_pct,
            is_proxy: row.is_proxy,
          }))}
          csvFilename="sector-cagr-ranking"
          isLoading={growthQuery.isLoading}
          error={growthQuery.error}
          isEmpty={!growthChartRows.length}
          onRetry={() => void growthQuery.refetch()}
        />

        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="eyebrow">Indicator register</div>
            <CardTitle className="text-[15px]">What is measured in each sector</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {activeIndicators.length ? (
              activeIndicators.map((indicator) => (
                <button
                  key={`${indicator.sector_id}-${indicator.indicator_id}`}
                  type="button"
                  onClick={() => setIndicatorId(indicator.indicator_id)}
                  className="flex w-full items-start justify-between gap-3 rounded-sm border border-line/70 px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-paper-deep/50"
                >
                  <span className="min-w-0 space-y-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: SECTOR_COLORS[indicator.sector_id] ?? "#5B6B7C" }}
                      />
                      <span className="truncate text-xs font-medium text-ink">
                        {indicator.indicator_name}
                      </span>
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted">
                      {indicator.sector_name} · {indicator.indicator_id}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={indicator.is_proxy ? "warning" : "success"}>
                      {indicator.is_proxy ? "Proxy" : "Direct"}
                    </Badge>
                    <span className="font-mono text-[9px] text-muted">
                      {indicator.countries}c · {indicator.observations} obs
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted">No indicators match the current sector filter.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <div className="eyebrow">Growth detail</div>
              <CardTitle className="text-[15px]">Observed endpoints by series</CardTitle>
            </div>
            <Badge variant="outline">{growthRows.length} series</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Indicator</TableHead>
                    <TableHead className="text-right">First</TableHead>
                    <TableHead className="text-right">Last</TableHead>
                    <TableHead className="text-right">CAGR</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {growthRows.slice(0, 80).map((row, index) => (
                    <TableRow key={`${row.country_iso3}-${row.sector_id}-${row.indicator_id}-${index}`}>
                      <TableCell className="font-mono text-xs">{row.country_iso3}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{row.sector_name}</TableCell>
                      <TableCell className="max-w-[240px]">
                        <span className="block truncate text-xs">{row.indicator_name}</span>
                        <span className="font-mono text-[9px] text-muted">{row.indicator_id}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.first_value)} <span className="text-muted">({row.first_year})</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.last_value)} <span className="text-muted">({row.last_year})</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cagr_pct === null ? "—" : formatSignedPercent(row.cagr_pct)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.is_proxy ? "warning" : "success"}>
                          {row.is_proxy ? "Proxy" : "Direct"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!growthRows.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted">
                        No growth comparisons are available for the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sector investment and capacity are not in this build</AlertTitle>
        <AlertDescription>
          Announced investment, realized investment and installed-capacity additions are not available
          from the free official sources used. The interface does not substitute patents, exports or
          capital formation for those concepts; it labels them as unavailable and reports the proxy
          that is actually measured.
        </AlertDescription>
      </Alert>
    </div>
  );
}
