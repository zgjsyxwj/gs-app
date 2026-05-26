import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-md border border-rule bg-card shadow-card", className)} {...rest} />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-b border-rule bg-[#FBF9F3] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-50",
        className
      )}
      {...rest}
    />
  );
}
