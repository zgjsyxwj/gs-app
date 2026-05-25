import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center rounded-md text-[12.5px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:   "bg-accent text-white hover:bg-accent/90",
        secondary: "border border-ink-10 bg-white text-ink hover:bg-black/[0.03]",
        ghost:     "text-ink-70 hover:bg-black/[0.04]",
        danger:    "bg-err text-white hover:bg-err/90"
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-8 px-3.5",
        lg: "h-9 px-4"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...rest }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...rest} />
  )
);
Button.displayName = "Button";
