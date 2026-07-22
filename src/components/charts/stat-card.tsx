"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  icon: LucideIcon;
  trend: "up" | "down" | "neutral";
  changeLabel?: string;
  className?: string;
}

function useCountUp(end: number, duration: number = 1200) {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.floor(eased * end));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [end, duration]);

  return current;
}

const trendConfig = {
  up: { icon: ArrowUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  down: { icon: ArrowDown, color: "text-red-400", bg: "bg-red-400/10" },
  neutral: { icon: ArrowRight, color: "text-yellow-400", bg: "bg-yellow-400/10" },
};

export function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
  changeLabel,
  className,
}: StatCardProps) {
  const numericValue =
    typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) || 0 : value;
  const displayValue = typeof value === "string" && isNaN(Number(value)) ? value : useCountUp(numericValue);

  const TrendIcon = trendConfig[trend].icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className={cn("glass-card p-5 relative overflow-hidden", className)}>
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm text-white/50 font-medium">{title}</p>
          <div className="w-9 h-9 rounded-full glass-card flex items-center justify-center">
            <Icon className="w-4 h-4 text-white/70" />
          </div>
        </div>

        <div className="text-3xl font-bold text-white mb-2 tabular-nums">
          {typeof displayValue === "number" ? displayValue.toLocaleString() : displayValue}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
              trendConfig[trend].bg,
              trendConfig[trend].color
            )}
          >
            <TrendIcon className="w-3 h-3" />
            {change}
          </span>
          {changeLabel && (
            <span className="text-xs text-white/40">{changeLabel}</span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
