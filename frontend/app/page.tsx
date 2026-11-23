"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Database,
  Globe2,
  Layers3,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import {
  COUNTRY_COLORS,
  SECTOR_COLORS,
  barOption,
  heatmapOption,
  timeSeriesOption,
} from "@/lib/chart-theme";
import { FALLBACK_SECTORS } from "@/lib/constants";
import { groupRows, latestRows, sumBy, toNumber, uniqueValues } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type {
  CountrySectorRow,
  CoverageCell,
  Envelope,
  EnvelopeMeta,
  EmploymentRow,
  ForecastSummaryRow,
  ProjectMeta,
  SalaryRow,
} from "@/lib/types";

interface CoverageResponse extends Envelope<never> {
  meta: EnvelopeMeta & {
    coverage?: {
      country_sector_matrix?: CoverageCell[];
    };
  };
}

export default function OverviewPage() {
  const { countries, sectors, from, to, countryParam, sectorParam } = useFilters();
  const { meta, isLoading: metaLoading, error: metaError, refetch } = useMeta();

  const employment = useApi<Envelope<EmploymentRow>>(
    ["overview-employment", countryParam, sectorParam, to],
    "/api/employment/latest",
    {
      countries: countryParam,
      sectors: sectorParam,
      occupations: "TOTAL",
      granularity: "section",
      year: to,
    },
  );

  const salary = useApi<Envelope<SalaryRow>>(
    ["overview-salary", countryParam, to],
    "/api/salary/latest",
    {
      countries: countryParam,
      occupations: "2",
      basis: "ppp",
      year: to,
    },
  );

  const renewable = useApi<Envelope<CountrySectorRow>>(
    ["overview-renewable", countryParam, from, to],
    "/api/sectors/series",
    {
      countries: countryParam,
      sectors: "renewable_energy",
      indicators: "EG.ELC.RNEW.ZS",
      start: from,
      end: to,
    },
  );

  const coverage = useApi<CoverageResponse>(["overview-coverage"], "/api/coverage");
  const forecast = useApi<Envelope<ForecastSummaryRow>>(["forecast-summary"], "/api/forecast/summary");

  const projectMeta = meta as ProjectMeta | null;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;
  const countryList = projectMeta?.countries ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries(countryList.map((country) => [country.iso3, country.name])),
    [countryList],
  );
  const sectorNames = React.useMemo(
    () => Object.fromEntries(sectorList.map((sector) => [sector.id, sector.short || sector.name])),
    [sectorList],
  );

  const employmentRows = employment.data?.data ?? [];
  const salaryRows = salary.data?.data ?? [];
  const renewableRows = renewable.data?.data ?? [];
  const coverageCells = coverage.data?.meta?.coverage?.country_sector_matrix ?? [];
  const forecastRows = forecast.data?.data ?? [];

  const employmentByCountry = React.useMemo(() => {
    const latest = latestRows(employmentRows, {
      time: (row) => row.year,
      group: (row) => `${row.country_iso3}|${row.sector_id}`,
      value: (row) => row.employment,
    });
    return countries
      .map((iso3) => {
        const rows = latest.filter((row) => row.country_iso3 === iso3);
        return {
          iso3,
          country: rows[0]?.country_name ?? iso3,
          value: sumBy(rows, (row) => row.employment),
          year: rows.length ? Math.max(...rows.map((row) => row.year)) : to,
        };
      })
      .filter((row) => row.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [employmentRows, countries, to]);

  const salaryByCountry = React.useMemo(
    () =>
      latestRows(salaryRows, {
        time: (row) => row.year,
        group: (row) => row.country_iso3,
        value: (row) => row.salary_ppp_intl,
      })
        .filter((row) => toNumber(row.salary_ppp_intl) !== null)
        .map((row) => ({
          iso3: row.country_iso3,
          country: row.country_name,
          value: toNumber(row.salary_ppp_intl) as number,
          year: row.year,
        }))
        .sort((a, b) => b.value - a.value),
    [salaryRows],
  );

  const renewableSeries = React.useMemo(() => {
    const groups = groupRows(renewableRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, rows]) => {
      const yearMap = new Map<number, number>();
      for (const row of rows) {
        const val = toNumber(row.indicator_value);
        if (val != null && !yearMap.has(row.year)) {
          yearMap.set(row.year, val);
        }
      }
      return {
        name: countryNames[iso3] ?? iso3,
        color: COUNTRY_COLORS[iso3],
        points: Array.from(yearMap.entries())
          .map(([year, value]) => ({ year, value }))
          .sort((a, b) => a.year - b.year),
      };
    });
  }, [renewableRows, countryNames]);

  const coverageData = React.useMemo(() => {
    const selectedCountries = new Set(countries);
    const selectedSectors = new Set(sectors);
    const xLabels = sectors.map((id) => sectorNames[id] ?? id);
    const yLabels = countries.map((iso3) => countryNames[iso3] ?? iso3);
    const data: [number, number, number | null][] = [];
    yLabels.forEach((_, yIndex) => {
      xLabels.forEach((_, xIndex) => {
        const iso3 = countries[yIndex];
        const sectorId = sectors[xIndex];
        const cell = coverageCells.find(
          (candidate) =>
            candidate.country_iso3 === iso3 && candidate.sector_id === sectorId,
        );
        data.push([xIndex, yIndex, cell?.coverage_pct ?? null]);
      });
    });
    return { xLabels, yLabels, data, selectedCountries, selectedSectors };
  }, [countries, sectors, countryNames, sectorNames, coverageCells]);

  const totalObserved = (projectMeta?.datasets ?? [])
    .filter((dataset) => dataset.available && dataset.name !== "forecast")
    .reduce((sum, dataset) => sum + (dataset.rows ?? 0), 0);
  const validatedSeries = forecastRows
    .filter((row) => row.validation_status === "validated")
    .reduce((sum, row) => sum + row.series, 0);
  const forecastSeries = forecastRows.reduce((sum, row) => sum + row.series, 0);

  const topEmployment = employmentByCountry[0];
  const topSalary = salaryByCountry[0];
  const renewableLatest = renewableRows
    .filter((row) => row.year === Math.max(...renewableRows.map((candidate) => candidate.year), 0))
    .sort((a, b) => (toNumber(b.indicator_value) ?? 0) - (toNumber(a.indicator_value) ?? 0));
  const renewableLeader = renewableLatest[0];

  const isLoadingCore = employment.isLoading || salary.isLoading || renewable.isLoading;
  const hasCoreError = employment.error || salary.error || renewable.error;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Research overview · annual data"
        title="Global employment opportunities and sector development intelligence"
        description="A comparative research workspace across six economies and five sectors. The dashboard keeps observed statistics and model-generated forecasts in separate layers, preserves source provenance, and treats missing data as unavailable rather than filling it."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/methodology">
                <BookOpenCheck className="h-3.5 w-3.5" />
                Methodology
              </Link>
            </Button>
            <Button asChild variant="accent" size="sm">
              <Link href="/forecast">
                <TrendingUp className="h-3.5 w-3.5" />
                Explore forecasts
              </Link>
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">2010–2024 observed</Badge>
            <Badge variant="accent">2025–2030 forecast</Badge>
            <Badge variant="outline">Annual frequency</Badge>
            <Badge variant="outline">6 countries · 5 sectors</Badge>
            <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              Build {meta?.generated_at ? new Date(meta.generated_at).toLocaleDateString("en-GB") : "—"}
            </span>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Countries in frame"
          value={countries.length}
          unit={`of ${projectMeta?.countries?.length ?? 6}`}
          hint="Global comparison set"
          tone="blue"
          icon={<Globe2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Observed records"
          value={formatCompact(totalObserved)}
          unit="rows"
          hint="Across five historical datasets"
          tone="teal"
          icon={<Database className="h-4 w-4" />}
        />
        <KpiCard
          label="Forecast series"
          value={formatCompact(forecastSeries)}
          unit="series"
          hint={`${formatNumber(validatedSeries, { maximumFractionDigits: 0 })} validated`}
          tone="violet"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Sectors in view"
          value={sectors.length}
          unit={`of ${sectorList.length}`}
          hint="Mapped development proxies"
          tone="amber"
          icon={<Layers3 className="h-4 w-4" />}
        />
        <KpiCard
          label="Source systems"
          value={projectMeta?.sources?.length ?? 2}
          unit="official"
          hint="World Bank · ILOSTAT"
          tone="rose"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </section>

      {metaError ? (
        <Alert variant="destructive">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Project metadata is unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              The dashboard shell loaded, but country and sector definitions could not be read from
              the API. {metaError.message}
            </span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <div className="eyebrow">Research signals</div>
            <CardTitle className="font-display text-xl font-normal tracking-tight">
              What the current selection shows
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-1 md:grid-cols-3">
            <Signal
              index="01"
              label="Largest mapped sector workforce"
              value={
                topEmployment
                  ? `${formatCompact(topEmployment.value)}k`
                  : "Unavailable"
              }
              detail={
                topEmployment
                  ? `${topEmployment.country} · latest ${topEmployment.year} · selected sectors`
                  : "No employment observations for this filter."
              }
              color="#2457A6"
            />
            <Signal
              index="02"
              label="Highest professional earnings"
              value={topSalary ? `$${formatCompact(topSalary.value)}` : "Unavailable"}
              detail={
                topSalary
                  ? `${topSalary.country} · PPP intl $/month · ${topSalary.year}`
                  : "No comparable earnings observations."
              }
              color="#0E6B62"
            />
            <Signal
              index="03"
              label="Renewable electricity leader"
              value={
                renewableLeader
                  ? formatPercent(toNumber(renewableLeader.indicator_value))
                  : "Unavailable"
              }
              detail={
                renewableLeader
                  ? `${renewableLeader.country_name} · share of electricity output · ${renewableLeader.year}`
                  : "No renewable electricity observations."
              }
              color="#A9661B"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="eyebrow">Reading the dashboard</div>
            <CardTitle className="font-display text-xl font-normal tracking-tight">
              Observed data and forecasts are separate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1 text-[13px] leading-6 text-muted">
            <p>
              Solid lines and unshaded bars are reported observations. Dashed lines, shaded bands and
              the forecast badge are model outputs. Forecasts never overwrite an observation.
            </p>
            <p>
              Sector values are documented World Bank proxies, not a harmonised industrial census.
              Employment uses ILOSTAT industry × occupation tables; Canada is included through an
              explicit ISIC Rev.3 mapping.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="success">Validated</Badge>
              <Badge variant="warning">Moderate error</Badge>
              <Badge variant="danger">High error</Badge>
              <Badge variant="outline">Unavailable</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <SectionHeading
        eyebrow="Comparative snapshot"
        title="Labour markets and sector development"
        description="Latest available values within the selected year window. Bars use the most recent observation per series, not a common year; the tooltip and CSV expose the actual year."
      />

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Employment intelligence"
          title="Mapped sector employment by country"
          description="Sum of employment across the selected sector mappings for all occupations. Section-level mappings are broad industry proxies."
          option={barOption({
            categories: employmentByCountry.map((row) => row.iso3),
            series: [
              {
                name: "Employment (thousands)",
                values: employmentByCountry.map((row) => row.value),
                color: "#2457A6",
              },
            ],
            valueFormatter: (value) => `${formatNumber(value, { maximumFractionDigits: 0 })} thousand`,
            yName: "thousand persons",
          })}
          height={320}
          source={{
            name: "ILOSTAT — employment by economic activity and occupation",
            url: "https://ilostat.ilo.org/",
            note: "Section-level ISIC Rev.4 mappings; Canada uses ISIC Rev.3. Mapped industries only.",
          }}
          csvRows={employmentByCountry.map((row) => ({
            country_iso3: row.iso3,
            country_name: row.country,
            latest_year: row.year,
            employment_thousands: row.value,
            unit: "thousands of persons",
            source: "ILOSTAT",
          }))}
          csvFilename="overview-mapped-sector-employment"
          isLoading={employment.isLoading}
          error={employment.error}
          isEmpty={!employmentByCountry.length}
          onRetry={() => void employment.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Salary analysis"
          title="Professional earnings, PPP-adjusted"
          description="Mean monthly earnings of professionals (ISCO major group 2), converted with World Bank private-consumption PPP factors. Japan is unavailable in this series."
          option={barOption({
            categories: salaryByCountry.map((row) => row.iso3),
            series: [
              {
                name: "PPP international $ / month",
                values: salaryByCountry.map((row) => row.value),
                color: "#0E6B62",
              },
            ],
            valueFormatter: (value) => `$${formatNumber(value, { maximumFractionDigits: 0 })}`,
            yName: "intl $ / month",
          })}
          height={320}
          source={{
            name: "ILOSTAT earnings + World Bank PPP conversion factors",
            url: "https://ilostat.ilo.org/topics/pay/",
            note: "Gross monthly earnings, nominal source values; PPP conversion uses PA.NUS.PRVT.PP.",
          }}
          csvRows={salaryByCountry.map((row) => ({
            country_iso3: row.iso3,
            country_name: row.country,
            year: row.year,
            occupation: "Professionals",
            salary_ppp_intl_month: row.value,
            source: "ILOSTAT; World Bank WDI",
          }))}
          csvFilename="overview-professional-earnings-ppp"
          isLoading={salary.isLoading}
          error={salary.error}
          isEmpty={!salaryByCountry.length}
          onRetry={() => void salary.refetch()}
        />

        <ChartCard
          className="lg:col-span-7"
          eyebrow="Global sector development"
          title="Renewable electricity output"
          description="Renewable electricity as a share of total electricity output. A directly reported sector indicator, not a proxy."
          option={timeSeriesOption({
            series: renewableSeries,
            xMin: from,
            xMax: Math.max(from + 1, to),
            yName: "% of electricity output",
            valueFormatter: (value) => `${value.toFixed(1)}%`,
          })}
          height={460}
          source={{
            name: "World Bank WDI — EG.ELC.RNEW.ZS",
            url: "https://data.worldbank.org/indicator/EG.ELC.RNEW.ZS",
            note: "Observed annual values only; gaps are not interpolated.",
          }}
          csvRows={renewableRows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            indicator: row.indicator_name,
            value: row.indicator_value,
            unit: row.indicator_unit,
            source_url: row.source_url,
          }))}
          csvFilename="overview-renewable-electricity"
          isLoading={renewable.isLoading}
          error={renewable.error}
          isEmpty={!renewableRows.length}
          onRetry={() => void renewable.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Data quality"
          title="Sector indicator coverage"
          description="Share of expected country–sector cells observed for the available proxy indicators. Darker cells mean denser evidence, not better sector performance."
          option={heatmapOption({
            xLabels: coverageData.xLabels,
            yLabels: coverageData.yLabels,
            data: coverageData.data,
            min: 0,
            max: 100,
            valueLabel: "%",
          })}
          height={460}
          source={{
            name: "Computed from processed World Bank series",
            note: "Expected cells = available indicators × 15 annual years.",
          }}
          csvRows={coverageData.data.map(([x, y, value]) => ({
            country: coverageData.yLabels[y],
            sector: coverageData.xLabels[x],
            coverage_pct: value,
          }))}
          csvFilename="overview-coverage-matrix"
          isLoading={coverage.isLoading}
          error={coverage.error}
          isEmpty={!coverageCells.length}
          onRetry={() => void coverage.refetch()}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <Alert variant="info" className="lg:col-span-8">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Interpretation guardrails</AlertTitle>
          <AlertDescription className="space-y-1.5">
            <p>
              Sector-level investment announcements, realized investment, installed-capacity additions
              and harmonised vacancy counts are not available from the free official sources used.
              Those fields are shown as unavailable, never as zero.
            </p>
            <p>
              Salary levels are gross monthly earnings. Real values use a 2010 CPI base; cross-country
              comparisons use PPP conversion, not market exchange rates. City-level living costs are
              outside the current build.
            </p>
          </AlertDescription>
        </Alert>
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="eyebrow">Continue</div>
            <CardTitle className="font-display text-lg font-normal">Go deeper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-1">
            {[
              { href: "/sectors", label: "Sector development", icon: Layers3 },
              { href: "/employment", label: "Employment intelligence", icon: Users },
              { href: "/salary", label: "Salary analysis", icon: TrendingUp },
              { href: "/methodology", label: "Sources and limits", icon: ShieldCheck },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center justify-between rounded-sm px-2 py-2 text-sm transition-colors hover:bg-paper-deep"
              >
                <span className="flex items-center gap-2 text-ink/80">
                  <item.icon className="h-3.5 w-3.5 text-muted" />
                  {item.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-line-strong transition-transform group-hover:translate-x-0.5 group-hover:text-teal" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {hasCoreError && !isLoadingCore ? (
        <p className="text-xs text-muted">
          Some overview modules are unavailable. Each chart reports its own error state and can be
          retried independently.
        </p>
      ) : null}
    </div>
  );
}

function Signal({
  index,
  label,
  value,
  detail,
  color,
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: color }}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] text-muted">{index}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-medium tracking-[-0.04em]" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{detail}</p>
    </div>
  );
}
