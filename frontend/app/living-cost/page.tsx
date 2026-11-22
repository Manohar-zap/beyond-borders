"use client";

import * as React from "react";
import { AlertTriangle, Building2, Globe2, House, ReceiptText, TrendingUp } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import { COUNTRY_COLORS, barOption, timeSeriesOption } from "@/lib/chart-theme";
import { averageBy, groupRows, latestRows, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type { Envelope, LivingCostRow, ProjectMeta } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  consumer_price_index: "Consumer price index",
  consumer_price_inflation: "Consumer price inflation",
  household_consumption_per_capita: "Household consumption per capita",
  ppp_private_consumption: "PPP factor, private consumption",
  ppp_gdp: "PPP factor, GDP",
};

const CATEGORY_UNITS: Record<string, string> = {
  consumer_price_index: "index (2010 = 100)",
  consumer_price_inflation: "% annual",
  household_consumption_per_capita: "constant 2015 US$ per capita",
  ppp_private_consumption: "LCU per international $",
  ppp_gdp: "LCU per international $",
};

export default function LivingCostPage() {
  const { countries, from, to, countryParam } = useFilters();
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;

  const [category, setCategory] = React.useState("consumer_price_index");

  const seriesQuery = useApi<Envelope<LivingCostRow>>(
    ["living-cost-series", countryParam, from, to],
    "/api/living-cost/series",
    { countries: countryParam, start: from, end: to },
  );

  const latestQuery = useApi<Envelope<LivingCostRow>>(
    ["living-cost-latest", countryParam, to],
    "/api/living-cost/latest",
    { countries: countryParam, year: to },
  );

  const seriesRows = seriesQuery.data?.data ?? [];
  const latestRowsRaw = latestQuery.data?.data ?? [];

  const categories = React.useMemo(() => {
    const fromMeta = projectMeta?.living_cost_categories?.map((item) => item.expense_category) ?? [];
    const observed = Array.from(new Set(seriesRows.map((row) => row.expense_category)));
    return Array.from(new Set([...fromMeta, ...observed]));
  }, [projectMeta, seriesRows]);

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );

  const categoryRows = React.useMemo(
    () => seriesRows.filter((row) => row.expense_category === category),
    [seriesRows, category],
  );

  const series = React.useMemo(() => {
    const groups = groupRows(categoryRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row.expense_value) })),
    }));
  }, [categoryRows, countryNames]);

  const latest = React.useMemo(
    () =>
      latestRows(categoryRows, {
        time: (row) => row.year,
        group: (row) => row.country_iso3,
        value: (row) => row.expense_value,
      })
        .filter((row) => toNumber(row.expense_value) !== null)
        .sort((a, b) => (toNumber(b.expense_value) ?? 0) - (toNumber(a.expense_value) ?? 0)),
    [categoryRows],
  );

  const latestCategoryRows = React.useMemo(
    () =>
      latestRows(latestRowsRaw, {
        time: (row) => row.year,
        group: (row) => `${row.country_iso3}|${row.expense_category}`,
        value: (row) => row.expense_value,
      }),
    [latestRowsRaw],
  );

  const cpiLatest = latestCategoryRows
    .filter((row) => row.expense_category === "consumer_price_index")
    .map((row) => toNumber(row.expense_value))
    .filter((value): value is number => value !== null);
  const inflationLatest = latestCategoryRows
    .filter((row) => row.expense_category === "consumer_price_inflation")
    .map((row) => toNumber(row.expense_value))
    .filter((value): value is number => value !== null);
  const consumptionLatest = latestCategoryRows
    .filter((row) => row.expense_category === "household_consumption_per_capita")
    .map((row) => toNumber(row.expense_value))
    .filter((value): value is number => value !== null);

  const categoryUnit = CATEGORY_UNITS[category] ?? categoryRows[0]?.expense_unit ?? "";
  const categoryLabel = CATEGORY_LABELS[category] ?? categoryRows[0]?.expense_label ?? category;
  const sourceUrl =
    categoryRows[0]?.source_url ?? "https://data.worldbank.org/indicator/FP.CPI.TOTL";

  const inflationRows = seriesRows.filter(
    (row) => row.expense_category === "consumer_price_inflation",
  );
  const consumptionRows = seriesRows.filter(
    (row) => row.expense_category === "household_consumption_per_capita",
  );

  const inflationSeries = React.useMemo(() => {
    const groups = groupRows(inflationRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row.expense_value) })),
    }));
  }, [inflationRows, countryNames]);

  const consumptionSeries = React.useMemo(() => {
    const groups = groupRows(consumptionRows, (row) => row.country_iso3);
    return Object.entries(groups).map(([iso3, group]) => ({
      name: countryNames[iso3] ?? iso3,
      color: COUNTRY_COLORS[iso3],
      points: group
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: toNumber(row.expense_value) })),
    }));
  }, [consumptionRows, countryNames]);

  const tableCategories = [
    "consumer_price_index",
    "consumer_price_inflation",
    "household_consumption_per_capita",
    "ppp_private_consumption",
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 06 · Living cost analysis"
        title="Price levels, inflation and household consumption"
        description="National-level World Bank price and consumption indicators. This build does not include city-level expense baskets, rent observations or a cost-of-living index; those concepts are marked unavailable rather than proxied silently."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">National aggregates</Badge>
            <Badge variant="outline">2010 = 100 CPI</Badge>
            <Badge variant="warning">City-level unavailable</Badge>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Mean consumer price index"
          value={cpiLatest.length ? formatNumber(averageBy(cpiLatest, (value) => value), { maximumFractionDigits: 1 }) : "Unavailable"}
          unit="2010 = 100"
          hint={`Latest ≤ ${to} · ${cpiLatest.length} countries`}
          tone="blue"
          icon={<ReceiptText className="h-4 w-4" />}
        />
        <KpiCard
          label="Mean inflation"
          value={formatPercent(averageBy(inflationLatest, (value) => value))}
          hint="Consumer prices, annual %"
          tone="amber"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Household consumption"
          value={consumptionLatest.length ? `$${formatCompact(averageBy(consumptionLatest, (value) => value))}` : "Unavailable"}
          unit="per capita"
          hint="Constant 2015 US$"
          tone="teal"
          icon={<House className="h-4 w-4" />}
        />
        <KpiCard
          label="City-level expenses"
          value="Unavailable"
          hint="No official city basket acquired"
          unavailable
          tone="rose"
          icon={<Building2 className="h-4 w-4" />}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1.5">Indicator explorer</p>
            <Tabs value={category} onValueChange={setCategory}>
              <TabsList className="h-auto flex-wrap justify-start">
                {categories.map((item) => (
                  <TabsTrigger key={item} value={item} className="text-[11px]">
                    {CATEGORY_LABELS[item] ?? item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <p className="max-w-lg text-[11px] leading-relaxed text-muted">
            {category === "ppp_private_consumption" || category === "ppp_gdp"
              ? "PPP conversion factors are expressed in local currency units per international dollar. They are price-level context, not a household expense basket."
              : category === "consumer_price_index"
                ? "The CPI is rebased to 2010 = 100 for comparability across countries in this build."
                : "Values are national aggregates; they are not city-specific rents, food baskets or transport costs."}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-8"
          eyebrow="Selected indicator"
          title={`${categoryLabel} — country trajectories`}
          description={`${categoryLabel} in ${categoryUnit}. National-level annual observations; no city-level disaggregation.`}
          option={timeSeriesOption({
            series,
            xMin: from,
            xMax: to,
            yName: categoryUnit,
            valueFormatter: (value) =>
              category === "consumer_price_inflation"
                ? `${value.toFixed(1)}%`
                : `${formatNumber(value, { maximumFractionDigits: 2 })} ${categoryUnit}`,
          })}
          height={370}
          source={{
            name: "World Bank — World Development Indicators",
            url: sourceUrl,
            note: "Observed annual values only; gaps are not interpolated.",
          }}
          csvRows={categoryRows.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            category: row.expense_category,
            label: row.expense_label,
            value: row.expense_value,
            unit: row.expense_unit,
            city: row.city,
            source_url: row.source_url,
          }))}
          csvFilename={`living-cost-${category}-series`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!categoryRows.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-4"
          eyebrow="Latest snapshot"
          title="Most recent value by country"
          description="Latest observation available within the selected year window. National aggregates only."
          option={barOption({
            categories: latest.map((row) => row.country_iso3),
            series: [
              {
                name: categoryLabel,
                values: latest.map((row) => toNumber(row.expense_value)),
                color: "#A9661B",
              },
            ],
            valueFormatter: (value) =>
              category === "consumer_price_inflation"
                ? `${value.toFixed(1)}%`
                : `${formatNumber(value, { maximumFractionDigits: 2 })}`,
            yName: categoryUnit,
          })}
          height={370}
          source={{
            name: "World Bank — World Development Indicators",
            url: sourceUrl,
            note: "Latest available value per country; years can differ.",
          }}
          csvRows={latest.map((row) => ({
            country_iso3: row.country_iso3,
            country_name: row.country_name,
            year: row.year,
            category: row.expense_category,
            value: row.expense_value,
            unit: row.expense_unit,
            city: row.city,
          }))}
          csvFilename={`living-cost-${category}-latest`}
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!latest.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-6"
          eyebrow="Inflation"
          title="Consumer price inflation"
          description="Annual percentage change in consumer prices. High values can reflect exchange-rate and supply shocks as well as domestic demand."
          option={timeSeriesOption({
            series: inflationSeries,
            xMin: from,
            xMax: to,
            yName: "% annual",
            valueFormatter: (value) => `${value.toFixed(1)}%`,
          })}
          height={330}
          source={{
            name: "World Bank WDI — FP.CPI.TOTL.ZG",
            url: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
            note: "National CPI inflation; no city-level disaggregation.",
          }}
          csvRows={inflationRows.map((row) => ({
            country_iso3: row.country_iso3,
            year: row.year,
            value: row.expense_value,
            unit: row.expense_unit,
            source_url: row.source_url,
          }))}
          csvFilename="living-cost-inflation-series"
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!inflationRows.length}
          onRetry={() => void seriesQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-6"
          eyebrow="Consumption"
          title="Household consumption per capita"
          description="Constant 2015 US$ per person. This is an expenditure aggregate, not a minimum living-cost basket."
          option={timeSeriesOption({
            series: consumptionSeries,
            xMin: from,
            xMax: to,
            yName: "constant 2015 US$",
            valueFormatter: (value) => `$${formatNumber(value, { maximumFractionDigits: 0 })}`,
          })}
          height={330}
          source={{
            name: "World Bank WDI — NE.CON.PRVT.PC.KD",
            url: "https://data.worldbank.org/indicator/NE.CON.PRVT.PC.KD",
            note: "Constant 2015 US$; national accounts aggregate.",
          }}
          csvRows={consumptionRows.map((row) => ({
            country_iso3: row.country_iso3,
            year: row.year,
            value: row.expense_value,
            unit: row.expense_unit,
            source_url: row.source_url,
          }))}
          csvFilename="living-cost-household-consumption"
          isLoading={seriesQuery.isLoading}
          error={seriesQuery.error}
          isEmpty={!consumptionRows.length}
          onRetry={() => void seriesQuery.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Living-cost detail"
        title="Latest national indicators by country"
        description="CPI and PPP factors are indices or conversion factors, not dollar expenses. Household consumption is a national-accounts aggregate in constant 2015 US$."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  {tableCategories.map((item) => (
                    <TableHead key={item} className="text-right">
                      {CATEGORY_LABELS[item] ?? item}
                    </TableHead>
                  ))}
                  <TableHead>Geography</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countries.map((iso3) => (
                  <TableRow key={iso3}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: COUNTRY_COLORS[iso3] }}
                        />
                        <span className="font-medium">{countryNames[iso3] ?? iso3}</span>
                      </span>
                    </TableCell>
                    {tableCategories.map((item) => {
                      const row = latestCategoryRows.find(
                        (candidate) =>
                          candidate.country_iso3 === iso3 && candidate.expense_category === item,
                      );
                      const value = toNumber(row?.expense_value);
                      return (
                        <TableCell key={item} className="text-right font-mono text-xs">
                          {value === null
                            ? "Unavailable"
                            : item === "consumer_price_inflation"
                              ? `${value.toFixed(1)}%`
                              : formatNumber(value, { maximumFractionDigits: 1 })}
                          {row ? <span className="ml-1 text-[9px] text-muted">({row.year})</span> : null}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Badge variant="outline">National</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>This is not a city cost-of-living index</AlertTitle>
        <AlertDescription>
          City-level rents, food baskets, transport and childcare expenses are not available in the
          official series used. The dashboard labels every row as “National” and does not substitute a
          private cost-of-living estimate. Use these indicators as national price and consumption
          context, not as a personal budget.
        </AlertDescription>
      </Alert>
    </div>
  );
}
