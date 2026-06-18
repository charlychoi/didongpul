"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export default function TimeCharts({
  hourData,
  heatmapData,
  hours,
  weekdays,
}: {
  hourData: { hour: string; count: number }[];
  heatmapData: Record<string, number>;
  hours: number[];
  weekdays: string[];
}) {
  const maxVal = Math.max(...Object.values(heatmapData), 1);

  const getColor = (val: number) => {
    const ratio = val / maxVal;
    if (ratio === 0) return "#f9fafb";
    if (ratio < 0.2) return "#dbeafe";
    if (ratio < 0.4) return "#93c5fd";
    if (ratio < 0.6) return "#3b82f6";
    if (ratio < 0.8) return "#1d4ed8";
    return "#1e3a8a";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">시간대별 입장자 수</h3>
        {hourData.every((d) => d.count === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hourData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="방문자수" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">요일 × 시간대 히트맵</h3>
        {Object.values(heatmapData).every((v) => v === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="w-8 text-gray-500 font-normal pr-2 text-right">요일</th>
                  {hours.map((h) => (
                    <th key={h} className="w-8 text-center text-gray-400 font-normal pb-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <tr key={wd}>
                    <td className="pr-2 text-right text-gray-500 font-medium py-0.5">
                      {WEEKDAY_NAMES[wd]}
                    </td>
                    {hours.map((h) => {
                      const val = heatmapData[`${wd}_${h}`] ?? 0;
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            className="w-7 h-7 rounded flex items-center justify-center text-[9px]"
                            style={{ backgroundColor: getColor(val) }}
                            title={`${WEEKDAY_NAMES[wd]}요일 ${h}시: ${val}명`}
                          >
                            {val > 0 && (
                              <span className={val / maxVal > 0.4 ? "text-white" : "text-gray-600"}>
                                {val > 999 ? "1k+" : val > 0 ? val : ""}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 mt-3 justify-end">
              <span className="text-xs text-gray-400">낮음</span>
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((r, i) => (
                <div key={i} className="w-4 h-4 rounded" style={{ backgroundColor: getColor(r * maxVal) }} />
              ))}
              <span className="text-xs text-gray-400">높음</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
