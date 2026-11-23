"use client";

import * as React from "react";
import { AlertTriangle, BriefcaseBusiness, Layers3, TrendingUp, Users } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import { CHART_COLORS, COUNTRY_COLORS, SECTOR_COLORS, barOption, timeSeriesOption } from "@/lib/chart-theme";
import { FALLBACK_OCCUPATIONS, FALLBACK_SECTORS } from "@/lib/constants";
import { averageBy, groupRows, latestRows, sumBy, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type {
  EmploymentRow,
  Envelope,
  Occupation,
  ProjectMeta,
} from "@/lib/types";

const OCCUPATION_COLORS = [
  "#2457A6",
  "#0E6B62",
  "#A9661B",
  "#6B4C9A",
  "#A63D57",
  "#5B6B7C",
  "#3F7F93",
  "#8A6B3D",
  "#7A8B4A",
  "#9B5F73",
];

interface OccupationShareRow extends EmploymentRow {
  total_employment: number;
  share_pct: number | null;
}

export default function EmploymentPage() {
  const { countries, sectors, from, to, countryParam, sectorParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;
  const occupationList: Occupation[] = projectMeta?.occupations?.length
    ? projectMeta.occupations
    : FALLBACK_OCCUPATIONS;

  const [granularity, setGranularity] = React.useState<"section" | "division">("section");
  const [occupation, setOccupation] = React.useState("TOTAL");

  const seriesQuery = useApi<Envelope<EmploymentRow>>(
    ["employment-series", countryParam, sectorParam, occupation, granularity, from, to],
    "/api/employment/series",
    {
      countries: countryParam,
      sectors: sectorParam,
      occupations: occupation,
      granularity,
      start: from,
      end: to,
    },
  );

  const latestQuery = useApi<Envelope<EmploymentRow>>(
    ["employment-latest", countryParam, sectorParam, granularity, to],
    "/api/employment/latest",
    {
      countries: countryParam,
      sectors: sectorParam,
      occupations: "TOTAL",
      granularity,
      year: to,
    },
  );

  const shareQuery = useApi<Envelope<OccupationShareRow>>(
    ["employment-share", countryParam, sectorParam, granularity, to],
    "/api/employment/occupation-share",
    {
      countries: countryParam,
      sectors: sectorParam,
      granularity,
      year: to,
    },
  );

  const seriesRows = seriesQuery.data?.data ?? [];
  const latestRowsRaw = latestQuery.data?.data ?? [];
  const shareRows = shareQuery.data?.data ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );
  const sectorNames = React.useMemo(
    () => Object.fromEntries(sectorList.map((sector) => [sector.id, sector.short || sector.name])),
    [sectorList],
  );
  const occupationNames = React.useMemo(
    () => Object.fromEntries(occupationList.map((item) => [item.code, item.name])),
    [occupationList],
  );

  const trendSeries = React.useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    seriesRows.forEach((row) => {
      const value = toNumber(row.employment);
      if (value === null) return;
      map[row.country_iso3] ??= {};
      map[row.country_iso3][row.year] = (map[row.country_iso3][row.year] ?? 0) + value;
    });
    return countries
      .filter((iso3) => map[iso3])
      .map((iso3) => ({
        name: countryNames[iso3] ?? iso3,
        color: COUNTRY_COLORS[iso3],
        points: Object.entries(map[iso3])
          .map(([year, value]) => ({ year: Number(year), value }))
          .sort((a, b) => a.year - b.year),
      }));
  }, [seriesRows, countries, countryNames]);

  const latestSectorRows = React.useMemo(
    () =>
      latestRows(latestRowsRaw, {
        time: (row) => row.year,
        group: (row) => `${row.country_iso3}|${row.sector_id}`,
        value: (row) => row.employment,
      }),
    [latestRowsRaw],
  );

  const sectorComposition = React.useMemo(
    () =>
      sectors.map((sectorId) => ({
        name: sectorNames[sectorId] ?? sectorId,
        color: SECTOR_COLORS[sectorId],
        stack: "sector",
        values: countries.map(
          (iso3) =>
            latestSectorRows.find(
              (row) => row.country_iso3 === iso3 && row.sector_id === sectorId,
            )?.employment ?? null,
        ),
      })),
    [sectors, countries, latestSectorRows, sectorNames],
  );

  const occupationComposition = React.useMemo(() => {
    const totals: Record<string, number> = {};
    const byCountryOccupation: Record<string, Record<string, number>> = {};
    shareRows.forEach((row) => {
      const value = toNumber(row.employment);
      if (value === null) return;
      totals[row.country_iso3] = (totals[row.country_iso3] ?? 0) + value;
      byCountryOccupation[row.country_iso3] ??= {};
      byCountryOccupation[row.country_iso3][row.occupation_code] =
        (byCountryOccupation[row.country_iso3][row.occupation_code] ?? 0) + value;
    });
    const codes = Array.from(
      new Set(shareRows.map((row) => row.occupation_code).filter((code) => code !== "TOTAL")),
    ).sort();
    return codes.map((code, index) => ({
      name: occupationNames[code] ?? code,
      color: OCCUPATION_COLORS[index % OCCUPATION_COLORS.length],
      stack: "occupation",
      values: countries.map((iso3) => {
        const total = totals[iso3];
        const value = byCountryOccupation[iso3]?.[code];
        if (!total || value === undefined) return null;
        return (value / total) * 100;
      }),
    }));
  }, [shareRows, countries, occupationNames]);

  const latestCountryTotals = React.useMemo(
    () =>
      countries
        .map((iso3) => {
          const rows = latestSectorRows.filter((row) => row.country_iso3 === iso3);
          return {
            iso3,
            country: countryNames[iso3] ?? iso3,
            value: sumBy(rows, (row) => row.employment),
            year: rows.length ? Math.max(...rows.map((row) => row.year)) : null,
          };
        })
        .filter((row) => row.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [countries, latestSectorRows, countryNames],
  );

  const sectorTotals = React.useMemo(
    () =>
      sectors
        .map((sectorId) => ({
          id: sectorId,
          name: sectorNames[sectorId] ?? sectorId,
          value: sumBy(
            latestSectorRows.filter((row) => row.sector_id === sectorId),
            (row) => row.employment,
          ),
          countries: latestSectorRows.filter(
            (row) => row.sector_id === sectorId && toNumber(row.employment) !== null,
          ).length,
        }))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [sectors, latestSectorRows, sectorNames],
  );

  const totalEmployment = sumBy(latestSectorRows, (row) => row.employment);
  const professionalShare = React.useMemo(() => {
    let professional = 0;
    let total = 0;
    shareRows.forEach((row) => {
      const value = toNumber(row.employment);
      if (value === null) return;
      total += value;
      if (row.occupation_code === "2") professional += value;
    });
    return total > 0 ? (professional / total) * 100 : null;
  }, [shareRows]);

  const meanGrowth = averageBy(
    latestSectorRows.filter((row) => toNumber(row.employment_growth) !== null),
    (row) => row.employment_growth,
  );

  const selectedOccupationName = occupationNames[occupation] ?? occupation;
  const sourceUrl = seriesRows[0]?.source_url ?? "https://ilostat.ilo.org/";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 04 · Employment intelligence"
        title="Who works in the sectors that matter"
        description="ILOSTAT industry × occupation tables, mapped to five sector frames. Section-level data covers all six countries; division-level detail exists only where ISIC Rev.4 two-digit data is published. Mappings are explicit and never silently harmonised."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{granularity === "section" ? "ISIC section" : "ISIC division"}</Badge>
            <Badge variant="outline">{countries.length} countries · {sectors.length} sectors</Badge>
            <Badge variant="warning">Broad industry proxies</Badge>
          </div>
        }
      />

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="eyebrow mb-1.5">Industry grain</p>
            <Tabs value={granularity} onValueChange={(value) => setGranularity(value as "section" | "division")}>
              <TabsList>
                <TabsTrigger value="section">Section</TabsTrigger>
                <TabsTrigger value="division">Division</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Occupation</p>
            <Select value={occupation} onValueChange={setOccupation}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {occupationList.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.code === "TOTAL" ? "All occupations" : `${item.code} · ${item.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="max-w-md text-[11px] leading-relaxed text-muted">
          The occupation selector controls the trend chart. Composition views use all occupations to
          avoid presenting a partial mix as the whole.
        </p>
      </section>

      {granularity === "division" ? (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Division detail is not available for every country</AlertTitle>
          <AlertDescription>
            India, Japan, the United Kingdom and the United States publish ISIC Rev.4 two-digit
            divisions in this series. Germany and Canada do not, so their division-level series are
            unavailable rather than approximated from sections.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Mapped employment"
          value={totalEmployment === null ? "Unavailable" : formatCompact(totalEmployment)}
          unit="thousand"
          hint="Latest selected sectors · all occupations"
          tone="blue"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Largest sector basket"
          value={sectorTotals[0]?.name ?? "Unavailable"}
          hint={
            sectorTotals[0]?.value !== null && sectorTotals[0]?.value !== undefined
              ? `${formatCompact(sectorTotals[0].value)}k across ${sectorTotals[0].countries} countries`
              : "No sector observations"
          }
          tone="amber"
          icon={<Layers3 className="h-4 w-4" />}
        />
        <KpiCard
          label="Professional share"
          value={formatPercent(professionalShare)}
          hint="ISCO major group 2 within mapped sectors"
          tone="teal"
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
        <KpiCard
          label="Mean latest growth"
          value={formatSignedPercent(meanGrowth)}
          delta={meanGrowth}
          deltaLabel="year over year"
          hint="Average across latest country–sector rows"
          tone="violet"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Observed employment"
          title={`${selectedOccupationName} employment in selected sectors`}
          description="Annual employment summed across the selected sector mappings. Values are thousands of persons; gaps are not bridged."
          option={timeSeriesOption({
            series: trendSeries,
            xMin: from,
            xMax: Math.max(from + 1, to),
            yName: "thousand persons",
            valueFormatter: (value) => `${formatNumber(value, { maximumFractionDigits: 0 })} thousand`,
          })}
          height={350}
          source={{
            name: "ILOSTAT — EMP_TEMP_ECO_OCU_NB_A",
            url: sourceUrl,
            note:
              granularity === "section"
                ? "ISIC Rev.4 sections; Canada is ISIC Rev.3 via explicit mapping."
                : "ISIC Rev.4 divisions for IND, JPN, GBR and USA only.",
          }}
          csvRows={seriesRows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            sector_id: row.sector_id,
            sector_name: row.sector_name,
            occupation_code: row.occupation_code,
            occupation_name: row.occupation_name,
            year: row.year,
            employment_thousands: row.employment,
            mapping_granularity: row.mapping_granularity,
            mapping_quality: row.mapping_quality,
            source_url: row.source_url,
          }))}
          csvFilename={`employment-${occupation}-${granularity}-trend`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!seriesRows.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Latest composition"
          title="Employment by sector basket"
          description="Stacked latest sector totals. These mappings overlap conceptually and should not be read as a mutually exclusive industrial decomposition."
          option={barOption({
            categories: countries,
            series: sectorComposition,
            valueFormatter: (value) => `${formatNumber(value, { maximumFractionDigits: 0 })} thousand`,
            yName: "thousand persons",
          })}
          height={350}
          source={{
            name: "ILOSTAT — industry × occupation employment",
            url: sourceUrl,
            note: "Latest available observation per country–sector.",
          }}
          csvRows={countries.flatMap((iso3) =>
            sectors.map((sectorId) => {
              const row = latestSectorRows.find(
                (candidate) =>
                  candidate.country_iso3 === iso3 && candidate.sector_id === sectorId,
              );
              return {
                country_iso3: iso3,
                sector_id: sectorId,
                sector_name: sectorNames[sectorId],
                year: row?.year ?? null,
                employment_thousands: row?.employment ?? null,
                mapping_quality: row?.mapping_quality ?? null,
              };
            }),
          )}
          csvFilename="employment-sector-composition"
          isLoading={latestQuery.isLoading}
          error={latestQuery.error}
          isEmpty={!latestSectorRows.length}
          onRetry={() => void latestQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-7"
          eyebrow="Occupational mix"
          title="Share of mapped employment by occupation"
          description="Occupation shares are computed within the selected sector basket for each country. Categories are shown only where ILOSTAT reports them; shares may not sum to 100% when a category is missing."
          option={barOption({
            categories: countries,
            series: occupationComposition,
            valueFormatter: (value) => `${value.toFixed(1)}%`,
            yName: "% of mapped employment",
          })}
          height={390}
          source={{
            name: "ILOSTAT — occupation × industry employment",
            url: sourceUrl,
            note: "ISCO major groups; weighted shares across the selected sector mappings.",
          }}
          csvRows={shareRows.map((row) => ({
            country_iso3: row.country_iso3,
            sector_id: row.sector_id,
            sector_name: row.sector_name,
            occupation_code: row.occupation_code,
            occupation_name: row.occupation_name,
            year: row.year,
            employment_thousands: row.employment,
            share_pct: row.share_pct,
          }))}
          csvFilename="employment-occupation-mix"
          isLoading={shareQuery.isLoading}
          error={shareQuery.error}
          isEmpty={!shareRows.length}
          onRetry={() => void shareQuery.refetch()}
        />

        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="eyebrow">Sector totals</div>
            <CardTitle className="text-[15px]">Where the mapped jobs sit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {sectorTotals.map((sector) => {
              const max = sectorTotals[0]?.value ?? 1;
              const width = sector.value === null ? 0 : Math.max(2, (sector.value / (max || 1)) * 100);
              return (
                <div key={sector.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: SECTOR_COLORS[sector.id] }}
                      />
                      <span className="truncate text-ink/80">{sector.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink">
                      {sector.value === null ? "Unavailable" : `${formatCompact(sector.value)}k`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, background: SECTOR_COLORS[sector.id] }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    {sector.countries} of {countries.length} selected countries with an observation
                  </p>
                </div>
              );
            })}
            {!sectorTotals.length ? (
              <p className="text-sm text-muted">No sector totals for the current filters.</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <SectionHeading
        eyebrow="Employment detail"
        title="Latest country–sector rows"
        description="Industry name, classification and mapping quality are retained so the proxy can be audited. Vacancies and vacancy rates are unavailable in this build and are not set to zero."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Sector basket</TableHead>
                  <TableHead>Mapped industry</TableHead>
                  <TableHead className="text-right">Year</TableHead>
                  <TableHead className="text-right">Employment</TableHead>
                  <TableHead className="text-right">YoY</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Vacancies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestSectorRows.slice(0, 100).map((row, index) => (
                  <TableRow key={`${row.country_iso3}-${row.sector_id}-${index}`}>
                    <TableCell className="font-mono text-xs">{row.country_iso3}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">{row.sector_name}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <span className="block truncate text-xs">{row.industry_name}</span>
                      <span className="font-mono text-[9px] text-muted">
                        {row.industry_code} · {row.classification_system}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.year}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.employment === null ? "Unavailable" : `${formatNumber(row.employment, { maximumFractionDigits: 0 })}k`}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatSignedPercent(row.employment_growth)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.mapping_quality === "detailed_proxy"
                            ? "success"
                            : row.mapping_quality === "broad_proxy"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {row.mapping_quality.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted">Unavailable</TableCell>
                  </TableRow>
                ))}
                {!latestSectorRows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted">
                      No employment rows are available for the current country, sector and grain
                      selection.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Alert variant="info">
        <Layers3 className="h-4 w-4" />
        <AlertTitle>What “mapped sector” means here</AlertTitle>
        <AlertDescription>
          Each sector is linked to an ISIC section or division chosen as a transparent proxy. For
          example, semiconductors maps to manufacturing and automotive maps to motor-vehicle trade and
          repair at section level. These are not bespoke sector workforces and must not be compared as
          if they were a national industrial census.
        </AlertDescription>
      </Alert>
    </div>
  );
}
