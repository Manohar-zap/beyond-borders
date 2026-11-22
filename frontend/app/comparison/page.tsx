"use client";

import * as React from "react";
import type { EChartsOption } from "echarts";
import { Banknote, Globe2, TrendingUp, Users } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import {
  AXIS_LABEL,
  COUNTRY_COLORS,
  SECTOR_COLORS,
  TOOLTIP_STYLE,
  barOption,
  baseOption,
  compactAxis,
  timeSeriesOption,
} from "@/lib/chart-theme";
import { FALLBACK_SECTORS } from "@/lib/constants";
import { averageBy, groupRows, latestRows, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type {
  CountryContextRow,
  EmploymentRow,
  Envelope,
  ProjectMeta,
  SalaryRow,
} from "@/lib/types";

const CONTEXT_LABELS: Record<string, string> = {
  "NY.GDP.PCAP.CD": "GDP per capita",
  "SL.UEM.TOTL.ZS": "Unemployment",
  "SL.TLF.CACT.ZS": "Participation",
  "NE.CON.PRVT.PC.KD": "Household consumption",
  "FP.CPI.TOTL": "Consumer price index",
};

export default function ComparisonPage() {
  const { countries, sectors, from, to, countryParam, sectorParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;

  const context = useApi<Envelope<CountryContextRow>>(
    ["comparison-context", countryParam, to],
    "/api/context/latest",
    { countries: countryParam, year: to },
  );

  const contextSeries = useApi<Envelope<CountryContextRow>>(
    ["comparison-gdp-series", countryParam, from, to],
    "/api/context/series",
    {
      countries: countryParam,
      indicators: "NY.GDP.PCAP.CD",
      start: from,
      end: to,
    },
  );

  const employment = useApi<Envelope<EmploymentRow>>(
    ["comparison-employment", countryParam, sectorParam, to],
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
    ["comparison-salary", countryParam, to],
    "/api/salary/latest",
    { countries: countryParam, occupations: "2", basis: "ppp", year: to },
  );

  const contextRows = context.data?.data ?? [];
  const contextSeriesRows = contextSeries.data?.data ?? [];
  const employmentRows = employment.data?.data ?? [];
  const salaryRows = salary.data?.data ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );
  const sectorNames = React.useMemo(
    () => Object.fromEntries(sectorList.map((sector) => [sector.id, sector.short || sector.name])),
    [sectorList],
  );

  const latestContext = React.useMemo(() => {
    const map: Record<string, Record<string, CountryContextRow>> = {};
    contextRows.forEach((row) => {
      map[row.country_iso3] ??= {};
      map[row.country_iso3][row.indicator_id] = row;
    });
    return map;
  }, [contextRows]);

  const latestSalary = React.useMemo(() => {
    const map: Record<string, SalaryRow> = {};
    latestRows(salaryRows, {
      time: (row) => row.year,
      group: (row) => row.country_iso3,
      value: (row) => row.salary_ppp_intl,
    }).forEach((row) => {
      map[row.country_iso3] = row;
    });
    return map;
  }, [salaryRows]);

  const latestEmployment = React.useMemo(() => {
    const latest = latestRows(employmentRows, {
      time: (row) => row.year,
      group: (row) => `${row.country_iso3}|${row.sector_id}`,
      value: (row) => row.employment,
    });
    const map: Record<string, Record<string, number | null>> = {};
    latest.forEach((row) => {
      map[row.country_iso3] ??= {};
      map[row.country_iso3][row.sector_id] = toNumber(row.employment);
    });
    return map;
  }, [employmentRows]);

  const gdpValues = countries
    .map((iso3) => toNumber(latestContext[iso3]?.["NY.GDP.PCAP.CD"]?.value))
    .filter((value): value is number => value !== null);
  const unemploymentValues = countries
    .map((iso3) => toNumber(latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.value))
    .filter((value): value is number => value !== null);
  const participationValues = countries
    .map((iso3) => toNumber(latestContext[iso3]?.["SL.TLF.CACT.ZS"]?.value))
    .filter((value): value is number => value !== null);

  const gdpSeries = React.useMemo(() => {
    const groups = groupRows(contextSeriesRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row.value) })),
    }));
  }, [contextSeriesRows, countryNames]);

  const employmentComposition = React.useMemo(() => {
    return sectors.map((sectorId) => ({
      name: sectorNames[sectorId] ?? sectorId,
      color: SECTOR_COLORS[sectorId],
      stack: "employment",
      values: countries.map((iso3) => latestEmployment[iso3]?.[sectorId] ?? null),
    }));
  }, [sectors, countries, latestEmployment, sectorNames]);

  const scatterPoints = React.useMemo(
    () =>
      countries
        .map((iso3) => {
          const gdp = toNumber(latestContext[iso3]?.["NY.GDP.PCAP.CD"]?.value);
          const unemployment = toNumber(latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.value);
          const population = toNumber(latestContext[iso3]?.["SP.POP.TOTL"]?.value);
          if (gdp === null || unemployment === null) return null;
          return {
            name: iso3,
            value: [gdp, unemployment, population ?? 0],
            itemStyle: { color: COUNTRY_COLORS[iso3] ?? "#5B6B7C" },
          };
        })
        .filter(Boolean) as { name: string; value: number[]; itemStyle: { color: string } }[],
    [countries, latestContext],
  );

  const scatterOption: EChartsOption = React.useMemo(
    () => ({
      ...baseOption(),
      grid: { left: 18, right: 28, top: 26, bottom: 46, containLabel: true },
      tooltip: {
        ...TOOLTIP_STYLE,
        trigger: "item",
        formatter: (params: any) => {
          const [gdp, unemployment, population] = params.value as number[];
          return `<div style="font-weight:600;margin-bottom:4px">${countryNames[params.name] ?? params.name}</div>
            <div style="font-family:var(--font-mono);font-size:11px;line-height:1.7">
              GDP per capita: $${formatNumber(gdp, { maximumFractionDigits: 0 })}<br/>
              Unemployment: ${unemployment.toFixed(1)}%<br/>
              Population: ${formatCompact(population)}
            </div>`;
        },
      },
      xAxis: {
        type: "value",
        name: "GDP per capita (current US$)",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: { color: "#6D6A61", fontSize: 10 },
        axisLabel: { ...AXIS_LABEL, formatter: (value: number) => compactAxis(value) },
        splitLine: { lineStyle: { color: "#E9E4D9", type: "dashed" } },
      },
      yAxis: {
        type: "value",
        name: "Unemployment (%)",
        nameTextStyle: { color: "#6D6A61", fontSize: 10 },
        axisLabel: { ...AXIS_LABEL, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: { color: "#E9E4D9", type: "dashed" } },
        scale: true,
      },
      series: [
        {
          type: "scatter",
          data: scatterPoints,
          symbolSize: (value: number[]) => {
            const population = value[2] ?? 0;
            if (!population) return 12;
            return Math.max(14, Math.min(38, Math.sqrt(population / 1_000_000) * 1.6));
          },
          label: {
            show: true,
            formatter: (params: any) => params.name,
            position: "top",
            color: "#101720",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
          },
          emphasis: { scale: 1.15 },
        },
      ],
    }),
    [scatterPoints, countryNames],
  );

  const tableIndicators = [
    "NY.GDP.PCAP.CD",
    "SL.UEM.TOTL.ZS",
    "SL.TLF.CACT.ZS",
    "NE.CON.PRVT.PC.KD",
    "FP.CPI.TOTL",
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 03 · Country comparison"
        title="Compare six economies on the same evidence base"
        description="Country context, labour-market conditions, mapped sector employment and professional earnings. Each metric keeps its own unit and latest available year; comparisons are descriptive and do not imply causal relationships."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{countries.length} countries</Badge>
            <Badge variant="outline">{sectors.length} sectors</Badge>
            <Badge variant="secondary">Latest available year ≤ {to}</Badge>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Mean GDP per capita"
          value={averageBy(gdpValues, (value) => value) !== null ? `$${formatCompact(averageBy(gdpValues, (value) => value))}` : "Unavailable"}
          hint="Current US$, selected countries"
          tone="blue"
          icon={<Globe2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Mean unemployment"
          value={formatPercent(averageBy(unemploymentValues, (value) => value))}
          hint="Share of labour force"
          tone="rose"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Mean participation"
          value={formatPercent(averageBy(participationValues, (value) => value))}
          hint="Share of population 15+"
          tone="teal"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Professional earnings"
          value={
            salaryRows.length
              ? `$${formatCompact(
                  averageBy(
                    Object.values(latestSalary).filter((row) => toNumber(row.salary_ppp_intl) !== null),
                    (row) => row.salary_ppp_intl,
                  ),
                )}`
              : "Unavailable"
          }
          hint="PPP intl $ / month; Japan absent"
          tone="amber"
          icon={<Banknote className="h-4 w-4" />}
        />
      </section>

      <SectionHeading
        eyebrow="Country scorecards"
        title="A compact profile for each economy"
        description="The latest observation in the selected year window for each metric. Blank values are unavailable, not zero."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {countries.map((iso3) => {
          const contextForCountry = latestContext[iso3] ?? {};
          const gdp = toNumber(contextForCountry["NY.GDP.PCAP.CD"]?.value);
          const unemployment = toNumber(contextForCountry["SL.UEM.TOTL.ZS"]?.value);
          const participation = toNumber(contextForCountry["SL.TLF.CACT.ZS"]?.value);
          const consumption = toNumber(contextForCountry["NE.CON.PRVT.PC.KD"]?.value);
          const salaryRow = latestSalary[iso3];
          return (
            <Card key={iso3} className="overflow-hidden">
              <div className="h-1" style={{ background: COUNTRY_COLORS[iso3] }} />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted">{iso3}</span>
                      <Badge variant="outline" className="normal-case tracking-normal">
                        {projectMeta?.countries?.find((country) => country.iso3 === iso3)?.currency ?? ""}
                      </Badge>
                    </div>
                    <CardTitle className="mt-1 font-display text-xl font-normal">
                      {countryNames[iso3] ?? iso3}
                    </CardTitle>
                  </div>
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-full"
                    style={{ background: COUNTRY_COLORS[iso3] }}
                  />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2 pt-0 text-xs">
                <Stat label="GDP / capita" value={gdp === null ? "Unavailable" : `$${formatCompact(gdp)}`} />
                <Stat label="Unemployment" value={formatPercent(unemployment)} />
                <Stat label="Participation" value={formatPercent(participation)} />
                <Stat
                  label="Household cons."
                  value={consumption === null ? "Unavailable" : `$${formatCompact(consumption)}`}
                />
                <Stat
                  label="Professional pay"
                  value={
                    salaryRow && toNumber(salaryRow.salary_ppp_intl) !== null
                      ? `$${formatCompact(toNumber(salaryRow.salary_ppp_intl))}/mo`
                      : "Unavailable"
                  }
                />
                <Stat
                  label="Mapped employment"
                  value={
                    latestEmployment[iso3]
                      ? `${formatCompact(
                          Object.values(latestEmployment[iso3]).reduce<number>(
                            (sum, value) => sum + (value ?? 0),
                            0,
                          ),
                        )}k`
                      : "Unavailable"
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Income trajectory"
          title="GDP per capita, current US$"
          description="Observed whole-economy income per person. Current-dollar levels are affected by exchange rates and inflation; use the trajectory for direction, not real growth."
          option={timeSeriesOption({
            series: gdpSeries,
            xMin: from,
            xMax: to,
            yName: "current US$",
            valueFormatter: (value) => `$${formatNumber(value, { maximumFractionDigits: 0 })}`,
          })}
          height={350}
          source={{
            name: "World Bank WDI — NY.GDP.PCAP.CD",
            url: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD",
            note: "Current US dollars; no PPP adjustment in this chart.",
          }}
          csvRows={contextSeriesRows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            indicator_id: row.indicator_id,
            value: row.value,
            unit: row.unit,
            source_url: row.source_url,
          }))}
          csvFilename="comparison-gdp-per-capita"
          isLoading={contextSeries.isLoading}
          error={contextSeries.error}
          isEmpty={!contextSeriesRows.length}
          onRetry={() => void contextSeries.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Labour market"
          title="Unemployment and participation"
          description="Two different denominators share a percentage axis. High participation is not inherently good or bad without the unemployment and demographic context."
          option={barOption({
            categories: countries,
            series: [
              {
                name: "Unemployment (% labour force)",
                values: countries.map((iso3) => toNumber(latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.value)),
                color: "#A63D57",
              },
              {
                name: "Participation (% population 15+)",
                values: countries.map((iso3) => toNumber(latestContext[iso3]?.["SL.TLF.CACT.ZS"]?.value)),
                color: "#2457A6",
              },
            ],
            valueFormatter: (value) => `${value.toFixed(1)}%`,
            yName: "%",
          })}
          height={350}
          source={{
            name: "World Bank WDI — SL.UEM.TOTL.ZS and SL.TLF.CACT.ZS",
            url: "https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS",
            note: "Latest available values within the year window.",
          }}
          csvRows={countries.map((iso3) => ({
            country_iso3: iso3,
            unemployment_pct: toNumber(latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.value),
            participation_pct: toNumber(latestContext[iso3]?.["SL.TLF.CACT.ZS"]?.value),
            unemployment_year: latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.year,
            participation_year: latestContext[iso3]?.["SL.TLF.CACT.ZS"]?.year,
          }))}
          csvFilename="comparison-labour-market"
          isLoading={context.isLoading}
          error={context.error}
          isEmpty={!contextRows.length}
          onRetry={() => void context.refetch()}
        />

        <ChartCard
          className="lg:col-span-7"
          eyebrow="Employment structure"
          title="Mapped sector employment composition"
          description="Stacked latest sector totals for all occupations. Sector mappings overlap conceptually: they are not mutually exclusive industries and the total is a research basket, not whole-economy employment."
          option={barOption({
            categories: countries,
            series: employmentComposition,
            valueFormatter: (value) => `${formatNumber(value, { maximumFractionDigits: 0 })} thousand`,
            yName: "thousand persons",
          })}
          height={350}
          source={{
            name: "ILOSTAT — industry × occupation employment",
            url: "https://ilostat.ilo.org/",
            note: "Section-level ISIC Rev.4 proxies; Canada uses ISIC Rev.3 and has two unavailable sectors.",
          }}
          csvRows={countries.flatMap((iso3) =>
            sectors.map((sectorId) => ({
              country_iso3: iso3,
              sector_id: sectorId,
              sector_name: sectorNames[sectorId],
              employment_thousands: latestEmployment[iso3]?.[sectorId] ?? null,
            })),
          )}
          csvFilename="comparison-sector-employment-composition"
          isLoading={employment.isLoading}
          error={employment.error}
          isEmpty={!employmentRows.length}
          onRetry={() => void employment.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Positioning"
          title="Income versus unemployment"
          description="A descriptive scatter, not a model of causation. Bubble size is population; labels use ISO3 codes."
          option={scatterOption}
          height={350}
          source={{
            name: "World Bank WDI — GDP per capita, unemployment, population",
            url: "https://data.worldbank.org/",
            note: "Latest available values within the year window; years can differ by indicator.",
          }}
          csvRows={scatterPoints.map((point) => ({
            country_iso3: point.name,
            gdp_per_capita_usd: point.value[0],
            unemployment_pct: point.value[1],
            population: point.value[2],
          }))}
          csvFilename="comparison-income-unemployment-scatter"
          isLoading={context.isLoading}
          error={context.error}
          isEmpty={!scatterPoints.length}
          onRetry={() => void context.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Full comparison table"
        title="Latest context and earnings indicators"
        description="Values are shown with their source units. CPI is an index (2010 = 100); household consumption is constant 2015 US$. Professional pay is PPP-adjusted gross monthly earnings."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  {tableIndicators.map((indicator) => (
                    <TableHead key={indicator} className="text-right">
                      {CONTEXT_LABELS[indicator] ?? indicator}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Professionals PPP</TableHead>
                  <TableHead className="text-right">Mapped employment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countries.map((iso3) => (
                  <TableRow key={iso3}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: COUNTRY_COLORS[iso3] }}
                        />
                        <span className="font-medium">{countryNames[iso3] ?? iso3}</span>
                        <span className="font-mono text-[10px] text-muted">{iso3}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {toNumber(latestContext[iso3]?.["NY.GDP.PCAP.CD"]?.value) === null
                        ? "—"
                        : `$${formatNumber(latestContext[iso3]["NY.GDP.PCAP.CD"].value, { maximumFractionDigits: 0 })}`}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatPercent(toNumber(latestContext[iso3]?.["SL.UEM.TOTL.ZS"]?.value))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatPercent(toNumber(latestContext[iso3]?.["SL.TLF.CACT.ZS"]?.value))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {toNumber(latestContext[iso3]?.["NE.CON.PRVT.PC.KD"]?.value) === null
                        ? "—"
                        : `$${formatNumber(latestContext[iso3]["NE.CON.PRVT.PC.KD"].value, { maximumFractionDigits: 0 })}`}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatNumber(toNumber(latestContext[iso3]?.["FP.CPI.TOTL"]?.value), {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {latestSalary[iso3] && toNumber(latestSalary[iso3].salary_ppp_intl) !== null
                        ? `$${formatNumber(latestSalary[iso3].salary_ppp_intl, { maximumFractionDigits: 0 })}`
                        : "Unavailable"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {latestEmployment[iso3]
                        ? `${formatNumber(
                            Object.values(latestEmployment[iso3]).reduce<number>(
                              (sum, value) => sum + (value ?? 0),
                              0,
                            ),
                            { maximumFractionDigits: 0 },
                          )}k`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.07em] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[13px] font-medium text-ink">{value}</p>
    </div>
  );
}
