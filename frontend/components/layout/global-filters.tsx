"use client";

import * as React from "react";
import { Check, ChevronDown, Globe2, Layers3, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilters } from "@/components/providers/filters-provider";
import { useMeta } from "@/components/providers/meta-provider";
import { FALLBACK_COUNTRIES, FALLBACK_SECTORS } from "@/lib/constants";
import { cn } from "@/lib/format";

const YEARS = Array.from({ length: 15 }, (_, index) => 2010 + index);

export function GlobalFilters({ compact = false }: { compact?: boolean }) {
  const {
    countries,
    sectors,
    from,
    to,
    toggleCountry,
    toggleSector,
    setCountries,
    setSectors,
    setYears,
    reset,
    isFiltered,
  } = useFilters();
  const { meta } = useMeta();
  const countryOptions = meta?.countries?.length ? meta.countries : FALLBACK_COUNTRIES;
  const sectorOptions = meta?.sectors?.length ? meta.sectors : FALLBACK_SECTORS;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        compact && "gap-1",
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-surface px-2.5">
            <Globe2 className="h-3.5 w-3.5 text-muted" />
            <span className="hidden sm:inline">Countries</span>
            <span className="font-mono text-2xs text-teal">
              {countries.length}/{countryOptions.length}
            </span>
            <ChevronDown className="h-3 w-3 text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-ink">Countries</p>
              <p className="text-[10px] text-muted">Global comparison set</p>
            </div>
            <button
              type="button"
              className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal hover:underline"
              onClick={() =>
                setCountries(countries.length === countryOptions.length ? [countryOptions[0].iso3] : countryOptions.map((c) => c.iso3))
              }
            >
              {countries.length === countryOptions.length ? "One" : "All"}
            </button>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto p-1.5">
            {countryOptions.map((country) => {
              const checked = countries.includes(country.iso3);
              const disabled = checked && countries.length === 1;
              return (
                <label
                  key={country.iso3}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-paper-deep",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggleCountry(country.iso3)}
                  />
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="font-mono text-[10px] text-muted">{country.iso3}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-surface px-2.5">
            <Layers3 className="h-3.5 w-3.5 text-muted" />
            <span className="hidden sm:inline">Sectors</span>
            <span className="font-mono text-2xs text-teal">
              {sectors.length}/{sectorOptions.length}
            </span>
            <ChevronDown className="h-3 w-3 text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-ink">Sectors</p>
              <p className="text-[10px] text-muted">Sector, employment and forecast views</p>
            </div>
            <button
              type="button"
              className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal hover:underline"
              onClick={() =>
                setSectors(sectors.length === sectorOptions.length ? [sectorOptions[0].id] : sectorOptions.map((s) => s.id))
              }
            >
              {sectors.length === sectorOptions.length ? "One" : "All"}
            </button>
          </div>
          <div className="space-y-0.5 p-1.5">
            {sectorOptions.map((sector) => {
              const checked = sectors.includes(sector.id);
              const disabled = checked && sectors.length === 1;
              return (
                <label
                  key={sector.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-paper-deep",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    className="mt-0.5"
                    onCheckedChange={() => toggleSector(sector.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{sector.name}</span>
                    <span className="block truncate text-[10px] text-muted">{sector.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex h-8 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 shadow-sm">
        <span className="hidden text-[10px] font-medium uppercase tracking-[0.08em] text-muted md:inline">
          Years
        </span>
        <select
          aria-label="Start year"
          value={from}
          onChange={(event) => setYears(Number(event.target.value), Math.max(Number(event.target.value), to))}
          className="h-6 cursor-pointer bg-transparent font-mono text-xs text-ink outline-none"
        >
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <span className="text-muted">–</span>
        <select
          aria-label="End year"
          value={to}
          onChange={(event) => setYears(Math.min(from, Number(event.target.value)), Number(event.target.value))}
          className="h-6 cursor-pointer bg-transparent font-mono text-xs text-ink outline-none"
        >
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {isFiltered ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[11px] text-muted"
          onClick={reset}
          title="Reset all global filters"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

export function FilterSummary() {
  const { countries, sectors, from, to } = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="normal-case tracking-normal">
        {countries.length === 6 ? "All six countries" : `${countries.length} countries`}
      </Badge>
      <Badge variant="outline" className="normal-case tracking-normal">
        {sectors.length === 5 ? "All five sectors" : `${sectors.length} sectors`}
      </Badge>
      <Badge variant="outline" className="normal-case tracking-normal">
        {from}–{to}
      </Badge>
    </div>
  );
}

export function FilterHint() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <SlidersHorizontal className="h-3 w-3" />
      Global filters apply across the dashboard.
    </div>
  );
}

export { Check };
