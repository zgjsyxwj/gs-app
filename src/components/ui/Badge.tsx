import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[10.5px]",
  {
    variants: {
      tone: {
        neutral: "border-rule bg-white text-ink-70",
        accent: "border-accent/30 bg-accent-soft text-accent",
        warn: "border-warn/30 bg-warn-soft text-warn",
        err: "border-err/30 bg-err/10 text-err",
        ok: "border-accent/30 bg-accent-soft text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className,
  tone,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return (
    <span className={cn(badge({ tone }), className)} {...rest}>
      {children}
    </span>
  );
}
