const CENTER_ORDER = ["강동센터", "도봉센터", "동대문센터"];

interface CenterStats {
  center: string;
  visitCount: number;
  latestVisit: string | null;
  surveyCount: number;
  educationCount: number;
}

interface Props {
  stats: CenterStats[];
}

export default function SyncedDataPanel({ stats }: Props) {
  const total = stats.reduce(
    (acc, s) => ({
      visits: acc.visits + s.visitCount,
      surveys: acc.surveys + s.surveyCount,
      education: acc.education + s.educationCount,
    }),
    { visits: 0, surveys: 0, education: 0 as number }
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900">DB 저장 현황</h3>
      </div>

      <div className="space-y-3">
        {CENTER_ORDER.map((centerName) => {
          const s = stats.find((x) => x.center === centerName);
          if (!s) return (
            <div key={centerName} className="rounded-md bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">{centerName}</p>
              <p className="text-xs text-gray-400">데이터 없음</p>
            </div>
          );
          return (
            <div key={centerName} className="rounded-md bg-indigo-50 border border-indigo-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-indigo-900">{s.center}</p>
                {s.latestVisit && (
                  <p className="text-xs text-indigo-400">
                    최근 {s.latestVisit.slice(0, 10)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-base font-bold text-indigo-700">{s.visitCount.toLocaleString()}</p>
                  <p className="text-xs text-indigo-400">방문</p>
                </div>
                <div>
                  <p className="text-base font-bold text-indigo-700">{s.surveyCount.toLocaleString()}</p>
                  <p className="text-xs text-indigo-400">설문</p>
                </div>
                <div>
                  <p className="text-base font-bold text-indigo-700">{s.educationCount.toLocaleString()}</p>
                  <p className="text-xs text-indigo-400">교육</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="grid grid-cols-3 gap-1 text-center">
          <div>
            <p className="text-sm font-bold text-gray-800">{total.visits.toLocaleString()}</p>
            <p className="text-xs text-gray-400">총 방문</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">{total.surveys.toLocaleString()}</p>
            <p className="text-xs text-gray-400">총 설문</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">{total.education.toLocaleString()}</p>
            <p className="text-xs text-gray-400">총 교육</p>
          </div>
        </div>
      </div>
    </div>
  );
}

