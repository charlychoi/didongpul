import { cn } from "@/lib/cn";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: "blue" | "green" | "amber" | "red" | "purple" | "gray";
  icon?: React.ReactNode;
  trend?: { pct: number; label: string };
}

const colorMap = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-green-50 text-green-700 border-green-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  red: "bg-red-50 text-red-700 border-red-100",
  purple: "bg-purple-50 text-purple-700 border-purple-100",
  gray: "bg-gray-50 text-gray-700 border-gray-100",
};

export default function KpiCard({
  title,
  value,
  subtitle,
  color = "blue",
  icon,
  trend,
}: KpiCardProps) {
  const trendUp = trend && trend.pct > 0;
  const trendDown = trend && trend.pct < 0;
  const trendNeutral = trend && trend.pct === 0;

  return (
    <div className={cn("rounded-lg border p-4", colorMap[color])}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium opacity-80">{title}</p>
        {icon && <span className="opacity-60">{icon}</span>}
      </div>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1">
        {subtitle && <p className="text-xs opacity-70">{subtitle}</p>}
        {trend && (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              trendUp && "text-emerald-600",
              trendDown && "text-red-500",
              trendNeutral && "opacity-50"
            )}
          >
            {trendUp && "▲ "}
            {trendDown && "▼ "}
            {Math.abs(trend.pct).toFixed(1)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
