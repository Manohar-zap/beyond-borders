import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/format";

type Tone = "default" | "teal" | "blue" | "amber" | "violet" | "rose";

const TONES: Record<Tone, { bar: string; value: string; icon: string }> = {
  default: { bar: "bg-ink/70", value: "text-ink", icon: "text-ink/60" },
  teal: { bar: "bg-teal", value: "text-teal", icon: "text-teal" },
  blue: { bar: "bg-research-blue", value: "text-research-blue", icon: "text-research-blue" },
  amber: { bar: "bg-amber", value: "text-amber", icon: "text-amber" },
  violet: { bar: "bg-research-violet", value: "text-research-violet", icon: "text-research-violet" },
  rose: { bar: "bg-research-rose", value: "text-research-rose", icon: "text-research-rose" },
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  unavailable?: boolean;
}

export function KpiCard({
  label,
  value,
  unit,
  hint,
  delta,
  deltaLabel,
  tone = "default",
  icon,
  unavailable = false,
}: KpiCardProps) {
  const palette = TONES[tone];
  const DeltaIcon = delta === null || delta === undefined ? Minus : delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", palette.bar)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.09em] text-muted">
          {label}
        </p>
        {icon ? <span className={cn("shrink-0", palette.icon)}>{icon}</span> : null}
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={cn(
            "font-mono text-[1.65rem] font-medium leading-none tracking-[-0.04em]",
            unavailable ? "text-muted" : palette.value,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-[11px] font-medium text-muted">{unit}</span> : null}
      </div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[11px] font-medium",
              delta === null ? "text-muted" : delta >= 0 ? "text-teal" : "text-research-rose",
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {delta === null ? "n/a" : `${Math.abs(delta).toFixed(1)}%`}
          </span>
        ) : null}
        {deltaLabel ? <span className="text-[11px] text-muted">{deltaLabel}</span> : null}
        {hint ? <span className="text-[11px] leading-snug text-muted">{hint}</span> : null}
      </div>
    </Card>
  );
}
