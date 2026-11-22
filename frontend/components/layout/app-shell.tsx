"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Database } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useMeta } from "@/components/providers/meta-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { meta } = useMeta();
  const generated = meta?.generated_at
    ? new Date(meta.generated_at).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "unavailable";

  return (
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="lg:pl-[268px]">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1480px] border-t border-line px-4 py-6 text-[11px] text-muted sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl space-y-1.5">
              <p className="font-medium text-ink/80">
                Beyond Borders — Global Employment Opportunities and Sector Development Intelligence
              </p>
              <p className="leading-relaxed">
                A local research build. Historical observations are shown only where an official source
                reports them; model-generated forecasts are separated, labelled and interval-bounded.
                No synthetic observations or zero-filled series are used.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Database className="h-3 w-3" />
                Data build: {generated}
              </span>
              <Link href="/methodology" className="source-link inline-flex items-center gap-1">
                Methodology
              </Link>
              <a
                href="https://data.worldbank.org/"
                target="_blank"
                rel="noreferrer"
                className="source-link inline-flex items-center gap-1"
              >
                World Bank <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <a
                href="https://ilostat.ilo.org/"
                target="_blank"
                rel="noreferrer"
                className="source-link inline-flex items-center gap-1"
              >
                ILOSTAT <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
