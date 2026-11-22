import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  const url = `${API_BASE}${path}${buildQuery(params)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") detail = payload.detail;
      else if (payload?.detail) detail = JSON.stringify(payload.detail);
    } catch {
      // Keep the status-based message.
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export function useApi<T>(
  key: readonly unknown[],
  path: string,
  params?: QueryParams,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => apiGet<T>(path, params),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
    ...options,
  });
}

export function exportUrl(dataset: string, params?: QueryParams): string {
  return `${API_BASE}/api/export/${dataset}.csv${buildQuery(params)}`;
}
