"use client";

import * as React from "react";
import type { ECharts, EChartsOption } from "echarts";
import { cn } from "@/lib/format";

export interface EChartHandle {
  getDataUrl: () => string | null;
  resize: () => void;
}

interface EChartProps {
  option: EChartsOption;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Thin ECharts wrapper. The library is imported only in the browser so the
 * dashboard can be server-rendered without touching `window`.
 */
const EChart = React.forwardRef<EChartHandle, EChartProps>(function EChart(
  { option, height = 320, className, ariaLabel },
  ref,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<ECharts | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () => {
        const chart = chartRef.current;
        if (!chart) return null;
        return chart.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
      },
      resize: () => chartRef.current?.resize(),
    }),
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void import("echarts").then((echarts) => {
      if (cancelled || !containerRef.current) return;
      const chart = echarts.init(containerRef.current, undefined, {
        renderer: "canvas",
      });
      chartRef.current = chart;
      chart.setOption(option, true);
      setReady(true);
      observer = new ResizeObserver(() => {
        chart.resize();
      });
      observer.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      setReady(false);
    };
    // The chart instance is created once. Options are applied in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ready || !chartRef.current) return;
    chartRef.current.setOption(option, true);
  }, [option, ready]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  );
});

export { EChart };
