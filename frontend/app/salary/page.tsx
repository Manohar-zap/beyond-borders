"use client";

import * as React from "react";
import { AlertTriangle, Banknote, BriefcaseBusiness, Globe2, TrendingUp } from "lucide-react";
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
import { COUNTRY_COLORS, barOption, timeSeriesOption } from "@/lib/chart-theme";
import { FALLBACK_OCCUPATIONS } from "@/lib/constants";
import { averageBy, groupRows, latestRows, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";
import type { Envelope, Occupation, ProjectMeta, SalaryRow } from "@/lib/types";

type Basis = "nominal" | "real" | "ppp";

const BASIS_LABELS: Record<Basis, string> = {
  nominal: "Nominal local currency",
  real: "Real, 2010 prices",
  ppp: "PPP international $",
};

const BASIS_NOTES: Record<Basis, string> = {
  nominal: "Nominal local-currency levels are not directly comparable across countries.",
  real: "Deflated with World Bank CPI (2010 = 100); still in local currency.",
  ppp: "Divided by the World Bank private-consumption PPP conversion factor; comparable across countries.",
};

const VALUE_KEYS: Record<Basis, "salary_mean" | "salary_real_2010" | "salary_ppp_intl"> = {
  nominal: "salary_mean",
  real: "salary_real_2010",
  ppp: "salary_ppp_intl",
};

interface SalaryGrowthRow {
  country_iso3: string;
  country_name: string;
  occupation_code: string;
  occupation_name: string;
  first_value: number;
  first_year: number;
  last_value: number;
  last_year: number;
  observations: number;
  cagr_pct: number | null;
  years_span: number;
  note: string;
}

export default function SalaryPage() {
  const { countries, from, to, countryParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;
  const occupationList: Occupation[] = projectMeta?.occupations?.length
    ? projectMeta.occupations
    : FALLBACK_OCCUPATIONS;

  const [basis, setBasis] = React.useState<Basis>("ppp");
  const [occupation, setOccupation] = React.useState("2");
  const valueKey = VALUE_KEYS[basis];

  const seriesQuery = useApi<Envelope<SalaryRow>>(
    ["salary-series", countryParam, occupation, basis, from, to],
    "/api/salary/series",
    {
      countries: countryParam,
      occupations: occupation,
      basis,
      start: from,
      end: to,
    },
  );

  const latestQuery = useApi<Envelope<SalaryRow>>(
    ["salary-latest-all", countryParam, to],
    "/api/salary/latest",
    { countries: countryParam, basis: "ppp", year: to },
  );

  const growthQuery = useApi<Envelope<SalaryGrowthRow>>(
    ["salary-growth", countryParam, occupation, basis, from, to],
    "/api/salary/growth",
    {
      countries: countryParam,
      occupations: occupation,
      basis,
      start: from,
      end: to,
    },
  );

  const seriesRows = seriesQuery.data?.data ?? [];
  const latestAllRows = latestQuery.data?.data ?? [];
  const growthRows = growthQuery.data?.data ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );
  const occupationNames = React.useMemo(
    () => Object.fromEntries(occupationList.map((item) => [item.code, item.name])),
    [occupationList],
  );

  const series = React.useMemo(() => {
    const groups = groupRows(seriesRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row[valueKey]) })),
    }));
  }, [seriesRows, countryNames, valueKey]);

  const latest = React.useMemo(
    () =>
      latestRows(seriesRows, {
        time: (row) => row.year,
        group: (row) => row.country_iso3,
        value: (row) => row[valueKey],
      })
        .filter((row) => toNumber(row[valueKey]) !== null)
        .sort((a, b) => (toNumber(b[valueKey]) ?? 0) - (toNumber(a[valueKey]) ?? 0)),
    [seriesRows, valueKey],
  );

  const latestYear = latest.length ? Math.max(...latest.map((row) => row.year)) : to;
  const latestMean = averageBy(latest, (row) => row[valueKey]);
  const meanRealCagr = averageBy(
    growthRows.filter((row) => row.cagr_pct !== null),
    (row) => row.cagr_pct,
  );
  const unit =
    basis === "ppp"
      ? "intl $ / month"
      : `${latest[0]?.currency ?? ""} / month${basis === "real" ? " (2010 prices)" : ""}`;

  const occupationLadder = React.useMemo(() => {
    const map: Record<string, { code: string; name: string; values: number[] }> = {};
    latestAllRows.forEach((row) => {
      const value = toNumber(row.salary_ppp_intl);
      if (value === null || row.occupation_code === "TOTAL") return;
      map[row.occupation_code] ??= {
        code: row.occupation_code,
        name: row.occupation_name,
        values: [],
      };
      map[row.occupation_code].values.push(value);
    });
    return Object.values(map)
      .map((entry) => ({
        code: entry.code,
        name: entry.name,
        value: averageBy(entry.values, (value) => value),
        countries: entry.values.length,
      }))
      .filter((entry) => entry.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [latestAllRows]);

  const professionalPremium = React.useMemo(() => {
    const professionals = occupationLadder.find((entry) => entry.code === "2");
    const all = latestAllRows
      .filter((row) => row.occupation_code === "TOTAL")
      .map((row) => toNumber(row.salary_ppp_intl))
      .filter((value): value is number => value !== null);
    const allMean = averageBy(all, (value) => value);
    if (!professionals?.value || !allMean) return null;
    return ((professionals.value / allMean) - 1) * 100;
  }, [occupationLadder, latestAllRows]);

  const sourceUrl = seriesRows[0]?.source_url ?? "https://ilostat.ilo.org/topics/pay/";
  const selectedOccupationName = occupationNames[occupation] ?? occupation;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 05 · Salary analysis"
        title="Earnings, interpreted with the right price base"
        description="Occupation-level gross monthly earnings from ILOSTAT, presented in nominal local currency, constant 2010 prices and PPP-adjusted international dollars. Real and PPP views use World Bank deflators and conversion factors; no market exchange rate is applied."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">Gross monthly earnings</Badge>
            <Badge variant="outline">ISCO major groups</Badge>
            <Badge variant="warning">Japan unavailable</Badge>
            <Badge variant="secondary">{BASIS_LABELS[basis]}</Badge>
          </div>
        }
      />

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="eyebrow mb-1.5">Value basis</p>
            <Tabs value={basis} onValueChange={(value) => setBasis(value as Basis)}>
              <TabsList>
                <TabsTrigger value="nominal">Nominal</TabsTrigger>
                <TabsTrigger value="real">Real 2010</TabsTrigger>
                <TabsTrigger value="ppp">PPP</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Occupation</p>
            <Select value={occupation} onValueChange={setOccupation}>
              <SelectTrigger className="w-[280px]">
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
        <p className="max-w-md text-[11px] leading-relaxed text-muted">{BASIS_NOTES[basis]}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Countries with earnings"
          value={latest.length}
          unit={`of ${countries.length} selected`}
          hint="Japan has no occupation-level observations"
          tone="blue"
          icon={<Globe2 className="h-4 w-4" />}
        />
        <KpiCard
          label={`Mean ${BASIS_LABELS[basis].toLowerCase()}`}
          value={latestMean === null ? "Unavailable" : basis === "ppp" ? `$${formatCompact(latestMean)}` : formatCompact(latestMean)}
          unit={unit}
          hint={`${selectedOccupationName} · latest ≤ ${latestYear}`}
          tone="teal"
          icon={<Banknote className="h-4 w-4" />}
        />
        <KpiCard
          label="Real earnings growth"
          value={formatSignedPercent(meanRealCagr)}
          unit={meanRealCagr === null ? undefined : "CAGR"}
          delta={meanRealCagr}
          deltaLabel={`${from}–${to} · selected basis`}
          hint="Average across countries with valid endpoints"
          tone="amber"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Professional premium"
          value={professionalPremium === null ? "Unavailable" : formatSignedPercent(professionalPremium)}
          hint="Professionals vs all-occupation mean, PPP"
          tone="violet"
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
      </section>

      <Alert variant={basis === "nominal" ? "warning" : "info"}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>
          {basis === "nominal"
            ? "Nominal local-currency levels are not cross-country comparable"
            : basis === "real"
              ? "Real values remove national inflation but remain in local currency"
              : "PPP values support cross-country comparison"}
        </AlertTitle>
        <AlertDescription>{BASIS_NOTES[basis]}</AlertDescription>
      </Alert>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-8"
          eyebrow="Earnings trajectory"
          title={`${selectedOccupationName} — mean monthly earnings`}
          description={`${BASIS_LABELS[basis]}. Gross monthly earnings of employees; experience level is not available in the harmonised series.`}
          option={timeSeriesOption({
            series,
            xMin: from,
            xMax: to,
            yName: unit,
            valueFormatter: (value) =>
              basis === "ppp"
                ? `$${formatNumber(value, { maximumFractionDigits: 0 })}`
                : `${formatNumber(value, { maximumFractionDigits: 0 })} ${latest[0]?.currency ?? ""}`,
          })}
          height={370}
          source={{
            name: "ILOSTAT earnings + World Bank CPI and PPP factors",
            url: sourceUrl,
            note: "Gross nominal source values; real and PPP columns are derived, not observed.",
          }}
          csvRows={seriesRows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            occupation_code: row.occupation_code,
            occupation_name: row.occupation_name,
            year: row.year,
            salary_mean_nominal: row.salary_mean,
            salary_real_2010: row.salary_real_2010,
            salary_ppp_intl: row.salary_ppp_intl,
            currency: row.currency,
            gross_or_net: row.gross_or_net,
            occupation_classification: row.occupation_classification,
            source_url: row.source_url,
          }))}
          csvFilename={`salary-${occupation}-${basis}-series`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!seriesRows.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-4"
          eyebrow="Latest snapshot"
          title="Most recent earnings by country"
          description="Latest available observation within the selected window. Japan is shown as unavailable, not estimated."
          option={barOption({
            categories: latest.map((row) => row.country_iso3),
            series: [
              {
                name: BASIS_LABELS[basis],
                values: latest.map((row) => toNumber(row[valueKey])),
                color: "#0E6B62",
              },
            ],
            valueFormatter: (value) =>
              basis === "ppp"
                ? `$${formatNumber(value, { maximumFractionDigits: 0 })}`
                : `${formatNumber(value, { maximumFractionDigits: 0 })} ${latest[0]?.currency ?? ""}`,
            yName: unit,
          })}
          height={370}
          source={{
            name: "ILOSTAT earnings; World Bank conversions",
            url: sourceUrl,
            note: "Latest available value per country; years can differ.",
          }}
          csvRows={latest.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            occupation_code: row.occupation_code,
            occupation_name: row.occupation_name,
            value: row[valueKey],
            basis,
            currency: row.currency,
            source_url: row.source_url,
          }))}
          csvFilename={`salary-${occupation}-${basis}-latest`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!latest.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-7"
          eyebrow="Occupation ladder"
          title="Average PPP earnings by occupation"
          description="Simple mean across the selected countries with a valid PPP observation. A descriptive ladder, not a controlled pay-gap estimate."
          option={barOption({
            categories: occupationLadder.map((entry) => entry.name),
            series: [
              {
                name: "PPP intl $ / month",
                values: occupationLadder.map((entry) => entry.value),
                color: "#6B4C9A",
              },
            ],
            horizontal: true,
            valueFormatter: (value) => `$${formatNumber(value, { maximumFractionDigits: 0 })}`,
          })}
          height={420}
          source={{
            name: "ILOSTAT earnings + World Bank PPP",
            url: sourceUrl,
            note: "Means across selected countries; Canada uses ISCO-88 and Japan is absent.",
          }}
          csvRows={occupationLadder.map((entry) => ({
            occupation_code: entry.code,
            occupation_name: entry.name,
            mean_salary_ppp_intl: entry.value,
            countries: entry.countries,
          }))}
          csvFilename="salary-occupation-ladder-ppp"
          isLoading={latestQuery.isLoading}
          error={latestQuery.error}
          isEmpty={!occupationLadder.length}
          onRetry={() => void latestQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Real growth"
          title="Earnings CAGR in the selected window"
          description="Compound annual growth in the selected value basis. Real growth is the preferred view for purchasing power over time; PPP growth mixes price and exchange-rate effects."
          option={barOption({
            categories: growthRows.map((row) => row.country_iso3),
            series: [
              {
                name: "CAGR",
                values: growthRows.map((row) => row.cagr_pct),
                color: "#A9661B",
              },
            ],
            valueFormatter: (value) => formatSignedPercent(value),
            yName: "% per year",
          })}
          height={420}
          source={{
            name: "ILOSTAT earnings; computed endpoints",
            url: sourceUrl,
            note: "Only observed endpoints are used; missing years are not interpolated.",
          }}
          csvRows={growthRows.map((row) => ({
            country_iso3: row.country_iso3,
            occupation_code: row.occupation_code,
            basis,
            first_year: row.first_year,
            first_value: row.first_value,
            last_year: row.last_year,
            last_value: row.last_value,
            cagr_pct: row.cagr_pct,
            observations: row.observations,
          }))}
          csvFilename={`salary-${occupation}-${basis}-growth`}
          isLoading={growthQuery.isLoading}
          error={growthQuery.error}
          isEmpty={!growthRows.length}
          onRetry={() => void growthQuery.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Salary detail"
        title="Latest earnings by country and occupation"
        description="All three value bases are shown together so nominal, real and PPP interpretations remain distinguishable. Gross/net and classification are preserved from the source."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Occupation</TableHead>
                  <TableHead className="text-right">Year</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="text-right">Real 2010</TableHead>
                  <TableHead className="text-right">PPP intl $</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead>Classification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestAllRows
                  .slice()
                  .sort((a, b) => a.country_iso3.localeCompare(b.country_iso3) || a.occupation_code.localeCompare(b.occupation_code))
                  .slice(0, 120)
                  .map((row, index) => (
                    <TableRow key={`${row.country_iso3}-${row.occupation_code}-${index}`}>
                      <TableCell className="font-mono text-xs">{row.country_iso3}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs">
                        {row.occupation_name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.year}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.salary_mean, { maximumFractionDigits: 0 })}{" "}
                        <span className="text-muted">{row.currency}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.salary_real_2010, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.salary_ppp_intl === null ? "—" : `$${formatNumber(row.salary_ppp_intl, { maximumFractionDigits: 0 })}`}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize">{row.gross_or_net}</span>
                        <span className="text-muted"> · monthly</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.occupation_classification === "ISCO-08" ? "success" : "warning"}>
                          {row.occupation_classification}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                {!latestAllRows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted">
                      No salary observations are available for the current country selection.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Japan is unavailable</AlertTitle>
          <AlertDescription>
            The ILOSTAT occupation earnings series used here has no Japan observations. The dashboard
            does not backfill from another source or estimate a level; Japan is excluded from earnings
            charts and explicitly marked unavailable.
          </AlertDescription>
        </Alert>
        <Alert variant="info">
          <BriefcaseBusiness className="h-4 w-4" />
          <AlertTitle>Classification differences are retained</AlertTitle>
          <AlertDescription>
            Canada reports occupation earnings under ISCO-88 rather than ISCO-08. Major groups are
            mapped explicitly and flagged; they are not silently relabelled as fully harmonised.
          </AlertDescription>
        </Alert>
      </section>
    </div>
  );
}
