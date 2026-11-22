"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Banknote,
  BookOpenCheck,
  Database,
  Globe2,
  House,
  LayoutDashboard,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useMeta } from "@/components/providers/meta-provider";
import { API_BASE } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/format";

const ICONS = {
  LayoutDashboard,
  Globe2,
  BarChart3,
  Users,
  Banknote,
  House,
  TrendingUp,
  ShieldCheck,
} as const;

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { meta } = useMeta();
  const sourceCount = meta?.sources?.length ?? 2;
  const generated = meta?.generated_at
    ? new Date(meta.generated_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col bg-ink text-paper transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
          <Link href="/" className="group flex items-start gap-3" onClick={onClose}>
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-teal/60 bg-teal/15 font-display text-lg leading-none text-[#9AD8CE]">
              B
            </span>
            <span>
              <span className="block font-display text-[1.25rem] leading-none tracking-[-0.01em] text-paper">
                Beyond Borders
              </span>
              <span className="mt-1.5 block font-mono text-[9px] uppercase leading-[1.5] tracking-[0.18em] text-paper/45">
                Employment &amp; sector
                <br />
                intelligence
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-paper/60 transition-colors hover:bg-white/10 hover:text-paper lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-2 pt-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper/35">
            Research sections
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
          {NAV_ITEMS.map((item, index) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "group relative flex items-center gap-3 rounded-sm px-2.5 py-2.5 text-[13px] transition-colors",
                  active
                    ? "bg-white/[0.09] text-paper"
                    : "text-paper/62 hover:bg-white/[0.05] hover:text-paper",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-[2px] rounded-full transition-opacity",
                    active ? "bg-[#6CC4B7]" : "opacity-0",
                  )}
                />
                <span className="w-5 font-mono text-[9px] text-paper/30">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-[#8FD5CB]" : "text-paper/40 group-hover:text-paper/70",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6CC4B7] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6CC4B7]" />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-paper/50">
                Local data build
              </span>
            </div>
            <span className="font-mono text-[9px] text-paper/35">v1.0</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <p className="font-mono text-sm text-paper/85">2010–24</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-paper/35">Observed</p>
            </div>
            <div className="rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <p className="font-mono text-sm text-paper/85">2025–30</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-paper/35">Forecast</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-paper/35">
            <span>{sourceCount} official sources</span>
            <span>{generated}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-paper/45 transition-colors hover:text-paper"
            >
              <BookOpenCheck className="h-3 w-3" />
              API docs
            </a>
            <a
              href={`${API_BASE}/api/export/country_sector.csv`}
              className="inline-flex items-center gap-1 text-[10px] text-paper/45 transition-colors hover:text-paper"
            >
              <Database className="h-3 w-3" />
              Export
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
