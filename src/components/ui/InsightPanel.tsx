interface Insight {
  text: string;
  type?: "info" | "warning" | "positive";
}

interface InsightPanelProps {
  insights: Insight[];
  title?: string;
  period?: string;
}

const typeStyles = {
  info: "text-blue-700 bg-blue-50 border-blue-100",
  warning: "text-amber-700 bg-amber-50 border-amber-100",
  positive: "text-green-700 bg-green-50 border-green-100",
};

const typeIcons = {
  info: "ℹ",
  warning: "⚠",
  positive: "✓",
};

export default function InsightPanel({ insights, title = "자동 인사이트", period }: InsightPanelProps) {
  if (!insights.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {period && (
          <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 whitespace-nowrap">
            {period}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {insights.map((insight, i) => {
          const t = insight.type ?? "info";
          return (
            <li
              key={i}
              className={`flex gap-2 text-sm px-3 py-2 rounded border ${typeStyles[t]}`}
            >
              <span className="shrink-0 font-mono">{typeIcons[t]}</span>
              <span>{insight.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
