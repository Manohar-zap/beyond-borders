"use client";

import * as React from "react";
import type { EChartsOption } from "echarts";
import { AlertTriangle, Download, FileDown, ImageDown, Info, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart, type EChartHandle } from "@/components/charts/echart";
import { downloadCsv, downloadDataUrl, slugify } from "@/lib/format";
import { cn } from "@/lib/format";

export interface ChartSource {
  name: string;
  url?: string;
  note?: string;
}

interface ChartCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  option?: EChartsOption;
  height?: number;
  source?: ChartSource;
  csvRows?: Record<string, unknown>[];
  csvFilename?: string;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  footnote?: React.ReactNode;
  toolbar?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  chartClassName?: string;
}

export function ChartCard({
  title,
  description,
  eyebrow,
  option,
  height = 330,
  source,
  csvRows,
  csvFilename,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No observations are available for the current filters.",
  onRetry,
  footnote,
  toolbar,
  badge,
  className,
  chartClassName,
}: ChartCardProps) {
  const chartRef = React.useRef<EChartHandle | null>(null);
  const hasRows = Boolean(csvRows && csvRows.length > 0);

  const handlePng = () => {
    const dataUrl = chartRef.current?.getDataUrl();
    if (!dataUrl) return;
    downloadDataUrl(`${slugify(csvFilename ?? title)}.png`, dataUrl);
  };

  const handleCsv = () => {
    if (!csvRows?.length) return;
    downloadCsv(`${slugify(csvFilename ?? title)}.csv`, csvRows);
  };

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="gap-2 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <CardTitle className="text-[15px]">{title}</CardTitle>
            {description ? (
              <CardDescription className="max-w-3xl text-[13px]">{description}</CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {badge}
            {toolbar}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-2xs"
              onClick={handleCsv}
              disabled={!hasRows || isLoading || Boolean(error)}
              title="Download the chart data as CSV"
            >
              <FileDown className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-2xs"
              onClick={handlePng}
              disabled={!option || isLoading || Boolean(error) || isEmpty}
              title="Download the rendered chart as PNG"
            >
              <ImageDown className="h-3.5 w-3.5" />
              PNG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-4">
        <div className="relative flex-1">
          {isLoading ? (
            <ChartSkeleton height={height} />
          ) : error ? (
            <ErrorState error={error} onRetry={onRetry} height={height} />
          ) : isEmpty || !option ? (
            <NoDataState message={emptyMessage} height={height} />
          ) : (
            <EChart
              ref={chartRef}
              option={option}
              height={height}
              className={chartClassName}
              ariaLabel={title}
            />
          )}
        </div>
        {footnote ? (
          <div className="mt-3 border-t border-line/70 pt-3 text-xs leading-relaxed text-muted">
            {footnote}
          </div>
        ) : null}
        {source ? (
          <div className="mt-3 flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
            <span className="font-mono uppercase tracking-[0.1em] text-muted/80">Source</span>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="source-link font-medium text-ink/80"
              >
                {source.name}
              </a>
            ) : (
              <span className="font-medium text-ink/80">{source.name}</span>
            )}
            {source.note ? <span className="text-muted">{source.note}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col justify-end gap-2 px-2 pb-6" style={{ height }}>
      <div className="flex flex-1 items-end gap-2">
        {[42, 68, 54, 80, 62, 90, 72, 58, 76, 64, 84, 56].map((value, index) => (
          <Skeleton
            key={index}
            className="flex-1 rounded-sm"
            style={{ height: `${value}%`, animationDelay: `${index * 45}ms` }}
          />
        ))}
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="flex justify-between">
        <Skeleton className="h-2 w-8" />
        <Skeleton className="h-2 w-8" />
        <Skeleton className="h-2 w-8" />
        <Skeleton className="h-2 w-8" />
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  height,
}: {
  error: Error;
  onRetry?: () => void;
  height: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[#E4C2C9] bg-[#FBF3F4] px-6 text-center"
      style={{ minHeight: height }}
    >
      <AlertTriangle className="h-5 w-5 text-research-rose" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#7A2638]">This view could not be loaded</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-[#7A2638]/80">
          {error.message}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function NoDataState({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong bg-paper-deep/40 px-6 text-center"
      style={{ minHeight: height }}
    >
      <Info className="h-5 w-5 text-muted" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">No data for this selection</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted">{message}</p>
      </div>
    </div>
  );
}

export function ChartFootnote({ children }: { children: React.ReactNode }) {
  return <span>{children}</span>;
}

export { Download };
