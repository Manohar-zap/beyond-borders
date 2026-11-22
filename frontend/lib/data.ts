export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function groupRows<T>(rows: T[], key: (row: T) => string): Record<string, T[]> {
  return rows.reduce(
    (acc, row) => {
      const group = key(row);
      (acc[group] ??= []).push(row);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function uniqueValues<T>(rows: T[], key: (row: T) => string | null | undefined): string[] {
  return Array.from(
    new Set(
      rows
        .map(key)
        .filter((value): value is string => Boolean(value && String(value).trim())),
    ),
  ).sort();
}

export function sumBy<T>(rows: T[], key: (row: T) => unknown): number | null {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const value = toNumber(key(row));
    if (value === null) continue;
    total += value;
    count += 1;
  }
  return count ? total : null;
}

export function averageBy<T>(rows: T[], key: (row: T) => unknown): number | null {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const value = toNumber(key(row));
    if (value === null) continue;
    total += value;
    count += 1;
  }
  return count ? total / count : null;
}

export function latestRows<T>(
  rows: T[],
  options: {
    time: (row: T) => number;
    group: (row: T) => string;
    value?: (row: T) => unknown;
  },
): T[] {
  const groups = groupRows(rows, options.group);
  return Object.values(groups)
    .map((group) => {
      const sorted = [...group].sort((a, b) => options.time(b) - options.time(a));
      if (options.value) {
        const withValue = sorted.find((row) => toNumber(options.value?.(row)) !== null);
        return withValue ?? sorted[0];
      }
      return sorted[0];
    })
    .filter(Boolean);
}

export function pctChange(first: number | null, last: number | null): number | null {
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

export function cagr(first: number | null, last: number | null, years: number): number | null {
  if (first === null || last === null || first <= 0 || last <= 0 || years <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function isForecastStatus(status?: string | null): boolean {
  return status === "validated" || status === "moderate_error" || status === "high_error";
}
