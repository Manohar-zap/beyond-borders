import type { EChartsOption, SeriesOption } from "echarts";

export const CHART_COLORS = [
  "#2457A6",
  "#0E6B62",
  "#A9661B",
  "#6B4C9A",
  "#A63D57",
  "#5B6B7C",
];

export const SECTOR_COLORS: Record<string, string> = {
  semiconductors: "#2457A6",
  ai_software: "#0E6B62",
  renewable_energy: "#A9661B",
  automotive_ev: "#6B4C9A",
  healthcare_biotech: "#A63D57",
};

export const COUNTRY_COLORS: Record<string, string> = {
  IND: "#A9661B",
  DEU: "#2457A6",
  CAN: "#A63D57",
  USA: "#0E6B62",
  GBR: "#6B4C9A",
  JPN: "#5B6B7C",
};

export const INK = "#101720";
export const MUTED = "#6D6A61";
export const LINE = "#DED8CB";
export const PAPER = "#FFFFFF";

export const AXIS_LABEL = {
  color: MUTED,
  fontSize: 11,
  fontFamily: "var(--font-sans)",
};

export const SPLIT_LINE = {
  lineStyle: { color: "#E9E4D9", type: "dashed" as const, width: 1 },
};

export const TOOLTIP_STYLE = {
  backgroundColor: "#101720",
  borderWidth: 0,
  padding: [10, 12] as [number, number],
  textStyle: { color: "#F5F2EB", fontSize: 12, fontFamily: "var(--font-sans)" },
  extraCssText: "border-radius: 6px; box-shadow: 0 18px 50px -20px rgba(16,23,32,0.45);",
};

export function baseOption(): EChartsOption {
  return {
    animationDuration: 450,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: "var(--font-sans)", color: INK },
    grid: { left: 18, right: 26, top: 34, bottom: 42, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: MUTED, fontSize: 11 },
    },
    tooltip: {
      trigger: "axis",
      ...TOOLTIP_STYLE,
      axisPointer: { type: "line", lineStyle: { color: "#B9B1A2", width: 1 } },
    },
  };
}

export interface SeriesPoint {
  year: number;
  value: number | null;
}

export interface BandPoint {
  year: number;
  lower: number;
  upper: number;
}

export interface TimeSeries {
  name: string;
  points: SeriesPoint[];
  color?: string;
  dashed?: boolean;
  dashedFromYear?: number;
  area?: boolean;
}

export function timeSeriesOption({
  series,
  bands = [],
  xMin,
  xMax,
  yName,
  valueFormatter,
  showLegend = true,
  zoom = false,
  markLine,
  extraOptions,
}: {
  series: TimeSeries[];
  bands?: { name: string; points: BandPoint[]; color: string }[];
  xMin: number;
  xMax: number;
  yName?: string;
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  zoom?: boolean;
  markLine?: { year: number; label?: string };
  extraOptions?: EChartsOption;
}): EChartsOption {
  const option = baseOption();
  const lineSeries: SeriesOption[] = series.map((item, index) => {
    const color = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
    return {
      name: item.name,
      type: "line",
      data: item.points.map((point) => [point.year, point.value]),
      showSymbol: false,
      symbol: "circle",
      symbolSize: 6,
      connectNulls: false,
      smooth: false,
      lineStyle: {
        width: 2,
        color,
        type: item.dashed ? "dashed" : "solid",
      },
      itemStyle: { color },
      areaStyle: item.area
        ? { color, opacity: 0.08, origin: "start" }
        : undefined,
      emphasis: { focus: "series", lineStyle: { width: 2.5 } },
      markLine:
        index === 0 && markLine
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: "#6D6A61", type: "dashed", width: 1 },
              label: {
                show: true,
                position: "insideEndTop",
                formatter: markLine.label ?? "Forecast",
                color: "#6D6A61",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              },
              data: [{ xAxis: markLine.year }],
            }
          : undefined,
      z: item.dashed ? 3 : 4,
    };
  });

  const bandSeries = bands.map((band) => ({
    name: band.name,
    type: "custom" as const,
    data: band.points.map((point) => [point.year, point.lower, point.upper]),
    renderItem: (_params: unknown, api: any) => {
      const points: number[][] = [];
      band.points.forEach((point) => points.push(api.coord([point.year, point.upper])));
      [...band.points].reverse().forEach((point) => points.push(api.coord([point.year, point.lower])));
      return {
        type: "polygon",
        shape: { points },
        style: { fill: `${band.color}20`, stroke: "transparent" },
      };
    },
    silent: true,
    tooltip: { show: false },
    z: 1,
  })) as unknown as SeriesOption[];

  return {
    ...option,
    ...extraOptions,
    legend: {
      ...(option.legend as object),
      show: showLegend,
    },
    tooltip: {
      ...(option.tooltip as object),
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const visible = list.filter((entry: any) => entry.seriesType !== "custom" && entry.value != null);
        if (!visible.length) return "";
        const year = visible[0].value?.[0] ?? visible[0].axisValue;
        const rows = visible
          .map((entry: any) => {
            const raw = Array.isArray(entry.value) ? entry.value[1] : entry.value;
            const value =
              raw === null || raw === undefined || Number.isNaN(Number(raw))
                ? "Unavailable"
                : valueFormatter
                  ? valueFormatter(Number(raw))
                  : Number(raw).toLocaleString("en-US", { maximumFractionDigits: 2 });
            return `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px">
              <span style="color:#CFC8BA">${entry.marker ?? ""}${entry.seriesName}</span>
              <span style="font-family:var(--font-mono);font-weight:600">${value}</span>
            </div>`;
          })
          .join("");
        return `<div style="min-width:190px"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;color:#A9A294">${year}</div>${rows}</div>`;
      },
    },
    xAxis: {
      type: "value",
      min: xMin,
      max: xMax,
      interval: xMax - xMin > 12 ? 2 : 1,
      axisLine: { lineStyle: { color: LINE } },
      axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, formatter: (value: number) => String(Math.round(value)) },
      splitLine: { show: false },
      name: "Year",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: MUTED, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...AXIS_LABEL,
        formatter: (value: number) => compactAxis(value),
      },
      splitLine: SPLIT_LINE,
      name: yName,
      nameTextStyle: { color: MUTED, fontSize: 10, align: "left" },
      nameGap: 18,
      scale: true,
    },
    dataZoom: zoom
      ? [
          { type: "inside", filterMode: "none" },
          { type: "slider", height: 16, bottom: 6, borderColor: LINE, fillerColor: "#0E6B6215", handleStyle: { color: "#0E6B62" } },
        ]
      : undefined,
    series: [...bandSeries, ...lineSeries],
  };
}

export function barOption({
  categories,
  series,
  horizontal = false,
  valueFormatter,
  yName,
  showLegend = true,
  extraOptions,
}: {
  categories: string[];
  series: { name: string; values: (number | null)[]; color?: string; stack?: string }[];
  horizontal?: boolean;
  valueFormatter?: (value: number) => string;
  yName?: string;
  showLegend?: boolean;
  extraOptions?: EChartsOption;
}): EChartsOption {
  const option = baseOption();
  const barSeries: SeriesOption[] = series.map((item, index) => ({
    name: item.name,
    type: "bar",
    data: item.values,
    stack: item.stack,
    barMaxWidth: 28,
    itemStyle: {
      color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
      borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
    },
    emphasis: { itemStyle: { opacity: 0.85 } },
  }));

  const categoryAxis = {
    type: "category" as const,
    data: categories,
    axisLine: { lineStyle: { color: LINE } },
    axisTick: { show: false },
    axisLabel: { ...AXIS_LABEL, interval: 0, width: 150, overflow: "truncate" as const },
  };
  const valueAxis = {
    type: "value" as const,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { ...AXIS_LABEL, formatter: (value: number) => compactAxis(value) },
    splitLine: SPLIT_LINE,
    name: yName,
    nameTextStyle: { color: MUTED, fontSize: 10 },
    scale: true,
  };

  return {
    ...option,
    ...extraOptions,
    legend: { ...(option.legend as object), show: showLegend },
    tooltip: {
      ...(option.tooltip as object),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        if (!list.length) return "";
        const rows = list
          .map((entry: any) => {
            const value =
              entry.value === null || entry.value === undefined
                ? "Unavailable"
                : valueFormatter
                  ? valueFormatter(Number(entry.value))
                  : Number(entry.value).toLocaleString("en-US", { maximumFractionDigits: 2 });
            return `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px">
              <span style="color:#CFC8BA">${entry.marker ?? ""}${entry.seriesName}</span>
              <span style="font-family:var(--font-mono);font-weight:600">${value}</span>
            </div>`;
          })
          .join("");
        return `<div style="min-width:170px"><div style="font-family:var(--font-mono);font-size:11px;color:#A9A294">${list[0].axisValueLabel ?? list[0].name}</div>${rows}</div>`;
      },
    },
    grid: {
      ...(option.grid as object),
      left: horizontal ? 10 : 18,
      right: horizontal ? 34 : 20,
      top: showLegend ? 36 : 16,
      bottom: horizontal ? 18 : 46,
      containLabel: true,
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: barSeries,
  };
}

export function heatmapOption({
  xLabels,
  yLabels,
  data,
  min = 0,
  max = 100,
  valueLabel = "%",
  colorRange = ["#F3EFE6", "#BFD8D2", "#0E6B62"],
  extraOptions,
}: {
  xLabels: string[];
  yLabels: string[];
  data: [number, number, number | null][];
  min?: number;
  max?: number;
  valueLabel?: string;
  colorRange?: string[];
  extraOptions?: EChartsOption;
}): EChartsOption {
  return {
    ...baseOption(),
    ...extraOptions,
    grid: { left: 18, right: 24, top: 12, bottom: 52, containLabel: true },
    tooltip: {
      ...TOOLTIP_STYLE,
      formatter: (params: any) => {
        const value = params.value?.[2];
        return `<div style="font-size:12px">${yLabels[params.value?.[1]] ?? ""} · ${xLabels[params.value?.[0]] ?? ""}</div>
          <div style="font-family:var(--font-mono);margin-top:4px;font-weight:600">${value === null || value === undefined ? "Unavailable" : `${Number(value).toFixed(1)}${valueLabel}`}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: xLabels,
      axisLine: { lineStyle: { color: LINE } },
      axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, interval: 0, rotate: xLabels.length > 6 ? 24 : 0 },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: yLabels,
      axisLine: { lineStyle: { color: LINE } },
      axisTick: { show: false },
      axisLabel: { ...AXIS_LABEL, interval: 0 },
      splitArea: { show: false },
    },
    visualMap: {
      min,
      max,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 12,
      itemHeight: 80,
      textStyle: { color: MUTED, fontSize: 10 },
      inRange: { color: colorRange },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          fontSize: 10,
          color: INK,
          formatter: (params: any) => {
            const value = params.value?.[2];
            return value === null || value === undefined ? "—" : `${Number(value).toFixed(0)}`;
          },
        },
        itemStyle: { borderColor: "#F5F2EB", borderWidth: 3, borderRadius: 3 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(16,23,32,0.2)" } },
      },
    ],
  };
}

export function compactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Number(value.toFixed(2))}`;
}

export function statusColor(status: string): string {
  if (status === "validated") return "#0E6B62";
  if (status === "moderate_error") return "#A9661B";
  return "#A63D57";
}

export function statusLabel(status: string): string {
  if (status === "validated") return "Validated";
  if (status === "moderate_error") return "Moderate error";
  if (status === "high_error") return "High error";
  return status;
}
