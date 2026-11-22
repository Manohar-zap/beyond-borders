"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_COUNTRIES,
  DEFAULT_FROM,
  DEFAULT_SECTORS,
  DEFAULT_TO,
} from "@/lib/constants";

interface FilterState {
  countries: string[];
  sectors: string[];
  from: number;
  to: number;
}

interface FilterContextValue extends FilterState {
  setCountries: (countries: string[]) => void;
  setSectors: (sectors: string[]) => void;
  setYears: (from: number, to: number) => void;
  toggleCountry: (iso3: string) => void;
  toggleSector: (sectorId: string) => void;
  reset: () => void;
  isFiltered: boolean;
  activeCount: number;
  countryParam: string;
  sectorParam: string;
}

const FilterContext = createContext<FilterContextValue | null>(null);

function parseList(value: string | null, fallback: string[]): string[] {
  if (!value) return fallback;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function parseYear(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(2024, Math.max(2010, Math.round(parsed)));
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const countries = useMemo(
    () => parseList(searchParams.get("countries"), DEFAULT_COUNTRIES),
    [searchParams],
  );
  const sectors = useMemo(
    () => parseList(searchParams.get("sectors"), DEFAULT_SECTORS),
    [searchParams],
  );
  const from = useMemo(
    () => parseYear(searchParams.get("from"), DEFAULT_FROM),
    [searchParams],
  );
  const to = useMemo(() => {
    const value = parseYear(searchParams.get("to"), DEFAULT_TO);
    return Math.max(from, value);
  }, [searchParams, from]);

  const push = useCallback(
    (next: Partial<FilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextCountries = next.countries ?? countries;
      const nextSectors = next.sectors ?? sectors;
      const nextFrom = next.from ?? from;
      const nextTo = next.to ?? to;

      if (nextCountries.length === DEFAULT_COUNTRIES.length) params.delete("countries");
      else params.set("countries", nextCountries.join(","));

      if (nextSectors.length === DEFAULT_SECTORS.length) params.delete("sectors");
      else params.set("sectors", nextSectors.join(","));

      if (nextFrom === DEFAULT_FROM) params.delete("from");
      else params.set("from", String(nextFrom));

      if (nextTo === DEFAULT_TO) params.delete("to");
      else params.set("to", String(nextTo));

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, countries, sectors, from, to],
  );

  const setCountries = useCallback(
    (next: string[]) => {
      if (!next.length) return;
      push({ countries: next });
    },
    [push],
  );

  const setSectors = useCallback(
    (next: string[]) => {
      if (!next.length) return;
      push({ sectors: next });
    },
    [push],
  );

  const setYears = useCallback(
    (nextFrom: number, nextTo: number) => {
      const low = Math.min(nextFrom, nextTo);
      const high = Math.max(nextFrom, nextTo);
      push({ from: low, to: high });
    },
    [push],
  );

  const toggleCountry = useCallback(
    (iso3: string) => {
      const next = countries.includes(iso3)
        ? countries.filter((item) => item !== iso3)
        : [...countries, iso3];
      setCountries(next);
    },
    [countries, setCountries],
  );

  const toggleSector = useCallback(
    (sectorId: string) => {
      const next = sectors.includes(sectorId)
        ? sectors.filter((item) => item !== sectorId)
        : [...sectors, sectorId];
      setSectors(next);
    },
    [sectors, setSectors],
  );

  const reset = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("countries");
    params.delete("sectors");
    params.delete("from");
    params.delete("to");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const isFiltered =
    countries.length !== DEFAULT_COUNTRIES.length ||
    sectors.length !== DEFAULT_SECTORS.length ||
    from !== DEFAULT_FROM ||
    to !== DEFAULT_TO;

  const value: FilterContextValue = {
    countries,
    sectors,
    from,
    to,
    setCountries,
    setSectors,
    setYears,
    toggleCountry,
    toggleSector,
    reset,
    isFiltered,
    activeCount:
      (countries.length !== DEFAULT_COUNTRIES.length ? 1 : 0) +
      (sectors.length !== DEFAULT_SECTORS.length ? 1 : 0) +
      (from !== DEFAULT_FROM || to !== DEFAULT_TO ? 1 : 0),
    countryParam: countries.join(","),
    sectorParam: sectors.join(","),
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) throw new Error("useFilters must be used inside FilterProvider");
  return context;
}
