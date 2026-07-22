import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all duration-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "liquid-glass text-white hover:bg-white/[0.06]",
        destructive:
          "bg-red-500/20 text-red-300 hover:bg-red-500/30",
        outline:
          "liquid-glass text-white/80 hover:text-white hover:bg-white/[0.04]",
        secondary:
          "bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white",
        ghost: "text-white/50 hover:text-white hover:bg-white/[0.03]",
        link: "text-blue-400 underline-offset-4 hover:underline",
        primary:
          "bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400",
        glass:
          "liquid-glass text-white hover:bg-white/[0.06]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
        pill: "h-10 px-6 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
