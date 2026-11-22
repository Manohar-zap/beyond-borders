"use client";

import * as React from "react";
import { AlertTriangle, CalendarClock, Search, ShieldCheck, TrendingUp, Waves } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import {
  barOption,
  statusColor,
  statusLabel,
  timeSeriesOption,
} from "@/lib/chart-theme";
import { averageBy, toNumber } from "@/lib/data";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type {
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
    ["forecast-availability", dataset, countryParam],
    "/api/forecast/availability",
    { dataset, countries: countryParam },
  );

  const validationRows = validationQuery.data?.data ?? [];
  const summaryRows = summaryQuery.data?.data ?? [];
  const availabilityRows = availabilityQuery.data?.data ?? [];

  const filteredAvailability = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return availabilityRows
      .filter((row) =>
        query
          ? `${seriesLabel(row)} ${row.indicator_id} ${row.sector_id} ${row.occupation_code}`
              .toLowerCase()
              .includes(query)
          : true,
      )
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
  }, [availabilityRows, search]);

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
    { enabled: Boolean(selectedRow) },
  );

  const actualRows = outlookQuery.data?.meta?.actual ?? [];
  const forecastRows = outlookQuery.data?.meta?.forecast ?? [];
  const unit = outlookQuery.data?.meta?.unit ?? selectedRow?.indicator_name ?? "";

  const actualSeries = React.useMemo(
    () => ({
      name: "Observed",
      color: "#101720",
      points: actualRows
        .filter((row) => toNumber(row.value) !== null)
        .map((row) => ({ year: row.year, value: toNumber(row.value) })),
    }),
    [actualRows],
  );

  const lastActual = actualSeries.points[actualSeries.points.length - 1];

  const forecastSeries = React.useMemo(
    () => ({
      name: "Forecast (baseline)",
      color: "#A9661B",
      dashed: true,
      points: [
        ...(lastActual ? [{ year: lastActual.year, value: lastActual.value }] : []),
        ...forecastRows.map((row) => ({
          year: row.target_year,
          value: toNumber(row.predicted_value),
        })),
      ],
    }),
    [forecastRows, lastActual],
  );

  const bands = React.useMemo(
    () => [
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
    ],
    [forecastRows, lastActual],
  );

  const forecastOrigin =
    forecastRows[0]?.forecast_origin ??
    (actualSeries.points.length ? actualSeries.points[actualSeries.points.length - 1].year : 2024);

  const validationStatus = forecastRows[0]?.validation_status ?? selectedRow?.validation_status;
  const validationMape = forecastRows[0]?.validation_mape ?? null;
  const validationRmse = forecastRows[0]?.validation_rmse ?? null;
  const validationCoverage = forecastRows[0]?.validation_coverage_pct ?? null;
  const modelName = forecastRows[0]?.model_name ?? "—";

  const statusChartData = React.useMemo(() => {
    const datasets = DATASETS.map((item) => item.id);
    return {
      categories: datasets,
      series: STATUSES.map((status) => ({
        name: statusLabel(status),
        color: statusColor(status),
        stack: "status",
        values: datasets.map(
          (datasetName) =>
            validationRows.filter(
              (row) =>
                row.dataset === datasetName && row.validation_status === status,
            ).length || null,
        ),
      })),
    };
  }, [validationRows]);

  const datasetCoverage = React.useMemo(
    () =>
      DATASETS.map((item) => {
        const rows = validationRows.filter((row) => row.dataset === item.id);
        return {
          ...item,
          series: rows.length,
          validated: rows.filter((row) => row.validation_status === "validated").length,
          meanMape: averageBy(
            rows.filter((row) => row.validation_mape !== null),
            (row) => row.validation_mape,
          ),
        };
      }),
    [validationRows],
  );

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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 07 · Forecast & future outlook"
        title="Validated trend projections to 2030"
        description="Damped-trend forecasts for eligible annual series, separated from observations and accompanied by holdout error metrics and 80% residual intervals. Forecasts describe a continuation of historical trends, not a policy scenario or a promise."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="warning">Model output · not observed</Badge>
            <Badge variant="outline">2025–2030</Badge>
            <Badge variant="outline">{modelVersion}</Badge>
            <Badge variant="secondary">Holdout validated</Badge>
          </div>
        }
      />

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
          value={meanMape === null ? "Unavailable" : formatPercent(meanMape)}
          hint="Average across selected series"
          tone={meanMape !== null && meanMape <= 10 ? "teal" : "amber"}
          icon={<Waves className="h-4 w-4" />}
        />
      </section>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Forecasts are not observations</AlertTitle>
        <AlertDescription>
          Dashed lines and shaded bands are model output. A forecast is included only when the series
          has at least eight consecutive annual observations, ends in 2021 or later, and completes a
          holdout backtest. High-error series remain visible but must not be read as reliable point
          predictions.
        </AlertDescription>
      </Alert>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Validation portfolio"
          title="Forecast series by validation status"
          description="Counts of eligible series, not forecast rows. Validated means holdout MAPE ≤ 10%; moderate error is 10–25%; high error is above 25%."
          option={barOption({
            categories: statusChartData.categories.map((id) => DATASET_LABELS[id] ?? id),
            series: statusChartData.series,
            valueFormatter: (value) => `${value} series`,
            yName: "series",
          })}
          height={320}
          source={{
            name: "Holdout backtests computed by scripts/forecast.py",
            note: "Final 2–3 observed years held out; MAPE and RMSE reported per series.",
          }}
          csvRows={validationRows.map((row) => ({
            dataset: row.dataset,
            country_iso3: row.country_iso3,
            sector_id: row.sector_id,
            occupation_code: row.occupation_code,
            indicator_id: row.indicator_id,
            granularity: row.granularity,
            validation_status: row.validation_status,
            validation_mape: row.validation_mape,
            validation_rmse: row.validation_rmse,
            validation_n: row.validation_n,
            model_name: row.model_name,
          }))}
          csvFilename="forecast-validation-status"
          isLoading={validationQuery.isLoading}
          error={validationQuery.error}
          isEmpty={!validationRows.length}
          onRetry={() => void validationQuery.refetch()}
        />

        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="eyebrow">Coverage by dataset</div>
            <CardTitle className="text-[15px]">What is forecast, and how well</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {datasetCoverage.map((entry) => {
              const share = entry.series ? (entry.validated / entry.series) * 100 : 0;
              return (
                <div key={entry.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink/80">{entry.label}</span>
                    <span className="font-mono text-[10px] text-muted">
                      {entry.validated}/{entry.series} validated
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                    <div
                      className="h-full rounded-full bg-teal"
                      style={{ width: `${Math.max(share, entry.series ? 2 : 0)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    {entry.meanMape === null
                      ? "Mean MAPE unavailable"
                      : `Mean holdout MAPE ${entry.meanMape.toFixed(1)}%`}
                  </p>
                </div>
              );
            })}
            <div className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              <p>
                Model: <span className="font-medium text-ink">{modelVersion}</span> · damped additive
                trend with an OLS fallback. Interval level: 80%.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <SectionHeading
        eyebrow="Forecast explorer"
        title="Inspect one series end to end"
        description="Observed history, forecast point path and 80% interval. The vertical marker separates observation from model output. Use the series search to narrow a large validation portfolio."
      />

      <Card>
        <CardContent className="grid gap-3 pt-5 lg:grid-cols-12">
          <div className="space-y-1.5 lg:col-span-3">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATASETS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:col-span-3">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              Search series
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Country, indicator, sector…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5 lg:col-span-6">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              Series ({filteredAvailability.length} eligible)
            </label>
            <Select value={selection} onValueChange={setSelection}>
              <SelectTrigger>
                <SelectValue placeholder="Select a validated series" />
              </SelectTrigger>
              <SelectContent>
                {filteredAvailability.map((row) => (
                  <SelectItem key={seriesKey(row)} value={seriesKey(row)}>
                    {seriesLabel(row)} — {statusLabel(row.validation_status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-8"
          eyebrow="Observed vs model"
          title={selectedRow ? seriesLabel(selectedRow) : "Select a series"}
          description={
            selectedRow
              ? `${selectedRow.indicator_name} in ${unit}. Solid line: observed history. Dashed line and shaded band: baseline forecast with 80% residual interval.`
              : "No eligible forecast series match the current filters."
          }
          option={timeSeriesOption({
            series: [actualSeries, forecastSeries],
            bands,
            xMin: actualSeries.points[0]?.year ?? 2010,
            xMax: 2030,
            yName: unit,
            valueFormatter: (value) => `${formatNumber(value)} ${unit}`,
            markLine: { year: forecastOrigin + 0.5, label: "Forecast →" },
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
          isEmpty={!forecastRows.length && !actualRows.length}
          onRetry={() => void outlookQuery.refetch()}
          footnote={
            selectedRow
              ? `Origin year ${forecastOrigin}. ${actualRows.length} observed years and ${forecastRows.length} forecast years. Intervals are 80% empirical residual intervals, widening with horizon.`
              : undefined
          }
        />

        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <div className="eyebrow">Series card</div>
            <CardTitle className="text-[15px]">Validation and provenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-xs">
            {selectedRow ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Status</span>
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
                <div className="border-t border-line pt-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Series label
                  </p>
                  <p className="mt-1 leading-relaxed text-ink/80">{seriesLabel(selectedRow)}</p>
                </div>
                <div className="rounded-sm border border-[#E7D3B3] bg-[#FAF1E3] p-2.5 text-[11px] leading-relaxed text-[#6E4512]">
                  This is a baseline trend projection. It does not include policy changes, technology
                  shocks, migration or business-cycle turning points.
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                Select a series to see its holdout validation and model metadata.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <SectionHeading
        eyebrow="Validation detail"
        title="Holdout metrics for selected countries"
        description="Every eligible series is backtested on its final 2–3 annual observations. MAPE is undefined for series with zero test values; those rows are not forced into a percentage score."
      />

      <Card>
        <CardContent className="pt-5">
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
                  <TableHead className="text-right">Holdout</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Forecast years</TableHead>
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
                        <span className="font-mono text-[9px] text-muted">
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
                {!validationRows.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted">
                      No validation rows are available for the current country filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <div className="eyebrow">Model card</div>
            <CardTitle className="text-[15px]">How the forecasts are produced</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-[13px] leading-6 text-muted">
            <p>
              A Holt damped additive trend (ETS A,Ad,N) is fitted to each eligible annual series. If
              the ETS fit fails, an OLS linear trend is used. The final 2–3 observations are held out
              for validation; the model is then refitted on the full series for the 2025–2030 path.
            </p>
            <p>
              Intervals are 80% empirical residual intervals that widen with the square root of the
              horizon. They describe historical residual uncertainty, not structural breaks or policy
              scenarios. Series with gaps, fewer than eight observations, or a last observation before
              2021 are not forecast at all.
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="eyebrow">Status rules</div>
            <CardTitle className="text-[15px]">Reading the validation badge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-xs">
            <StatusRule color="#0E6B62" label="Validated" detail="Holdout MAPE ≤ 10%" />
            <StatusRule color="#A9661B" label="Moderate error" detail="Holdout MAPE 10–25%" />
            <StatusRule color="#A63D57" label="High error" detail="Holdout MAPE > 25%" />
            <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              A validated badge is not a guarantee. It means the simple trend model tracked the recent
              holdout reasonably well in percentage terms.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono text-[11px] font-medium text-ink">{value}</span>
    </div>
  );
}

function StatusRule({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="w-24 text-xs font-medium text-ink">{label}</span>
      <span className="text-[11px] text-muted">{detail}</span>
    </div>
  );
}
