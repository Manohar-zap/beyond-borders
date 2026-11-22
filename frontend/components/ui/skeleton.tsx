import { cn } from "@/lib/format";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-paper-deep", className)}
      {...props}
    />
  );
}

export { Skeleton };
