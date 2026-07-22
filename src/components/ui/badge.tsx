import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/20 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/20 text-destructive",
        outline: "border border-white/10 text-muted-foreground",
        success: "bg-emerald-500/20 text-emerald-400",
        warning: "bg-amber-500/20 text-amber-400",
        info: "bg-sky-500/20 text-sky-400",
        purple: "bg-violet-500/20 text-violet-400",
        pink: "bg-pink-500/20 text-pink-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
