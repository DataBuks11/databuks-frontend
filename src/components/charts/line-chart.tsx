"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

interface LineChartProps {
  data: any[];
  dataKey: string;
  xKey: string;
  color?: string;
  height?: number;
  className?: string;
}

export function ChartLine({
  data,
  dataKey,
  xKey,
  color = "#3b82f6",
  height = 300,
  className,
}: LineChartProps) {
  return (
    <div style={{ width: "100%", height }} className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
