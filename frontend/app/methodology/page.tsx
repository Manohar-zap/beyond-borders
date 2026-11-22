"use client";

import * as React from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Database,
  FileCode2,
  GitBranch,
  Info,
  ShieldCheck,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMeta } from "@/components/providers/meta-provider";
import { useApi } from "@/lib/api";
import { barOption, heatmapOption } from "@/lib/chart-theme";
import { FALLBACK_SECTORS } from "@/lib/constants";
import { formatBytes } from "@/lib/data";
import { formatCompact, formatNumber } from "@/lib/format";
import { formatPercent } from "@/lib/format";
import type {
  CoverageCell,
  Envelope,
  EnvelopeMeta,
  MissingData,
  ProjectMeta,
  QualitySummaryRow,
  Source,
} from "@/lib/types";

interface CoverageResponse extends Envelope<never> {
  meta: EnvelopeMeta & {
    coverage?: {
      country_sector_matrix?: CoverageCell[];
      employment_matrix?: CoverageCell[];
      salary_matrix?: CoverageCell[];
      living_cost_matrix?: CoverageCell[];
    };
  };
}

interface QualitySummaryResponse extends Envelope<QualitySummaryRow> {
  meta: EnvelopeMeta & {
    missing_data: MissingData[];
    sources: Source[];
    forecast_metadata: Record<string, unknown>;
  };
}

interface LineageRow {
  dataset: string;
  source: string;
  raw_files: string;
  transformation: string;
  output: string;
}

const DATASET_LABELS: Record<string, string> = {
  country_sector: "Country–sector indicators",
  employment: "Employment",
  salary: "Salary",
  living_cost: "Living cost",
  country_context: "Country context",
  forecast: "Forecast",
};

export default function MethodologyPage() {
  const { meta } = useMeta();
  const projectMeta = meta as ProjectMeta | null;
  const sectorList = projectMeta?.sectors?.length ? projectMeta.sectors : FALLBACK_SECTORS;

  const coverageQuery = useApi<CoverageResponse>(["quality-coverage"], "/api/quality/coverage");
  const summaryQuery = useApi<QualitySummaryResponse>(["quality-summary"], "/api/quality/summary");
  const lineageQuery = useApi<Envelope<LineageRow>>(["quality-lineage"], "/api/quality/lineage");

  const coverage = coverageQuery.data?.meta?.coverage;
  const summaryRows = summaryQuery.data?.data ?? [];
  const lineageRows = lineageQuery.data?.data ?? [];
  const sources = projectMeta?.sources ?? summaryQuery.data?.meta?.sources ?? [];
  const missing = projectMeta?.missing_data ?? summaryQuery.data?.meta?.missing_data ?? [];

  const countryNames = React.useMemo(
    () => Object.fromEntries((projectMeta?.countries ?? []).map((country) => [country.iso3, country.name])),
    [projectMeta],
  );
  const sectorNames = React.useMemo(
    () => Object.fromEntries(sectorList.map((sector) => [sector.id, sector.short || sector.name])),
    [sectorList],
  );

  const countrySectorCells = coverage?.country_sector_matrix ?? [];
  const countryCodes = Array.from(
    new Set(countrySectorCells.map((cell) => cell.country_iso3)),
  );
  const sectorCodes = Array.from(new Set(countrySectorCells.map((cell) => cell.sector_id)));

  const countrySectorHeatmap = React.useMemo(() => {
    const xLabels = sectorCodes.map((id) => sectorNames[id] ?? id);
    const yLabels = countryCodes.map((iso3) => countryNames[iso3] ?? iso3);
    const data: [number, number, number | null][] = [];
    yLabels.forEach((_, y) => {
      xLabels.forEach((_, x) => {
        const cell = countrySectorCells.find(
          (candidate) =>
            candidate.country_iso3 === countryCodes[y] && candidate.sector_id === sectorCodes[x],
        );
        data.push([x, y, cell?.coverage_pct ?? null]);
      });
    });
    return { xLabels, yLabels, data };
  }, [countrySectorCells, countryCodes, sectorCodes, countryNames, sectorNames]);

  const employmentCells = (coverage?.employment_matrix ?? []).filter(
    (cell) => cell.granularity === "section" && cell.status === "available",
  );
  const employmentCountryCodes = Array.from(
    new Set(employmentCells.map((cell) => cell.country_iso3)),
  );
  const employmentSectorCodes = Array.from(
    new Set(employmentCells.map((cell) => cell.sector_id)),
  );
  const employmentHeatmap = React.useMemo(() => {
    const xLabels = employmentSectorCodes.map((id) => sectorNames[id] ?? id);
    const yLabels = employmentCountryCodes.map((iso3) => countryNames[iso3] ?? iso3);
    const data: [number, number, number | null][] = [];
    const max = Math.max(...employmentCells.map((cell) => cell.observations), 1);
    yLabels.forEach((_, y) => {
      xLabels.forEach((_, x) => {
        const cell = employmentCells.find(
          (candidate) =>
            candidate.country_iso3 === employmentCountryCodes[y] &&
            candidate.sector_id === employmentSectorCodes[x],
        );
        data.push([x, y, cell ? cell.observations : null]);
      });
    });
    return { xLabels, yLabels, data, max };
  }, [
    employmentCells,
    employmentCountryCodes,
    employmentSectorCodes,
    countryNames,
    sectorNames,
  ]);

  const nullRows = React.useMemo(
    () =>
      summaryRows.flatMap((row) =>
        Object.entries(row.null_counts ?? {})
          .filter(([, count]) => (count ?? 0) > 0)
          .map(([column, count]) => ({
            dataset: row.dataset,
            dataset_label: DATASET_LABELS[row.dataset] ?? row.dataset,
            column,
            null_count: count ?? 0,
          })),
      ),
    [summaryRows],
  );

  const sourceRows = sources.length
    ? sources
    : [
        {
          id: "world_bank_wdi",
          name: "World Bank — World Development Indicators",
          url: "https://data.worldbank.org/",
          license: "CC BY 4.0",
          retrieved_at: projectMeta?.generated_at,
          used_for: ["country context", "sector proxies", "living cost"],
        },
        {
          id: "ilostat",
          name: "ILOSTAT — International Labour Organization",
          url: "https://ilostat.ilo.org/",
          license: "ILO open data",
          retrieved_at: projectMeta?.generated_at,
          used_for: ["employment", "earnings"],
        },
      ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Section 08 · Data quality & methodology"
        title="Evidence, provenance and limits"
        description="This build is designed to make missingness and model uncertainty visible. Every dataset retains its source URL, units, classification and transformation notes; unavailable concepts are labelled rather than filled."
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{sourceRows.length} source systems</Badge>
            <Badge variant="outline">{projectMeta?.datasets?.filter((dataset) => dataset.available).length ?? 6} datasets</Badge>
            <Badge variant="success">No zero-filling</Badge>
            <Badge variant="warning">Documented proxies</Badge>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        {sourceRows.map((source) => (
          <Card key={source.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">Official source</div>
                  <CardTitle className="mt-1 text-[15px]">{source.name}</CardTitle>
                </div>
                <Badge variant="success">Licensed</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs">
              <p className="leading-relaxed text-muted">
                {source.license ?? "Open data licence"}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                <a href={source.url} target="_blank" rel="noreferrer" className="source-link">
                  {source.url}
                </a>
                {source.retrieved_at ? (
                  <span>
                    Retrieved{" "}
                    {new Date(source.retrieved_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ) : null}
              </div>
              {source.used_for?.length ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {source.used_for.map((use) => (
                    <Badge key={use} variant="outline" className="normal-case tracking-normal">
                      {use}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>

      <SectionHeading
        eyebrow="Pipeline"
        title="From official API to processed research tables"
        description="The pipeline is deterministic and local. Raw source responses are cached, processed tables are written to Parquet and CSV, and forecasts are generated in a separate step that never writes into historical files."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Raw inputs</TableHead>
                  <TableHead>Transformation</TableHead>
                  <TableHead>Output</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineageRows.map((row) => (
                  <TableRow key={row.dataset}>
                    <TableCell className="whitespace-nowrap font-mono text-[11px]">
                      {row.dataset}
                    </TableCell>
                    <TableCell className="text-xs">{row.source}</TableCell>
                    <TableCell className="max-w-[220px] font-mono text-[10px] leading-relaxed text-muted">
                      {row.raw_files}
                    </TableCell>
                    <TableCell className="max-w-[420px] text-xs leading-relaxed text-muted">
                      {row.transformation}
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">{row.output}</TableCell>
                  </TableRow>
                ))}
                {!lineageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted">
                      Lineage is unavailable. Check that the backend is running.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          eyebrow="Coverage"
          title="Country–sector indicator coverage"
          description="Share of expected cells observed for the indicators mapped to each sector. Expected cells = available indicators × 15 annual years."
          option={heatmapOption({
            xLabels: countrySectorHeatmap.xLabels,
            yLabels: countrySectorHeatmap.yLabels,
            data: countrySectorHeatmap.data,
            min: 0,
            max: 100,
            valueLabel: "%",
          })}
          height={330}
          source={{
            name: "Computed from processed World Bank series",
            note: "Darker is denser evidence, not stronger sector performance.",
          }}
          csvRows={countrySectorHeatmap.data.map(([x, y, value]) => ({
            country: countrySectorHeatmap.yLabels[y],
            sector: countrySectorHeatmap.xLabels[x],
            coverage_pct: value,
          }))}
          csvFilename="methodology-country-sector-coverage"
          isLoading={coverageQuery.isLoading}
          error={coverageQuery.error}
          isEmpty={!countrySectorCells.length}
          onRetry={() => void coverageQuery.refetch()}
        />

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Employment evidence"
          title="Section-level observation counts"
          description="Number of country–sector employment rows in the section-level mapping. Canada’s shorter ISIC Rev.3 history is visible as lower counts."
          option={heatmapOption({
            xLabels: employmentHeatmap.xLabels,
            yLabels: employmentHeatmap.yLabels,
            data: employmentHeatmap.data,
            min: 0,
            max: employmentHeatmap.max,
            valueLabel: " obs",
            colorRange: ["#F3EFE6", "#D7C9AA", "#A9661B"],
          })}
          height={330}
          source={{
            name: "Computed from ILOSTAT employment table",
            note: "Counts, not employment levels; section grain only.",
          }}
          csvRows={employmentHeatmap.data.map(([x, y, value]) => ({
            country: employmentHeatmap.yLabels[y],
            sector: employmentHeatmap.xLabels[x],
            observations: value,
          }))}
          csvFilename="methodology-employment-observation-counts"
          isLoading={coverageQuery.isLoading}
          error={coverageQuery.error}
          isEmpty={!employmentCells.length}
          onRetry={() => void coverageQuery.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Inventory"
        title="Processed datasets and their size"
        description="Row counts and null counts are computed from the Parquet files at request time. The forecast table is separate from every historical dataset."
      />

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px]">Dataset inventory</CardTitle>
              <Badge variant="outline">Parquet + CSV</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Columns</TableHead>
                  <TableHead className="text-right">File size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.dataset}>
                    <TableCell className="text-xs font-medium">
                      {DATASET_LABELS[row.dataset] ?? row.dataset}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatNumber(row.rows, { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.columns ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatBytes(row.file_bytes)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.available ? "success" : "danger"}>
                        {row.available ? "Available" : "Missing"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ChartCard
          className="lg:col-span-5"
          eyebrow="Null audit"
          title="Missing values in key fields"
          description="Counts of nulls in fields that are intentionally empty or partially populated. A missing count is a finding, not a value to fill."
          option={barOption({
            categories: nullRows.slice(0, 12).map((row) => `${row.dataset_label} · ${row.column}`),
            series: [
              {
                name: "Null rows",
                values: nullRows.slice(0, 12).map((row) => row.null_count),
                color: "#A63D57",
              },
            ],
            horizontal: true,
            valueFormatter: (value) => `${formatNumber(value, { maximumFractionDigits: 0 })} rows`,
          })}
          height={340}
          source={{
            name: "Computed from processed Parquet files",
            note: "Top 12 key fields with at least one null.",
          }}
          csvRows={nullRows}
          csvFilename="methodology-null-audit"
          isLoading={summaryQuery.isLoading}
          error={summaryQuery.error}
          isEmpty={!nullRows.length}
          onRetry={() => void summaryQuery.refetch()}
        />
      </section>

      <SectionHeading
        eyebrow="Missingness register"
        title="What is absent, and how it is treated"
        description="Every known gap is registered with its scope and treatment. None of these fields is replaced with zero, an average, or an undocumented estimate."
      />

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Treatment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missing.map((item, index) => (
                  <TableRow key={`${item.dataset}-${item.scope}-${index}`}>
                    <TableCell className="whitespace-nowrap font-mono text-[10px]">
                      {item.dataset}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{item.scope}</TableCell>
                    <TableCell className="max-w-[360px] text-xs leading-relaxed text-muted">
                      {item.issue}
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs leading-relaxed text-muted">
                      {item.treatment}
                    </TableCell>
                  </TableRow>
                ))}
                {!missing.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted">
                      The missing-data register is unavailable.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader className="pb-3">
            <div className="eyebrow">Definitions</div>
            <CardTitle className="text-[15px]">Terms that change the answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-[13px] leading-6 text-muted">
            <Definition
              term="Nominal vs real"
              detail="Nominal values are current prices. Real values are deflated with a national CPI base (2010 = 100). Real comparisons remove inflation within a country, not differences in price levels between countries."
            />
            <Definition
              term="Gross vs net"
              detail="Earnings are gross monthly values from ILOSTAT. Taxes and social contributions are not deducted. No net series is constructed."
            />
            <Definition
              term="PPP vs market exchange rate"
              detail="PPP-adjusted earnings divide local-currency earnings by the World Bank private-consumption PPP conversion factor. No market exchange rate conversion is used."
            />
            <Definition
              term="Announced vs realized investment"
              detail="Neither concept is available in the free official sources used. The columns exist in the schema but are empty; they are not approximated by capital formation or FDI."
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader className="pb-3">
            <div className="eyebrow">Reproducibility</div>
            <CardTitle className="text-[15px]">How to rebuild this workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-[13px] leading-6 text-muted">
            <div className="rounded-sm border border-line bg-paper-deep/50 p-3 font-mono text-[11px] leading-6 text-ink/80">
              <div>backend/scripts/ingest.py</div>
              <div>backend/scripts/forecast.py</div>
              <div>uvicorn app.main:app --port 8000</div>
              <div>npm run dev</div>
            </div>
            <p>
              Raw API responses are cached in <span className="font-mono text-[11px]">backend/data/raw</span>.
              Processed tables and metadata are written to{" "}
              <span className="font-mono text-[11px]">backend/data/processed</span>. The frontend reads the
              local FastAPI service; no paid API key or external database is required.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">Python 3.12+</Badge>
              <Badge variant="outline">FastAPI</Badge>
              <Badge variant="outline">DuckDB + Parquet</Badge>
              <Badge variant="outline">Next.js + ECharts</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MethodCard
          icon={<Database className="h-4 w-4" />}
          title="Observed data"
          body="World Bank and ILOSTAT series are served as reported. Gaps are kept as nulls. No interpolation, zero-filling or synthetic series is used."
        />
        <MethodCard
          icon={<GitBranch className="h-4 w-4" />}
          title="Proxies"
          body="Sector indicators and employment mappings are documented proxies. The proxy flag, note, industry code and classification are retained on every row."
        />
        <MethodCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Forecasts"
          body="ETS damped trend with holdout backtests and 80% residual intervals. Forecasts are stored separately and never overwrite observations."
        />
      </section>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Known limits that matter for interpretation</AlertTitle>
        <AlertDescription className="space-y-1.5">
          <p>
            Sector mappings are not a harmonised industrial census. Canada’s employment and earnings
            use older classifications and shorter histories. Japan has no occupation-level earnings
            series here. City-level living costs, vacancy counts, announced/realized investment and
            capacity additions are unavailable.
          </p>
          <p>
            Forecasts are simple trend extrapolations, not scenarios. They should not be used for
            causal claims, policy evaluation or precise workforce planning without additional evidence.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function Definition({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink">{term}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function MethodCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 pt-5">
        <span className="mt-0.5 text-teal">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
