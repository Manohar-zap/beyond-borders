import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/app-shell";
import { FilterProvider } from "@/components/providers/filters-provider";
import { MetaProvider } from "@/components/providers/meta-provider";

export const metadata: Metadata = {
  title: {
    default: "Beyond Borders — Global Employment & Sector Intelligence",
    template: "%s · Beyond Borders",
  },
  description:
    "Research-grade dashboard of employment, sector development, earnings and living costs across India, Germany, Canada, the United States, the United Kingdom and Japan, 2010–2024, with validated forecasts to 2030.",
  applicationName: "Beyond Borders",
  authors: [{ name: "Beyond Borders research build" }],
  keywords: [
    "employment",
    "sector development",
    "salary",
    "living cost",
    "forecasting",
    "World Bank",
    "ILOSTAT",
  ],
};

export const viewport: Viewport = {
  themeColor: "#101720",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-paper font-mono text-xs uppercase tracking-[0.18em] text-muted">
                Loading research workspace…
              </div>
            }
          >
            <FilterProvider>
              <MetaProvider>
                <AppShell>{children}</AppShell>
              </MetaProvider>
            </FilterProvider>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
