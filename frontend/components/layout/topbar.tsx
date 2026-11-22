"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Menu, ShieldCheck } from "lucide-react";
import { GlobalFilters } from "@/components/layout/global-filters";
import { useMeta } from "@/components/providers/meta-provider";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/format";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { meta, error } = useMeta();
  const current = NAV_ITEMS.find((item) => item.href === pathname);
  const healthy = !error && Boolean(meta);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onMenu}
            className="rounded-sm border border-line-strong bg-surface p-1.5 text-ink lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
            <Link href="/" className="transition-colors hover:text-ink">
              Beyond Borders
            </Link>
            <span className="text-line-strong">/</span>
            <span className="font-medium text-ink">{current?.label ?? "Research"}</span>
          </div>
          <div className="sm:hidden">
            <span className="text-xs font-medium text-ink">{current?.short ?? "Research"}</span>
          </div>
        </div>
        <div className="order-3 flex w-full items-center justify-between gap-2 sm:order-none sm:w-auto sm:justify-end">
          <GlobalFilters compact />
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] xl:flex",
              healthy
                ? "border-[#C3DDD8] bg-teal-soft/60 text-teal"
                : "border-[#E7D3B3] bg-amber-soft text-amber",
            )}
          >
            {healthy ? <Activity className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {healthy ? "API connected" : "API offline"}
          </div>
        </div>
      </div>
    </header>
  );
}
