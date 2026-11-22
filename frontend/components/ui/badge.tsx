import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-paper",
        secondary: "border-transparent bg-paper-deep text-ink",
        outline: "border-line-strong text-muted",
        accent: "border-transparent bg-teal-soft text-teal",
        success: "border-transparent bg-teal-soft text-teal",
        warning: "border-transparent bg-amber-soft text-amber",
        danger: "border-transparent bg-[#F5E0E4] text-research-rose",
        violet: "border-transparent bg-[#ECE6F3] text-research-violet",
        blue: "border-transparent bg-[#E1E9F5] text-research-blue",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
