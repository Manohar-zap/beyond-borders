import * as React from "react";
import { cn } from "@/lib/format";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("border-b border-line pb-7", className)}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-4xl space-y-3">
          <div className="eyebrow flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal" />
            {eyebrow}
          </div>
          <h1 className="display-title">{title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-5">{meta}</div> : null}
    </header>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="space-y-1.5">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h2 className="section-title">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-[13px] leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
