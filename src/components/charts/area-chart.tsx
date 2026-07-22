"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

interface AreaChartProps {
  data: any[];
  dataKey: string;
  xKey: string;
  color?: string;
  height?: number;
  gradientId?: string;
  className?: string;
}

export function ChartArea({
  data,
  dataKey,
  xKey,
  color = "#3b82f6",
  height = 300,
  gradientId = "areaGradient",
  className,
}: AreaChartProps) {
  return (
    <div style={{ width: "100%", height }} className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey={xKey}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
            tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
          />
          <YAxis
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
            tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#000",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              color: "#fff",
            }}
            itemStyle={{ color: "#fff" }}
            labelStyle={{ color: "rgba(255,255,255,0.7)" }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
